import { ROOTS, diatonic, resolveRoot, type ChordKind, type ScaleKind } from './musicTheory';
import type { RangeMode } from './fretboard';

export interface Settings {
  root: string;
  mode: 'scale' | 'chord' | 'interval';
  scale: ScaleKind;
  chord: ChordKind;
  /** Selected interval above the root, in semitones. Zero selects the root alone. */
  interval: number;
  /** Retained only to restore lesson links from the original diatonic interface. */
  degree: number;
  seventh: boolean;
  view: 'name' | 'degree';
  range: RangeMode;
  hidden: boolean;
}
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  root: 'E', mode: 'scale', scale: 'major', chord: 'major', interval: 7, degree: 1,
  seventh: false, view: 'name', range: 'fixed', hidden: false,
});

const MODES: Settings['mode'][] = ['scale', 'chord', 'interval'];
const CHORDS: ChordKind[] = ['major', 'minor', 'dim', 'maj7', 'min7', 'dom7', 'halfDim'];
function oneOf<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}
function boolean(value: string | null, fallback: boolean): boolean {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

/** Accept all twelve pitch classes, while keeping the UI's preferred root spellings. */
function canonicalRoot(value: string | null): string {
  if (!value || value.length > 8) return DEFAULT_SETTINGS.root;
  try { return ROOTS[resolveRoot(value).pc].id; }
  catch { return DEFAULT_SETTINGS.root; }
}

export function parseSettings(search: string): Settings {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const legacy = !query.has('mode') && query.has('key') && (query.has('degree') || query.has('type'));
  const migrateDiatonic = query.get('mode') === 'diatonic' || legacy;
  const degreeText = query.get('degree');
  const degree = degreeText && /^[1-7]$/.test(degreeText) ? Number(degreeText) : DEFAULT_SETTINGS.degree;
  const intervalText = query.get('interval');
  const interval = intervalText && /^(?:[0-9]|1[01])$/.test(intervalText) ? Number(intervalText) : DEFAULT_SETTINGS.interval;
  const seventh = boolean(query.get('seventh'), migrateDiatonic ? query.get('type') === '7' : DEFAULT_SETTINGS.seventh);
  const root = canonicalRoot(query.get('root') ?? query.get('key'));
  const migrated = migrateDiatonic ? diatonic(root, degree, seventh) : null;
  const view = query.get('view');
  return {
    root: migrated ? canonicalRoot(migrated.root) : root,
    mode: migrated ? 'chord' : oneOf(query.get('mode'), MODES, DEFAULT_SETTINGS.mode),
    scale: oneOf(query.get('scale'), ['major', 'minor'], DEFAULT_SETTINGS.scale),
    chord: migrated ? migrated.quality : oneOf(query.get('chord'), CHORDS, DEFAULT_SETTINGS.chord),
    interval,
    degree,
    seventh,
    view: view === 'interval' ? 'degree' : oneOf(view, ['name', 'degree'], DEFAULT_SETTINGS.view),
    range: 'fixed',
    hidden: boolean(query.get('hidden'), DEFAULT_SETTINGS.hidden),
  };
}

/** A complete, deterministic URL; receiving devices do not need previous local state. */
export function serializeSettings(settings: Settings): string {
  const query = new URLSearchParams({
    root: settings.root, mode: settings.mode, scale: settings.scale,
    chord: settings.chord, interval: String(settings.interval), degree: String(settings.degree), seventh: settings.seventh ? '1' : '0',
    view: settings.view, range: 'fixed', hidden: settings.hidden ? '1' : '0',
  });
  return '?' + query.toString();
}
