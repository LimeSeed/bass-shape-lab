/* Local transport for Signalsmith Stretch. All timing is counted on the audio
 * render thread; pitch and tempo are independent DSP parameters. */
import SignalsmithModule from './signalsmith-core.js';

class BassStretchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.active = false;
    this.position = 0;
    this.duration = 0;
    this.params = { speed: 1, pitch: 0, loop: false, a: 0, b: 0, gap: 0 };
    this.audio = [];
    this.gapFrames = 0;
    this.fade = 0;
    this.last = [0, 0];
    this.tail = [0, 0];
    this.tailFrames = 0;
    this.sequence = 0;
    this.reportCounter = 0;
    this.disposed = false;
    const pending = [];
    this.port.onmessage = ({data}) => pending.push(data);
    SignalsmithModule().then(module => {
      this.module = module;
      module._presetDefault(2, sampleRate);
      this.inputLatency = module._inputLatency();
      this.outputLatency = module._outputLatency();
      this.bufferLength = this.inputLatency + this.outputLatency;
      const pointer = module._setBuffers(2, this.bufferLength);
      this.inPointers = [pointer, pointer + this.bufferLength * 4];
      this.outPointers = [pointer + this.bufferLength * 8, pointer + this.bufferLength * 12];
      this.ready = true;
      this.port.onmessage = ({data}) => this.command(data);
      pending.forEach(data => this.command(data));
      this.port.postMessage({type: 'ready', latency: this.bufferLength / sampleRate});
    }).catch(error => this.port.postMessage({type: 'error', message: String(error)}));
  }

  reset(preserveTail = true) {
    this.tail = preserveTail ? this.last.slice() : [0, 0];
    this.tailFrames = preserveTail ? Math.round(sampleRate * 0.006) : 0;
    this.module._reset();
    this.fade = Math.round(sampleRate * 0.006);
  }

  command(data) {
    if (data.type === 'dispose') {
      this.audio = [];
      this.active = false;
      this.disposed = true;
      return;
    }
    if (data.type === 'load') {
      this.audio = data.channels;
      this.duration = this.audio[0].length / sampleRate;
      this.position = 0;
      this.active = false;
      this.gapFrames = 0;
      this.sequence = data.sequence;
      this.reset();
    } else if (data.type === 'transport') {
      this.sequence = data.sequence;
      if (typeof data.position === 'number') {
        this.position = Math.max(0, Math.min(this.duration, data.position));
        this.gapFrames = 0;
        this.reset();
      }
      if (typeof data.active === 'boolean') {
        if (this.active !== data.active) this.reset();
        this.active = data.active;
      }
    } else if (data.type === 'params') {
      const wasTransparent = this.params.speed === 1 && this.params.pitch === 0;
      Object.assign(this.params, data.params);
      this.gapFrames = 0;
      const transparent = this.params.speed === 1 && this.params.pitch === 0;
      if (wasTransparent !== transparent) this.reset();
      const {loop, a, b} = this.params;
      if (loop && b > a && (this.position < a || this.position >= b)) {
        this.position = a;
        this.reset();
      }
    }
    this.report();
  }

  report() {
    this.port.postMessage({type: 'position', position: this.position,
      active: this.active, waiting: this.gapFrames > 0,
      sequence: this.sequence, contextTime: currentTime });
  }

  render(outputs, offset, count, end) {
    const m = this.module;
    const { speed, pitch, loop, a } = this.params;
    const transparent = speed === 1 && pitch === 0;
    // Match the official buffer-mode latency compensation. A seek feeds a
    // complete analysis window before the requested output position.
    const inputEnd = Math.round(this.position * sampleRate + this.outputLatency * speed + this.inputLatency);
    const inputStart = inputEnd - this.bufferLength;
    const lower = loop ? Math.floor(a * sampleRate) : 0;
    const upper = Math.min(this.audio[0].length, Math.ceil(end * sampleRate));
    if (!transparent) {
      m._setTransposeSemitones(pitch, 8000 / sampleRate);
      for (let c = 0; c < 2; c++) {
        const target = new Float32Array(m.HEAP8.buffer, this.inPointers[c], this.bufferLength);
        target.fill(0);
        const from = Math.max(lower, inputStart);
        const to = Math.min(upper, inputEnd);
        if (to > from) target.set(this.audio[c % this.audio.length].subarray(from, to), from - inputStart);
      }
      m._seek(this.bufferLength, speed);
      m._process(0, count);
    }
    for (let c = 0; c < outputs.length; c++) {
      const source = transparent ? this.audio[c % this.audio.length]
        : new Float32Array(m.HEAP8.buffer, this.outPointers[c % 2], count);
      for (let i = 0; i < count; i++) {
        const remaining = (end - this.position) * sampleRate / speed - i;
        const attack = Math.min(1, (Math.round(sampleRate * 0.006) - this.fade + i) / (sampleRate * 0.006));
        const release = Math.min(1, Math.max(0, remaining / (sampleRate * 0.006)));
        let value = source[i];
        if (transparent) {
          // True original playback: do not send neutral settings through a
          // phase vocoder. Fractional seeks use linear sample interpolation.
          const index = this.position * sampleRate + i;
          const integer = Math.floor(index);
          const fraction = index - integer;
          const left = integer >= lower && integer < upper ? source[integer] : 0;
          const right = integer + 1 >= lower && integer + 1 < upper ? source[integer + 1] : 0;
          value = left + (right - left) * fraction;
        }
        const sample = value * Math.max(0, attack) * release;
        outputs[c][offset + i] = Number.isFinite(sample) ? sample : 0;
      }
    }
    this.fade = Math.max(0, this.fade - count);
  }

  process(_inputs, outputList) {
    const outputs = outputList[0];
    outputs.forEach(channel => channel.fill(0));
    if (this.disposed) return false;
    if (!this.ready || !this.audio.length) return true;
    if (!this.active) {
      this.finishEdges(outputs);
      return true;
    }
    const {speed, loop, a, b, gap} = this.params;
    const end = loop && b > a ? Math.min(b, this.duration) : this.duration;
    const shouldLoop = loop && b > a;
    let offset = 0;
    const length = outputs[0].length;
    while (offset < length && this.active) {
      if (this.gapFrames > 0) {
        const count = Math.min(length - offset, this.gapFrames);
        offset += count;
        this.gapFrames -= count;
        continue;
      }
      if (this.position >= end - 1e-9) {
        if (shouldLoop) {
          this.position = Math.max(0, a);
          this.gapFrames = Math.round(gap * sampleRate);
          this.reset(false);
          this.port.postMessage({type:'loop', contextTime:currentTime + offset / sampleRate});
          continue;
        }
        this.position = this.duration;
        this.active = false;
        this.report();
        break;
      }
      const count = Math.min(length - offset, Math.max(1, Math.ceil((end - this.position) * sampleRate / speed)));
      this.render(outputs, offset, count, end);
      this.position = Math.min(end, this.position + count * speed / sampleRate);
      offset += count;
    }
    this.reportCounter += length;
    if (this.reportCounter >= sampleRate / 30) {
      this.reportCounter = 0;
      this.report();
    }
    this.finishEdges(outputs);
    return true;
  }

  finishEdges(outputs) {
    // Smooth a discontinuity (pause/seek/reset) from the previous sample to
    // silence while the fresh DSP state fades in. This retains no old buffers.
    const fadeLength = Math.round(sampleRate * 0.006);
    const length = outputs[0].length;
    for (let c = 0; c < outputs.length; c++) {
      for (let i = 0; i < Math.min(length, this.tailFrames); i++) {
        outputs[c][i] += this.tail[c % 2] * (this.tailFrames - i) / fadeLength;
      }
      this.last[c] = outputs[c][length - 1];
    }
    this.tailFrames = Math.max(0, this.tailFrames - length);
  }
}

registerProcessor('bass-stretch', BassStretchProcessor);
