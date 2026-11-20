import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import './waveform.css';

export interface WaveformProps {
  buffer: AudioBuffer | null;
  position: number;
  a: number;
  b: number;
  loop: boolean;
  regionLabel?: string;
  hasRegion?: boolean;
  pendingMarker?: number | null;
  markers: { id: string; time: number; label: string; end?: number }[];
  onMarkerChange?: (id: string, start: number, end: number) => void;
  onMarkerSelect?: (id: string) => void;
  cueMarkers?: { id: string; time: number; label: string }[];
  onCueSelect?: (id: string) => void;
  onCueMove?: (id: string, time: number) => void;
  onBlankClick?: (time: number) => void;
  onSeek: (time: number) => void;
  onPlayFrom: (time: number) => void;
  onRegion: (a: number, b: number, kind?: 'create' | 'resize' | 'move') => void;
}

type DragMode = 'create' | 'a' | 'b' | 'move' | 'seek' | 'pan' | 'cue';
type Drag = { mode: DragMode; startX: number; lastX: number; startScroll: number; time: number; a: number; b: number; moved: boolean; cueId?: string };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const rounded = (n: number) => Math.round(n * 1000) / 1000;
const timeLabel = (time: number, fine = false) => {
  const minutes = Math.floor(Math.max(0, time) / 60);
  const seconds = Math.max(0, time) % 60;
  return `${minutes}:${(fine ? seconds.toFixed(2) : Math.floor(seconds).toString()).padStart(fine ? 5 : 2, '0')}`;
};

/** Only the visible pixels are drawn. Peaks are cached once per decoded buffer. */
export function Waveform({ buffer, position, a, b, loop, regionLabel = '', hasRegion = true, pendingMarker = null, markers, onMarkerSelect, cueMarkers = [], onCueSelect, onCueMove, onBlankClick, onSeek, onPlayFrom, onRegion }: WaveformProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const frameRef = useRef<number | null>(null);
  const applyDragRef = useRef<(x: number) => void>(() => {});
  const [panView, setPanView] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(900);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [themeRevision, setThemeRevision] = useState(0);
  const duration = buffer?.duration || 1;
  const totalWidth = Math.max(1, width * zoom);
  const pxPerSecond = totalWidth / duration;
  const minSpan = Math.min(0.05, duration);
  const regionA = clamp(a, 0, duration);
  const regionB = clamp(b, regionA, duration);
  const pending = pendingMarker !== null && Number.isFinite(pendingMarker) ? clamp(pendingMarker, 0, duration) : null;
  const hasCurrentRegion = !!buffer && hasRegion && pending === null && regionB > regionA;
  const waveTop = 29;
  const height = 252;
  const savedRegions = useMemo(() => {
    const ends: number[] = [];
    return markers.map(marker => {
      const start = clamp(Number.isFinite(marker.time) ? marker.time : 0, 0, duration - minSpan);
      const end = clamp(Number.isFinite(marker.end) ? marker.end! : start + 2, start + minSpan, duration);
      return { ...marker, start, end };
    }).sort((x, y) => x.start - y.start || x.end - y.end).map(marker => {
      let lane = ends.findIndex(end => end <= marker.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = marker.end;
      return { ...marker, lane: lane % 6 };
    });
  }, [markers, duration, minSpan]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const peaks = useMemo(() => {
    if (!buffer) return null;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    const block = 256;
    const count = Math.ceil(buffer.length / block);
    const low = new Float32Array(count);
    const high = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let min = 0;
      let max = 0;
      const end = Math.min((i + 1) * block, buffer.length);
      for (const data of channels) {
        for (let j = i * block; j < end; j++) {
          const value = data[j];
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
      low[i] = min;
      high[i] = max;
    }
    return { channels, low, high, block };
  }, [buffer]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeRevision(n => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setThemeRevision(n => n + 1);
    media.addEventListener('change', update);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  }, []);

  useEffect(() => {
    setZoom(1);
    setScrollLeft(0);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [buffer]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const style = getComputedStyle(canvas);
    const accent = style.getPropertyValue('--accent').trim() || '#48d9c0';
    const line = style.getPropertyValue('--line').trim() || '#303b45';
    const muted = style.getPropertyValue('--muted').trim() || '#a8b1bd';
    const center = 145;
    const amplitude = 78;
    ctx.clearRect(0, 0, width, height);
    ctx.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.textBaseline = 'top';
    const visibleSeconds = width / pxPerSecond;
    const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200];
    const tick = steps.find(step => step >= visibleSeconds / Math.max(2, width / 88)) || 3600;
    const from = scrollLeft / pxPerSecond;
    const to = (scrollLeft + width) / pxPerSecond;
    for (let t = Math.ceil(from / tick) * tick; t <= Math.min(to, duration); t += tick) {
      const x = t * pxPerSecond - scrollLeft;
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, 28); ctx.lineTo(x + 0.5, height); ctx.stroke();
      ctx.fillStyle = muted;
      ctx.fillText(timeLabel(t, tick < 1), x + 6, 9);
    }
    ctx.strokeStyle = line;
    ctx.beginPath(); ctx.moveTo(0, center + 0.5); ctx.lineTo(width, center + 0.5); ctx.stroke();
    if (!buffer || !peaks) return;
    const samplesPerPixel = buffer.length / totalWidth;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const start = Math.max(0, Math.floor((scrollLeft + x) * samplesPerPixel));
      const end = Math.min(buffer.length, Math.max(start + 1, Math.ceil((scrollLeft + x + 1) * samplesPerPixel)));
      let min = 0;
      let max = 0;
      if (samplesPerPixel < peaks.block) {
        for (const data of peaks.channels) {
          for (let i = start; i < end; i++) { min = Math.min(min, data[i]); max = Math.max(max, data[i]); }
        }
      } else {
        for (let i = Math.floor(start / peaks.block); i < Math.ceil(end / peaks.block); i++) {
          min = Math.min(min, peaks.low[i] || 0);
          max = Math.max(max, peaks.high[i] || 0);
        }
      }
      ctx.moveTo(x + 0.5, center - Math.max(0.8, max * amplitude));
      ctx.lineTo(x + 0.5, center - Math.min(-0.8, min * amplitude));
    }
    ctx.stroke();
  }, [buffer, peaks, width, totalWidth, duration, pxPerSecond, scrollLeft, themeRevision, height]);

  function timeAt(clientX: number) {
    const scroll = scrollRef.current;
    if (!scroll) return 0;
    return clamp((clientX - scroll.getBoundingClientRect().left + scroll.scrollLeft) / pxPerSecond, 0, duration);
  }

  function changeZoom(next: number, anchor = position) {
    const scroll = scrollRef.current;
    const safe = clamp(next, 1, 64);
    const previousX = anchor * pxPerSecond - (scroll?.scrollLeft || 0);
    setZoom(safe);
    requestAnimationFrame(() => {
      if (!scroll) return;
      scroll.scrollLeft = clamp(anchor * width * safe / duration - previousX, 0, width * (safe - 1));
      setScrollLeft(scroll.scrollLeft);
    });
  }

  function cancelDrag() {
    dragRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }

  function applyDrag(clientX: number) {
    const drag = dragRef.current;
    if (!drag?.moved) return;
    const scroll = scrollRef.current;
    if (drag.mode === 'pan') {
      if (scroll) scroll.scrollLeft = drag.startScroll + drag.startX - clientX;
      return;
    }
    const time = timeAt(clientX);
    const bounded = (n: number) => clamp(rounded(n), 0, duration);
    if (drag.mode === 'seek') onSeek(time);
    if (drag.mode === 'cue' && drag.cueId) onCueMove?.(drag.cueId, bounded(drag.a + time - drag.time));
    if (drag.mode === 'a') onRegion(bounded(clamp(drag.a + time - drag.time, 0, drag.b - minSpan)), drag.b, 'resize');
    if (drag.mode === 'b') onRegion(drag.a, bounded(clamp(drag.b + time - drag.time, drag.a + minSpan, duration)), 'resize');
    if (drag.mode === 'move') {
      const length = drag.b - drag.a;
      const start = clamp(drag.a + time - drag.time, 0, duration - length);
      onRegion(bounded(start), bounded(start + length), 'move');
    }
    if (drag.mode === 'create' && Math.abs(time - drag.time) >= minSpan) {
      onRegion(bounded(Math.min(time, drag.time)), bounded(Math.max(time, drag.time)), 'create');
    }
  }
  applyDragRef.current = applyDrag;

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!buffer || ![0, 1].includes(event.button)) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-saved-entry]')) return;
    const explicit = target.closest<HTMLElement>('[data-drag]')?.dataset.drag as DragMode | undefined;
    const cueId = target.closest<HTMLElement>('[data-cue]')?.dataset.cue;
    const cue = cueId ? cueMarkers.find(marker => marker.id === cueId) : undefined;
    const mode: DragMode = event.button === 1 || event.shiftKey ? 'pan' : explicit || (panView ? 'pan' : 'create');
    cancelDrag();
    dragRef.current = { mode, startX: event.clientX, lastX: event.clientX, startScroll: scrollRef.current?.scrollLeft || 0,
      time: timeAt(event.clientX), a: cue ? clamp(cue.time, 0, duration) : regionA, b: regionB, moved: false, cueId };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    let previous = performance.now();
    const tick = (now: number) => {
      const drag = dragRef.current;
      const scroll = scrollRef.current;
      if (!drag || !scroll) { frameRef.current = null; return; }
      if (drag.moved && drag.mode !== 'pan') {
        const rect = scroll.getBoundingClientRect();
        const edge = 34;
        const left = clamp((rect.left + edge - drag.lastX) / edge, 0, 1);
        const right = clamp((drag.lastX - rect.right + edge) / edge, 0, 1);
        const delta = (right - left) * 650 * Math.min((now - previous) / 1000, 0.04);
        if (delta) {
          const before = scroll.scrollLeft;
          scroll.scrollLeft += delta;
          if (scroll.scrollLeft !== before) applyDragRef.current(drag.lastX);
        }
      }
      previous = now;
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    drag.lastX = event.clientX;
    if (Math.abs(event.clientX - drag.startX) >= 4) drag.moved = true;
    applyDrag(event.clientX);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && (drag.mode === 'create' || (drag.mode === 'pan' && event.button === 0 && !event.shiftKey))) {
      const time = timeAt(event.clientX);
      const y = event.clientY - (innerRef.current?.getBoundingClientRect().top ?? event.clientY);
      const hit = y >= waveTop ? savedRegions.filter(marker => time >= marker.start && time <= marker.end)
        .sort((x, y) => (x.end - x.start) - (y.end - y.start) || y.start - x.start)[0] : undefined;
      if (hit && onMarkerSelect) onMarkerSelect(hit.id);
      else (onBlankClick ?? onSeek)(time);
    }
    if (!drag.moved && drag.mode === 'seek') onSeek(timeAt(event.clientX));
    if (!drag.moved && drag.mode === 'cue' && drag.cueId) { if (onCueSelect) onCueSelect(drag.cueId); else onSeek(drag.a); }
    cancelDrag();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cueKey(event: KeyboardEvent, id: string, time: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing || event.defaultPrevented) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation(); onCueSelect?.(id); return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 0.01 : 0.1);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? duration : time + delta;
    onCueMove?.(id, clamp(rounded(next), 0, duration));
  }

  function handleKey(event: KeyboardEvent, mode: 'a' | 'b' | 'seek') {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing || event.defaultPrevented) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    let next = mode === 'a' ? regionA : mode === 'b' ? regionB : position;
    next += (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 0.01 : 0.1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = duration;
    if (mode === 'a') onRegion(rounded(clamp(next, 0, regionB - minSpan)), regionB, 'resize');
    if (mode === 'b') onRegion(regionA, rounded(clamp(next, regionA + minSpan, duration)), 'resize');
    if (mode === 'seek') onSeek(clamp(next, 0, duration));
  }

  return <section className="waveform" aria-label="音频波形工作区">
    <div className="wave-toolbar">
      <div className="wave-title"><span>波形</span></div>
      <div className="wave-zoom">
        <label htmlFor="wave-zoom">缩放</label>
        <input id="wave-zoom" aria-label="波形缩放" type="range" min="0" max="6" step="0.1" value={Math.log2(zoom)} disabled={!buffer} onChange={event => changeZoom(2 ** Number(event.target.value))} />
        <span className="wave-zoom-value">{zoom.toFixed(1)}×</span>
        <button type="button" className={`wave-pan-toggle ${panView ? 'is-active' : ''}`} disabled={!buffer} aria-label="拖动视图" aria-pressed={panView} title="拖动视图" onClick={() => setPanView(value => !value)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 11V5a2 2 0 0 1 4 0v6M11 10V3a2 2 0 0 1 4 0v8M15 10V5a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2"/></svg>
          <span>拖动视图</span>
        </button>
      </div>
    </div>
    <div ref={scrollRef} className="wave-scroll" data-testid="waveform-scroll" onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}>
      <div ref={innerRef} className={`wave-inner ${panView ? 'is-panning' : ''}`} data-testid="waveform" style={{ width: totalWidth, height }}
        onPointerDown={startDrag} onPointerMove={updateDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onAuxClick={event => { if (event.button === 1) event.preventDefault(); }}
        onDoubleClick={event => { if (buffer && !(event.target as HTMLElement).closest('[data-saved-entry],[data-cue]')) { event.preventDefault(); onPlayFrom(timeAt(event.clientX)); } }}>
        <canvas ref={canvasRef} className="wave-canvas" data-testid="waveform-canvas" style={{ width, height }} aria-hidden="true" />
        {buffer && savedRegions.map(marker => <div key={marker.id} className="wave-saved-region" data-testid={`saved-region-${marker.id}`} style={{ top: waveTop, left: marker.start * pxPerSecond, width: (marker.end - marker.start) * pxPerSecond }}>
          <button type="button" className="wave-saved-select" data-saved-entry={marker.id} aria-label={`选择段落 ${marker.label}`} title={marker.label} style={{ top: 27 + marker.lane * 18 }} onClick={event => { event.stopPropagation(); onMarkerSelect?.(marker.id); }}>
            <span style={{ marginLeft: Math.max(0, scrollLeft - marker.start * pxPerSecond) }}>{marker.label}</span>
          </button>
          <button type="button" className="wave-saved-edge is-start" data-saved-entry={marker.id} aria-label={`选择段落 ${marker.label}起点`} onClick={event => { event.stopPropagation(); onMarkerSelect?.(marker.id); }} />
          <button type="button" className="wave-saved-edge is-end" data-saved-entry={marker.id} aria-label={`选择段落 ${marker.label}终点`} onClick={event => { event.stopPropagation(); onMarkerSelect?.(marker.id); }} />
        </div>)}
        {hasCurrentRegion && <div className={`wave-region ${loop ? 'is-looping' : ''}`} data-testid="waveform-region" style={{ top: waveTop, left: regionA * pxPerSecond, width: (regionB - regionA) * pxPerSecond }}>
          <div className="wave-region-move" data-drag="move"><span className="wave-region-label" style={{ paddingLeft: Math.max(0, scrollLeft - regionA * pxPerSecond) }}>{regionLabel}</span></div>
        </div>}
        {hasCurrentRegion && <>
          <div role="slider" tabIndex={0} aria-label="循环起点 A" aria-valuemin={0} aria-valuemax={regionB} aria-valuenow={regionA} aria-valuetext={`${regionA.toFixed(3)} 秒`} className="wave-boundary wave-boundary-a" data-testid="loop-start-handle" data-drag="a" style={{ top: waveTop, left: regionA * pxPerSecond }} onKeyDown={event => handleKey(event, 'a')}><span>A</span></div>
          <div role="slider" tabIndex={0} aria-label="循环终点 B" aria-valuemin={regionA} aria-valuemax={duration} aria-valuenow={regionB} aria-valuetext={`${regionB.toFixed(3)} 秒`} className="wave-boundary wave-boundary-b" data-testid="loop-end-handle" data-drag="b" style={{ top: waveTop, left: regionB * pxPerSecond }} onKeyDown={event => handleKey(event, 'b')}><span>B</span></div>
        </>}
        {buffer && pending !== null && <div role="slider" aria-disabled="true" aria-label="循环起点 A" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={pending} aria-valuetext={`${pending.toFixed(3)} 秒`} className="wave-boundary wave-boundary-a is-pending" data-testid="loop-start-handle" style={{ top: waveTop, left: pending * pxPerSecond }}><span>A</span></div>}
        {buffer && <>
          <div role="slider" tabIndex={0} aria-label="播放指针" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={position} aria-valuetext={`${position.toFixed(3)} 秒`} className="wave-playhead" data-testid="playhead" data-drag="seek" style={{ left: clamp(position, 0, duration) * pxPerSecond }} onKeyDown={event => handleKey(event, 'seek')}><span /><i className="wave-playhead-grab" style={{ top: waveTop + 25 }} /></div>
        </>}
        {buffer && cueMarkers.map(marker => {
          const time = clamp(Number.isFinite(marker.time) ? marker.time : 0, 0, duration);
          return <div key={marker.id} role="slider" tabIndex={0} aria-label={`标记 ${marker.label}`} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time} aria-valuetext={`${time.toFixed(3)} 秒`} className="wave-cue" data-cue={marker.id} data-drag="cue" data-testid={`cue-marker-${marker.id}`} style={{ left: time * pxPerSecond }} onKeyDown={event => cueKey(event, marker.id, time)}>
            <span className="wave-cue-flag" title={marker.label} data-testid={`cue-flag-${marker.id}`} />
          </div>;
        })}
        {!buffer && <div className="wave-empty"><span>拖入音频或视频</span></div>}
      </div>
    </div>
  </section>;
}

export default Waveform;
