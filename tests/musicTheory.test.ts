import { describe, expect, test } from 'vitest';
import { ROOTS, resolveRoot, scale, chord, diatonic, chromatic, type ChordKind } from '../src/lib/musicTheory';

// Expected spellings are explicit fixtures, not produced by the engine under test.
const SCALE_FIXTURES = [
  ['C', 'C D E F G A B', 'C D E♭ F G A♭ B♭'],
  ['Db', 'D♭ E♭ F G♭ A♭ B♭ C', 'D♭ E♭ F♭ G♭ A♭ B♭♭ C♭'],
  ['D', 'D E F♯ G A B C♯', 'D E F G A B♭ C'],
  ['Eb', 'E♭ F G A♭ B♭ C D', 'E♭ F G♭ A♭ B♭ C♭ D♭'],
  ['E', 'E F♯ G♯ A B C♯ D♯', 'E F♯ G A B C D'],
  ['F', 'F G A B♭ C D E', 'F G A♭ B♭ C D♭ E♭'],
  ['Gb', 'G♭ A♭ B♭ C♭ D♭ E♭ F', 'G♭ A♭ B♭♭ C♭ D♭ E♭♭ F♭'],
  ['G', 'G A B C D E F♯', 'G A B♭ C D E♭ F'],
  ['Ab', 'A♭ B♭ C D♭ E♭ F G', 'A♭ B♭ C♭ D♭ E♭ F♭ G♭'],
  ['A', 'A B C♯ D E F♯ G♯', 'A B C D E F G'],
  ['Bb', 'B♭ C D E♭ F G A', 'B♭ C D♭ E♭ F G♭ A♭'],
  ['B', 'B C♯ D♯ E F♯ G♯ A♯', 'B C♯ D E F♯ G A'],
];
const ROOT_PC: Record<string, number> = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const TRIAD_FIXTURES = [
  ['C', 'C E G', 'C E♭ G', 'C E♭ G♭'],
  ['Db', 'D♭ F A♭', 'D♭ F♭ A♭', 'D♭ F♭ A♭♭'],
  ['D', 'D F♯ A', 'D F A', 'D F A♭'],
  ['Eb', 'E♭ G B♭', 'E♭ G♭ B♭', 'E♭ G♭ B♭♭'],
  ['E', 'E G♯ B', 'E G B', 'E G B♭'],
  ['F', 'F A C', 'F A♭ C', 'F A♭ C♭'],
  ['Gb', 'G♭ B♭ D♭', 'G♭ B♭♭ D♭', 'G♭ B♭♭ D♭♭'],
  ['G', 'G B D', 'G B♭ D', 'G B♭ D♭'],
  ['Ab', 'A♭ C E♭', 'A♭ C♭ E♭', 'A♭ C♭ E♭♭'],
  ['A', 'A C♯ E', 'A C E', 'A C E♭'],
  ['Bb', 'B♭ D F', 'B♭ D♭ F', 'B♭ D♭ F♭'],
  ['B', 'B D♯ F♯', 'B D F♯', 'B D F'],
];
const FORMULAS: Record<ChordKind, { intervals: number[]; degrees: string[] }> = {
  major: { intervals: [0, 4, 7], degrees: ['1', '3', '5'] },
  minor: { intervals: [0, 3, 7], degrees: ['1', '♭3', '5'] },
  dim: { intervals: [0, 3, 6], degrees: ['1', '♭3', '♭5'] },
  maj7: { intervals: [0, 4, 7, 11], degrees: ['1', '3', '5', '7'] },
  min7: { intervals: [0, 3, 7, 10], degrees: ['1', '♭3', '5', '♭7'] },
  dom7: { intervals: [0, 4, 7, 10], degrees: ['1', '3', '5', '♭7'] },
  halfDim: { intervals: [0, 3, 6, 10], degrees: ['1', '♭3', '♭5', '♭7'] },
};

describe('twelve roots and enharmonic parsing', () => {
  test('root picker contains every pitch class once', () => {
    expect(ROOTS.map(root => resolveRoot(root.id).pc)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });
  test.each([
    ['E', 'E', 4], ['d#', 'D♯', 3], ['E♭', 'E♭', 3], ['Fb', 'F♭', 4],
    ['B#', 'B♯', 0], ['Cb', 'C♭', 11], ['G##', 'G♯♯', 9], ['G𝄪', 'G♯♯', 9], ['B𝄫', 'B♭♭', 9],
  ])('parses %s preserving its spelling', (input, name, pc) => {
    expect(resolveRoot(String(input))).toMatchObject({ name, pc });
  });
  test.each(['', 'H', 'C#b', '<script>', 'undefined', 'E4', 'C####'])('rejects invalid note %j', input => {
    expect(() => resolveRoot(input)).toThrow(RangeError);
  });
});

describe('major and natural minor in all roots', () => {
  for (const [root, major, minor] of SCALE_FIXTURES) {
    test(`${root}: exact major spelling and degrees`, () => {
      const notes = scale(root, 'major');
      expect(notes.map(note => note.name).join(' ')).toBe(major);
      expect(notes.map(note => note.pc)).toEqual([0, 2, 4, 5, 7, 9, 11].map(n => (ROOT_PC[root] + n) % 12));
      expect(notes.map(note => note.degree)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
      expect(new Set(notes.map(note => note.letter)).size).toBe(7);
    });
    test(`${root}: exact natural minor spelling and degrees`, () => {
      const notes = scale(root, 'minor');
      expect(notes.map(note => note.name).join(' ')).toBe(minor);
      expect(notes.map(note => note.pc)).toEqual([0, 2, 3, 5, 7, 8, 10].map(n => (ROOT_PC[root] + n) % 12));
      expect(notes.map(note => note.degree)).toEqual(['1', '2', '♭3', '4', '5', '♭6', '♭7']);
      expect(new Set(notes.map(note => note.letter)).size).toBe(7);
    });
  }
  test('sharp keys use required sharps and double sharps', () => {
    expect(scale('D#', 'major').map(n => n.name)).toEqual(['D♯', 'E♯', 'F♯♯', 'G♯', 'A♯', 'B♯', 'C♯♯']);
    expect(scale('F#', 'major').map(n => n.name)).toEqual(['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']);
  });
});

describe('all 84 root / chord combinations', () => {
  for (const root of ROOTS) for (const [kind, expected] of Object.entries(FORMULAS)) {
    test(`${root.id} ${kind}: intervals, degrees and thirds spelling`, () => {
      const notes = chord(root.id, kind as ChordKind);
      expect(notes.map(note => note.interval)).toEqual(expected.intervals);
      expect(notes.map(note => note.degree)).toEqual(expected.degrees);
      expect(notes.map(note => note.pc)).toEqual(expected.intervals.map(n => (ROOT_PC[root.id] + n) % 12));
      const letters = 'CDEFGAB';
      const first = letters.indexOf(root.id[0]);
      expect(notes.map(note => note.letter)).toEqual(expected.intervals.map((_, index) => letters[(first + index * 2) % 7]));
      expect(notes.map(note => resolveRoot(note.name).pc)).toEqual(notes.map(note => note.pc));
    });
  }
  for (const [root, major, minor, diminished] of TRIAD_FIXTURES) {
    test(`${root}: explicit triad name fixtures`, () => {
      expect(chord(root, 'major').map(n => n.name).join(' ')).toBe(major);
      expect(chord(root, 'minor').map(n => n.name).join(' ')).toBe(minor);
      expect(chord(root, 'dim').map(n => n.name).join(' ')).toBe(diminished);
    });
  }
  test('E-key leading tone triad spells D♯ F♯ A', () => {
    expect(chord('D#', 'dim').map(n => n.name)).toEqual(['D♯', 'F♯', 'A']);
  });
});

describe('all 168 major-key diatonic chords', () => {
  for (const [key, fixture] of SCALE_FIXTURES) for (const seventh of [false, true]) for (let degree = 1; degree <= 7; degree++) {
    test(`${key} degree ${degree}, ${seventh ? 'seventh' : 'triad'}`, () => {
      const result = diatonic(key, degree, seventh);
      const keyNotes = fixture.split(' ');
      const expected = Array.from({ length: seventh ? 4 : 3 }, (_, i) => keyNotes[(degree - 1 + i * 2) % 7]);
      expect(result.notes.map(note => note.name)).toEqual(expected);
      expect(result.root).toBe(keyNotes[degree - 1]);
      expect(result.quality).toBe((seventh ? ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'halfDim'] : ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim'])[degree - 1]);
      expect(result.notes[0].degree).toBe('1');
    });
  }
  test('E major names and roman qualities', () => {
    expect(Array.from({ length: 7 }, (_, i) => diatonic('E', i + 1, false).name)).toEqual(['E', 'F♯m', 'G♯m', 'A', 'B', 'C♯m', 'D♯dim']);
    expect(Array.from({ length: 7 }, (_, i) => diatonic('E', i + 1, true).name)).toEqual(['Emaj7', 'F♯m7', 'G♯m7', 'Amaj7', 'B7', 'C♯m7', 'D♯m7♭5']);
    expect(diatonic('E', 7, false).roman).toBe('ⅶ°');
    expect(diatonic('E', 7, true).roman).toBe('ⅶø7');
  });
  test.each([0, -1, 8, 1.5, NaN, Infinity])('rejects invalid degree %s', degree => {
    expect(() => diatonic('E', degree, false)).toThrow(RangeError);
  });
});

describe('all chromatic intervals', () => {
  for (const root of ROOTS) test(root.id, () => {
    const notes = chromatic(root.id);
    expect(notes.map(n => n.pc)).toEqual(Array.from({ length: 12 }, (_, i) => (ROOT_PC[root.id] + i) % 12));
    expect(notes.map(n => n.degree)).toEqual(['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7']);
    expect(notes.map(n => resolveRoot(n.name).pc)).toEqual(notes.map(n => n.pc));
  });
});
