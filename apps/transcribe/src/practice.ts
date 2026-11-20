import { defaultSettings } from './storage';
import type { CueMarker, Marker, PracticeSettings } from './storage';

const MIN_REGION = 0.05;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const normalizeSpeed = (value: unknown, fallback: number) => Math.round(clamp(finite(value, fallback), 0.25, 1.5) * 100) / 100;

/** Values are playback ratios, e.g. 0.75 for 75%. This is a fixed user preference. */
export function normalizePracticeSpeed(value: number): number {
  return normalizeSpeed(value, 0.75);
}

/** O cycles only the three octave presets. A fine-tuned value first returns to original pitch. */
export function nextOctave(pitch: number): number {
  if (pitch === 0) return 12;
  if (pitch === 12) return 24;
  return 0;
}

/** R never rewrites the separately selected practice-speed preference. */
export function togglePracticeSpeed(speed: number, practiceSpeed: number): number {
  return Math.abs(finite(speed, 1) - 1) < 0.001 ? normalizePracticeSpeed(practiceSpeed) : 1;
}

function normalizeMarkers(raw: Marker[], duration: number): Marker[] {
  const minimum = Math.min(MIN_REGION, duration);
  const markers = raw.filter(marker => marker && typeof marker === 'object').map((marker, index) => ({
    id: typeof marker.id === 'string' && marker.id ? marker.id : `marker-${index + 1}`,
    label: typeof marker.label === 'string' ? marker.label : '',
    time: clamp(finite(marker.time, 0), 0, Math.max(0, duration - minimum)),
    end: marker.end,
  })).sort((a, b) => a.time - b.time);
  return markers.map((marker, index) => {
    const next = markers[index + 1]?.time ?? duration;
    return {
      id: marker.id,
      label: marker.label,
      time: marker.time,
      end: clamp(finite(marker.end, next), Math.min(duration, marker.time + minimum), duration),
    };
  });
}

/** New cues are exact points, independent from saved ranges and temporary a/b. */
function normalizeCues(raw: CueMarker[], duration: number): CueMarker[] {
  const cues = raw.filter(cue => cue && typeof cue === 'object');
  const hasId = (cue: CueMarker) => typeof cue.id === 'string' && cue.id.trim().length > 0;
  const reserved = new Set(cues.filter(hasId).map(cue => cue.id));
  const used = new Set<string>();
  return cues.map((cue, index) => {
    const validId = hasId(cue);
    const base = validId ? cue.id : `cue-${index + 1}`;
    let id = base;
    if (used.has(id) || (!validId && reserved.has(id))) {
      let suffix = 2;
      while (used.has(`${base}-${suffix}`) || reserved.has(`${base}-${suffix}`)) suffix++;
      id = `${base}-${suffix}`;
    }
    used.add(id);
    return {
      id,
      time: clamp(finite(cue.time, 0), 0, duration),
      label: typeof cue.label === 'string' ? cue.label : '',
    };
  }).sort((a, b) => a.time - b.time);
}

/** Restore old point markers in memory without changing database schema or audio Blobs. */
export function normalizeSettings(raw: Partial<PracticeSettings> | undefined, duration: number): PracticeSettings {
  const length = Math.max(0, finite(duration, 0));
  const defaults = defaultSettings(length);
  const value = raw ?? {};
  const minimum = Math.min(MIN_REGION, length);
  const a = clamp(finite(value.a, defaults.a), 0, Math.max(0, length - minimum));
  // Older newly imported songs have the empty pre-decode default 0/0 range.
  const oldEnd = value.a === 0 && value.b === 0 ? length : finite(value.b, defaults.b);
  const b = clamp(oldEnd, Math.min(length, a + minimum), length);
  const markers = normalizeMarkers(Array.isArray(value.markers) ? value.markers : [], length);
  const matchesRange = (marker: Marker) => Math.abs(marker.time - a) < 0.001
    && Math.abs((marker.end ?? length) - b) < 0.001;
  const hasRegionFlag = typeof value.regionSet === 'boolean';
  // a/b are authoritative. A stale saved id must never replace a new range.
  const savedActive = typeof value.activeMarkerId === 'string'
    ? markers.find(marker => marker.id === value.activeMarkerId && matchesRange(marker)) : undefined;
  // Only legacy settings infer linkage by geometry. A newly drawn range with
  // an explicit regionSet flag remains independent even if its bounds happen
  // to equal a saved section.
  const activeMarkerId = savedActive?.id ?? (!hasRegionFlag ? markers.find(matchesRange)?.id : undefined);
  const regionSet = hasRegionFlag ? value.regionSet!
    : a > 0 || b < length || value.loop === true || !!activeMarkerId;
  return {
    position: clamp(finite(value.position, defaults.position), 0, length),
    speed: normalizeSpeed(value.speed, defaults.speed),
    practiceSpeed: normalizePracticeSpeed(finite(value.practiceSpeed, defaults.practiceSpeed)),
    pitch: clamp(finite(value.pitch, defaults.pitch), -24, 24),
    a,
    b,
    regionSet,
    activeMarkerId,
    loop: value.loop === true && regionSet && length > 0,
    gap: clamp(finite(value.gap, defaults.gap), 0, 10),
    rewind: clamp(finite(value.rewind, defaults.rewind), 0, 3),
    step: clamp(finite(value.step, defaults.step), 0.1, 30),
    fineStep: clamp(finite(value.fineStep, defaults.fineStep), 0.01, 10),
    eq: defaults.eq.map((fallback, index) => clamp(finite(value.eq?.[index], fallback), -12, 12)),
    markers,
    cueMarkers: normalizeCues(Array.isArray(value.cueMarkers) ? value.cueMarkers : [], length),
    markerMode: value.markerMode === 'range' ? 'range' : 'node',
  };
}
