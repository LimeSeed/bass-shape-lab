import workletUrl from './processor.js?worker&url';

export interface AudioParams {
  speed: number;
  pitch: number;
  loop: boolean;
  a: number;
  b: number;
  gap: number;
}

type PositionMessage = { type: string; position: number; active: boolean;
  waiting: boolean; sequence: number; contextTime: number; message?: string };

/** Local-only audio engine. Merely constructing it never starts audio. */
export class AudioEngine {
  private ctx?: AudioContext;
  private node?: AudioWorkletNode;
  private init?: Promise<void>;
  private filters?: [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode];
  private gain?: GainNode;
  private bufferDuration = 0;
  private current = 0;
  private isPlaying = false;
  private waiting = false;
  private reportedAt = 0;
  private sequence = 0;
  private playGeneration = 0;
  private disposed = false;
  private audioParams: AudioParams = { speed: 1, pitch: 0, loop: false, a: 0, b: 0, gap: 0 };
  private eq: [number, number, number] = [0, 0, 0];
  private volume = 0.8;
  private headroom = 1;
  private suspendTimer?: ReturnType<typeof setTimeout>;
  onError?: (message: string) => void;
  onEnded?: () => void;
  /** Available for automated render-clock measurements, never sent off device. */
  onLoop?: (contextTime: number) => void;

  constructor(context?: AudioContext) { this.ctx = context; }

  get context(): AudioContext {
    if (this.disposed) throw new Error('音频引擎已关闭，请刷新页面。');
    if (!this.ctx) {
      if (!window.AudioContext) throw new Error('当前浏览器不支持 Web Audio，请使用新版浏览器。');
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
    }
    return this.ctx;
  }

  get output(): GainNode | undefined { return this.gain; }
  get duration(): number { return this.bufferDuration; }
  get playing(): boolean { return this.isPlaying; }
  get position(): number {
    let result = this.current;
    if (this.isPlaying && !this.waiting && this.ctx?.state === 'running') {
      result += Math.max(0, this.ctx.currentTime - this.reportedAt) * this.audioParams.speed;
    }
    const end = this.audioParams.loop && this.audioParams.b > this.audioParams.a
      ? this.audioParams.b : this.bufferDuration;
    return Math.max(0, Math.min(end, result));
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    try { return await this.context.decodeAudioData(data); }
    catch { throw new Error('浏览器无法解码这个文件。请尝试 WAV、MP3 或本机浏览器支持的 FLAC；视频必须包含可解码的音轨。'); }
  }

  private async prepare(): Promise<void> {
    if (this.init) return this.init;
    this.init = (async () => {
      const ctx = this.context;
      if (!ctx.audioWorklet || !window.isSecureContext) {
        throw new Error('独立变速变调需要 AudioWorklet，请通过 HTTPS 或 localhost 打开。');
      }
      await ctx.audioWorklet.addModule(workletUrl);
      if (this.disposed) return;
      const node = new AudioWorkletNode(ctx, 'bass-stretch', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      });
      this.node = node;
      this.filters = [ctx.createBiquadFilter(), ctx.createBiquadFilter(), ctx.createBiquadFilter()];
      const [low, mid, high] = this.filters;
      low.type = 'lowshelf'; low.frequency.value = 120;
      mid.type = 'peaking'; mid.frequency.value = 800; mid.Q.value = 0.7;
      high.type = 'highshelf'; high.frequency.value = 3000;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      node.connect(low).connect(mid).connect(high).connect(this.gain).connect(ctx.destination);
      this.setEQ(this.eq);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('音频处理器初始化超时，请刷新页面后重试。')), 12000);
        node.port.onmessage = ({ data }) => {
          if (data.type === 'ready') { clearTimeout(timeout); resolve(); }
          if (data.type === 'error') {
            clearTimeout(timeout); reject(new Error(data.message));
            this.onError?.(data.message);
          }
          if (data.type === 'loop') this.onLoop?.(data.contextTime);
          if (data.type === 'position') this.receivePosition(data);
        };
        node.onprocessorerror = () => {
          this.isPlaying = false;
          this.onError?.('音频处理器停止工作，请重新导入文件或刷新页面。');
        };
      });
    })().catch(error => { this.init = undefined; throw error; });
    return this.init;
  }

  private receivePosition(data: PositionMessage): void {
    if (data.sequence !== this.sequence) return;
    const wasPlaying = this.isPlaying;
    this.current = data.position;
    this.waiting = data.waiting;
    this.reportedAt = data.contextTime;
    this.isPlaying = data.active;
    if (wasPlaying && !data.active && data.position >= this.duration - 0.001) this.onEnded?.();
  }

  async load(buffer: AudioBuffer): Promise<void> {
    this.pause();
    clearTimeout(this.suspendTimer);
    await this.prepare();
    if (this.disposed) return;
    this.current = 0;
    this.bufferDuration = buffer.duration;
    this.reportedAt = this.context.currentTime;
    const channels = Array.from({length: Math.min(2, buffer.numberOfChannels)}, (_, c) => buffer.getChannelData(c).slice());
    this.node!.port.postMessage({type: 'load', channels, sequence: ++this.sequence}, channels.map(c => c.buffer));
    this.node!.port.postMessage({type: 'params', params: this.audioParams});
  }

  async play(): Promise<void> {
    const generation = ++this.playGeneration;
    clearTimeout(this.suspendTimer);
    // Resume is called before awaiting module creation to preserve user activation.
    const resume = this.context.resume();
    await this.prepare();
    await resume;
    if (generation !== this.playGeneration || this.disposed || !this.duration) return;
    let position = this.position;
    const {loop, a, b} = this.audioParams;
    if (position >= this.duration || (loop && b > a && (position < a || position >= b))) position = loop ? a : 0;
    this.current = position;
    this.isPlaying = true;
    this.waiting = false;
    this.reportedAt = this.context.currentTime;
    this.node!.port.postMessage({type: 'transport', active: true, position, sequence: ++this.sequence});
    this.ramp(this.volume * this.headroom);
  }

  pause(): void {
    ++this.playGeneration;
    this.current = this.position;
    this.isPlaying = false;
    this.waiting = false;
    this.reportedAt = this.ctx?.currentTime ?? 0;
    this.ramp(0);
    // The render-thread 6ms edge ramp and output gain ramp prevent hard clicks.
    this.node?.port.postMessage({type: 'transport', active: false, position: this.current, sequence: ++this.sequence});
    clearTimeout(this.suspendTimer);
    if (this.ctx) this.suspendTimer = setTimeout(() => { if (!this.isPlaying && !this.disposed) void this.ctx?.suspend(); }, 180);
  }

  async seek(seconds: number): Promise<void> {
    this.current = Math.max(0, Math.min(this.duration, Number.isFinite(seconds) ? seconds : 0));
    this.waiting = false;
    this.reportedAt = this.ctx?.currentTime ?? 0;
    this.node?.port.postMessage({type:'transport', position:this.current, active:this.isPlaying, sequence:++this.sequence});
  }

  setParams(values: Partial<AudioParams>): void {
    this.current = this.position;
    this.reportedAt = this.ctx?.currentTime ?? 0;
    const next = {...this.audioParams, ...values};
    next.speed = Math.max(0.25, Math.min(1.5, Number.isFinite(next.speed) ? next.speed : 1));
    next.pitch = Math.max(-24, Math.min(36, Number.isFinite(next.pitch) ? next.pitch : 0));
    next.a = Math.max(0, Math.min(this.duration, next.a));
    next.b = Math.max(next.a, Math.min(this.duration, next.b));
    next.gap = Math.max(0, Math.min(10, Number.isFinite(next.gap) ? next.gap : 0));
    this.audioParams = next;
    this.node?.port.postMessage({type:'params', params:next});
  }

  setEQ(values: [number, number, number]): void {
    this.eq = values.map(v => Math.max(-12, Math.min(12, v))) as [number,number,number];
    this.headroom = 10 ** (-this.eq.reduce((sum, value) => sum + Math.max(0, value), 0) / 20);
    this.filters?.forEach((node, i) => node.gain.setTargetAtTime(this.eq[i], this.context.currentTime, 0.02));
    if (this.playing) this.ramp(this.volume * this.headroom);
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.playing) this.ramp(this.volume * this.headroom);
  }

  private ramp(value: number): void {
    if (!this.gain || !this.ctx) return;
    const param = this.gain.gain;
    param.cancelScheduledValues(this.ctx.currentTime);
    param.setValueAtTime(param.value, this.ctx.currentTime);
    param.linearRampToValueAtTime(value, this.ctx.currentTime + 0.008);
  }

  async dispose(): Promise<void> {
    this.pause();
    clearTimeout(this.suspendTimer);
    this.disposed = true;
    this.node?.port.postMessage({type:'dispose'});
    this.node?.disconnect();
    this.node?.port.close();
    this.filters?.forEach(node => node.disconnect());
    this.gain?.disconnect();
    this.node = undefined;
    this.filters = undefined;
    this.bufferDuration = 0;
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
  }
}
