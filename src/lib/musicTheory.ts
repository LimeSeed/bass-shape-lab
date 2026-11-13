/** Music rules only: no browser, UI, storage or network dependencies. */
export type ScaleKind = 'major' | 'minor';
export type ChordKind = 'major' | 'minor' | 'dim' | 'maj7' | 'min7' | 'dom7' | 'halfDim';
export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface SpelledNote {
  name: string;
  pc: number;
  letter: Letter;
  accidental: number;
}

export interface Note extends SpelledNote {
  /** Interval above this collection's root, in semitones. */
  interval: number;
  /** Chromatic scale degree above this collection's root. */
  degree: string;
}

export const ROOTS = [
  { id: 'C', label: 'C' }, { id: 'Db', label: 'D♭' },
  { id: 'D', label: 'D' }, { id: 'Eb', label: 'E♭' },
  { id: 'E', label: 'E' }, { id: 'F', label: 'F' },
  { id: 'Gb', label: 'G♭' }, { id: 'G', label: 'G' },
  { id: 'Ab', label: 'A♭' }, { id: 'A', label: 'A' },
  { id: 'Bb', label: 'B♭' }, { id: 'B', label: 'B' },
] as const;

const LETTERS: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
export const mod12 = (value: number): number => ((value % 12) + 12) % 12;

function accidentalText(value: number): string {
  return value > 0 ? '♯'.repeat(value) : '♭'.repeat(-value);
}

/** Parses ASCII or Unicode spellings, including theoretical double accidentals. */
export function resolveRoot(value: string): SpelledNote {
  const normalized = value.trim().replaceAll('♯', '#').replaceAll('♭', 'b')
    .replaceAll('𝄪', '##').replaceAll('𝄫', 'bb').replaceAll('x', '##');
  const match = /^([A-Ga-g])(#{1,3}|b{1,3})?$/.exec(normalized);
  if (!match) throw new RangeError(`Invalid note spelling: ${value}`);
  const letter = match[1].toUpperCase() as Letter;
  const suffix = match[2] ?? '';
  const accidental = suffix.startsWith('#') ? suffix.length : -suffix.length;
  return {
    name: letter + accidentalText(accidental),
    pc: mod12(NATURAL_PC[LETTERS.indexOf(letter)] + accidental),
    letter,
    accidental,
  };
}

/** Select the required letter first, then derive its accidental from its pitch. */
function intervalNote(root: SpelledNote, interval: number, letterOffset: number, degree: string): Note {
  const index = (LETTERS.indexOf(root.letter) + letterOffset) % 7;
  const pc = mod12(root.pc + interval);
  let accidental = mod12(pc - NATURAL_PC[index]);
  if (accidental > 6) accidental -= 12;
  return { name: LETTERS[index] + accidentalText(accidental), pc, letter: LETTERS[index], accidental, interval, degree };
}

export const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const;
const SCALE_DEGREES = {
  major: ['1', '2', '3', '4', '5', '6', '7'],
  minor: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
} as const;

export function scale(root: string, kind: ScaleKind): Note[] {
  const spelled = resolveRoot(root);
  return SCALE_INTERVALS[kind].map((interval, index) => intervalNote(spelled, interval, index, SCALE_DEGREES[kind][index]));
}

export const CHORD_INTERVALS: Record<ChordKind, readonly number[]> = {
  major: [0, 4, 7], minor: [0, 3, 7], dim: [0, 3, 6],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], halfDim: [0, 3, 6, 10],
};
const CHORD_DEGREES: Record<ChordKind, readonly string[]> = {
  major: ['1', '3', '5'], minor: ['1', '♭3', '5'], dim: ['1', '♭3', '♭5'],
  maj7: ['1', '3', '5', '7'], min7: ['1', '♭3', '5', '♭7'],
  dom7: ['1', '3', '5', '♭7'], halfDim: ['1', '♭3', '♭5', '♭7'],
};
export const CHORD_SUFFIX: Record<ChordKind, string> = {
  major: '', minor: 'm', dim: 'dim', maj7: 'maj7', min7: 'm7', dom7: '7', halfDim: 'm7♭5',
};
export const CHORD_LABELS: Record<ChordKind, string> = {
  major: '大三和弦', minor: '小三和弦', dim: '减三和弦', maj7: '大七和弦',
  min7: '小七和弦', dom7: '属七和弦', halfDim: '半减七和弦',
};

export function chord(root: string, kind: ChordKind): Note[] {
  const spelled = resolveRoot(root);
  return CHORD_INTERVALS[kind].map((interval, index) => intervalNote(spelled, interval, index * 2, CHORD_DEGREES[kind][index]));
}

export interface DiatonicChord {
  name: string;
  root: string;
  quality: ChordKind;
  notes: Note[];
  roman: string;
}
const TRIADS: ChordKind[] = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim'];
const SEVENTHS: ChordKind[] = ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'halfDim'];
const TRIAD_ROMANS = ['Ⅰ', 'ⅱ', 'ⅲ', 'Ⅳ', 'Ⅴ', 'ⅵ', 'ⅶ°'];
const SEVENTH_ROMANS = ['Ⅰmaj7', 'ⅱ7', 'ⅲ7', 'Ⅳmaj7', 'Ⅴ7', 'ⅵ7', 'ⅶø7'];

/** One-based major-key degree. Collection degrees are relative to its chord root. */
export function diatonic(key: string, degree: number, seventh: boolean): DiatonicChord {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) throw new RangeError('Degree must be an integer from 1 to 7');
  const root = scale(key, 'major')[degree - 1].name;
  const quality = (seventh ? SEVENTHS : TRIADS)[degree - 1];
  return {
    name: root + CHORD_SUFFIX[quality], root, quality,
    notes: chord(root, quality), roman: (seventh ? SEVENTH_ROMANS : TRIAD_ROMANS)[degree - 1],
  };
}

export const CHROMATIC_DEGREES = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'] as const;
const CHROMATIC_LETTER_OFFSETS = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

/** The tritone is written as ♭5; each displayed name matches that degree spelling. */
export function chromatic(root: string): Note[] {
  const spelled = resolveRoot(root);
  return CHROMATIC_DEGREES.map((degree, interval) => intervalNote(spelled, interval, CHROMATIC_LETTER_OFFSETS[interval], degree));
}
