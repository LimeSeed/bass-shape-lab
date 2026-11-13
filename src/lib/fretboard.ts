import { mod12, type Note } from './musicTheory';

/** Visual order is highest string first, as viewed looking down at a bass. */
export const STRINGS = [
  { name: 'G', pc: 7 }, { name: 'D', pc: 2 },
  { name: 'A', pc: 9 }, { name: 'E', pc: 4 },
] as const;
export type RangeMode = 'fixed' | 'follow';
export interface FretRange { start: number; end: number; anchor: number }

export function getRange(rootPc: number, mode: RangeMode): FretRange {
  if (!Number.isInteger(rootPc) || rootPc < 0 || rootPc > 11) throw new RangeError('Pitch class must be an integer from 0 to 11');
  // Find a fretted low-E root in the first octave; E itself is at fret 12.
  const anchor = mod12(rootPc - STRINGS[3].pc) || 12;
  const start = mode === 'fixed' ? 1 : Math.max(1, anchor - 5);
  return { start, end: start + 11, anchor };
}

export interface FretPosition {
  stringIndex: number;
  stringName: string;
  fret: number;
  note: Note;
}

export function getPositions(notes: readonly Note[], start: number): FretPosition[] {
  if (!Number.isInteger(start) || start < 1 || start > 13) throw new RangeError('Start fret must be an integer from 1 to 13');
  const byPitch = new Map(notes.map(note => [note.pc, note]));
  const positions: FretPosition[] = [];
  STRINGS.forEach((string, stringIndex) => {
    for (let fret = start; fret < start + 12; fret++) {
      const note = byPitch.get(mod12(string.pc + fret));
      if (note) positions.push({ stringIndex, stringName: string.name, fret, note });
    }
  });
  return positions;
}
