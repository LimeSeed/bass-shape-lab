import { describe, expect, test } from 'vitest';
import { getPositions, getRange, STRINGS } from '../src/lib/fretboard';
import { ROOTS, chord, chromatic, resolveRoot, scale } from '../src/lib/musicTheory';

describe('twelve contiguous frets', () => {
  test('defaults to E-string fret 12 with range 7–18', () => {
    expect(getRange(4, 'follow')).toEqual({ start: 7, end: 18, anchor: 12 });
    expect(getRange(4, 'fixed')).toEqual({ start: 1, end: 12, anchor: 12 });
  });
  const anchors = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];
  for (let pc = 0; pc < 12; pc++) {
    test(`pitch class ${pc}: low-E anchor and both windows`, () => {
      for (const mode of ['follow', 'fixed'] as const) {
        const range = getRange(pc, mode);
        expect(range.anchor).toBe(anchors[pc]);
        expect((4 + range.anchor) % 12).toBe(pc);
        expect(range.start).toBe(mode === 'fixed' ? 1 : Math.max(1, anchors[pc] - 5));
        expect(range.end - range.start + 1).toBe(12);
        expect(range.anchor).toBeGreaterThanOrEqual(range.start);
        expect(range.anchor).toBeLessThanOrEqual(range.end);
      }
    });
  }
  test.each([-1, 12, 1.1, NaN, Infinity])('rejects pitch class %s', pc => expect(() => getRange(pc, 'follow')).toThrow(RangeError));
  test.each([0, -1, 14, 1.5, NaN])('rejects start fret %s', start => expect(() => getPositions([], start)).toThrow(RangeError));
});

describe('every string and fret is calculated from EADG tuning', () => {
  test('visual string order is high G to low E', () => expect(STRINGS.map(s => s.name)).toEqual(['G', 'D', 'A', 'E']));
  for (const root of ROOTS) for (const mode of ['fixed', 'follow'] as const) {
    test(`${root.id}, ${mode}: all chromatic notes fill exactly 48 positions`, () => {
      const range = getRange(resolveRoot(root.id).pc, mode);
      const positions = getPositions(chromatic(root.id), range.start);
      expect(positions).toHaveLength(48);
      expect(new Set(positions.map(p => `${p.stringIndex}:${p.fret}`)).size).toBe(48);
      const openPitches = [7, 2, 9, 4];
      positions.forEach(position => {
        expect(position.note.pc).toBe((openPitches[position.stringIndex] + position.fret) % 12);
        expect(position.fret).toBeGreaterThanOrEqual(range.start);
        expect(position.fret).toBeLessThanOrEqual(range.end);
      });
      expect(positions.filter(position => position.note.interval === 0)).toHaveLength(4);
    });
    test(`${root.id}, ${mode}: scale and chords show only requested pitches`, () => {
      const range = getRange(resolveRoot(root.id).pc, mode);
      for (const notes of [scale(root.id, 'major'), scale(root.id, 'minor'), chord(root.id, 'dim'), chord(root.id, 'halfDim')]) {
        const positions = getPositions(notes, range.start);
        expect(positions).toHaveLength(notes.length * 4);
        for (const note of notes) expect(positions.filter(p => p.note.pc === note.pc)).toHaveLength(4);
        expect(positions.every(p => notes.includes(p.note))).toBe(true);
      }
    });
  }
  test('fret 12 repeats each open-string pitch without rendering fret zero', () => {
    const positions = getPositions(chromatic('E'), 1).filter(p => p.fret === 12);
    expect(positions.map(p => p.note.name)).toEqual(['G', 'D', 'A', 'E']);
    expect(getPositions(chromatic('E'), 1).every(p => p.fret > 0)).toBe(true);
  });
  test('empty collection has no dots', () => expect(getPositions([], 1)).toEqual([]));
});
