import { describe, expect, test } from 'vitest';
import { ROOTS, chord, diatonic, resolveRoot, type ChordKind } from '../src/lib/musicTheory';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings } from '../src/lib/settings';

describe('default and invalid URLs', () => {
  test('empty URL starts E major with the fixed window and fifth selected', () => {
    expect(parseSettings('')).toEqual({ root: 'E', mode: 'scale', scale: 'major', chord: 'major', interval: 7, degree: 1, seventh: false, view: 'name', range: 'fixed', hidden: false });
    expect(parseSettings('?unrelated=anything')).toEqual(DEFAULT_SETTINGS);
  });
  test('every invalid field safely returns its own default', () => {
    expect(parseSettings('?root=%3Cscript%3E&mode=x&scale=x&chord=x&interval=99&degree=99&seventh=x&view=x&range=x&hidden=x')).toEqual(DEFAULT_SETTINGS);
  });
  test.each(['0', '8', '-1', '1.5', '1e0', '01', 'NaN', 'Infinity', '', ' 2'])('invalid degree %j is not coerced', degree => {
    expect(parseSettings('?degree=' + encodeURIComponent(degree)).degree).toBe(1);
  });
  test.each(['-1', '12', '1.5', '1e0', '01', 'NaN', 'Infinity', '', ' 2', '7.0'])('invalid interval %j falls back to a fifth', interval => {
    expect(parseSettings('?interval=' + encodeURIComponent(interval)).interval).toBe(7);
  });
  test.each(Array.from({ length: 12 }, (_, i) => i))('accepts selected semitone %i including unison', interval => {
    expect(parseSettings('?mode=interval&interval=' + interval)).toMatchObject({ mode: 'interval', interval });
  });
  test('duplicate values use the first parameter consistently', () => {
    expect(parseSettings('?root=E&root=C&hidden=1&hidden=0')).toMatchObject({ root: 'E', hidden: true });
  });
  test('query values cannot escape typed control options', () => {
    expect(parseSettings('?root=H&mode=__proto__&chord=toString&view=constructor')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('?root=%E0%A4%A')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('complete settings share and restore', () => {
  const chords: ChordKind[] = ['major', 'minor', 'dim', 'maj7', 'min7', 'dom7', 'halfDim'];
  for (const root of ROOTS) for (const mode of ['scale', 'chord', 'interval'] as const) {
    test(`${root.id} ${mode}: round trips every chord, interval and display flag`, () => {
      for (const chord of chords) for (let interval = 0; interval < 12; interval++) for (const alternate of [false, true]) {
        const settings: Settings = { root: root.id, mode, scale: alternate ? 'minor' : 'major', chord, interval, degree: alternate ? 7 : 1, seventh: alternate, view: alternate ? 'degree' : 'name', range: 'fixed', hidden: alternate };
        const query = serializeSettings(settings);
        expect(query.startsWith('?')).toBe(true);
        expect(parseSettings(query)).toEqual(settings);
        expect(serializeSettings(parseSettings(query))).toBe(query);
      }
    });
  }
  test('query contains all settings including the selected interval and inactive controls', () => {
    const query = new URLSearchParams(serializeSettings({ ...DEFAULT_SETTINGS }));
    expect([...query.keys()]).toEqual(['root', 'mode', 'scale', 'chord', 'interval', 'degree', 'seventh', 'view', 'range', 'hidden']);
  });
  test('booleans restore both numeric and textual forms', () => {
    expect(parseSettings('?seventh=true&hidden=true')).toMatchObject({ seventh: true, hidden: true });
    expect(parseSettings('?seventh=false&hidden=false')).toMatchObject({ seventh: false, hidden: false });
  });
  test('accepts and canonicalizes sharp and Unicode root URLs to twelve picker choices', () => {
    expect(parseSettings('?root=F%23').root).toBe('Gb');
    expect(parseSettings('?root=D%E2%99%AD').root).toBe('Db');
    expect(parseSettings('?root=C%E2%99%AD').root).toBe('B');
  });
  test('migrates original E-major degree II seventh lesson to the equivalent chord shape', () => {
    expect(parseSettings('?key=E&degree=2&type=7&view=interval')).toMatchObject({ root: 'Gb', mode: 'chord', chord: 'min7', degree: 2, seventh: true, view: 'degree', range: 'fixed' });
  });
  test('explicit modern fields take precedence over legacy aliases', () => {
    expect(parseSettings('?root=C&key=E&mode=chord&degree=2&type=7&seventh=0')).toMatchObject({ root: 'C', mode: 'chord', degree: 2, seventh: false });
  });
  test('the old follow setting is normalized to fixed in URLs and restored state', () => {
    expect(parseSettings('?range=follow').range).toBe('fixed');
    expect(new URLSearchParams(serializeSettings({ ...DEFAULT_SETTINGS, range: 'follow' })).get('range')).toBe('fixed');
    expect(parseSettings(serializeSettings({ ...DEFAULT_SETTINGS, range: 'follow' })).range).toBe('fixed');
  });
});

describe('old diatonic links migrate to chord mode', () => {
  for (const key of ROOTS) for (const seventh of [false, true]) {
    test(`${key.id}, ${seventh ? 'seventh' : 'triad'}: every degree retains its pitches and quality`, () => {
      for (let degree = 1; degree <= 7; degree++) {
        const oldChord = diatonic(key.id, degree, seventh);
        for (const query of [
          `?root=${key.id}&mode=diatonic&degree=${degree}&seventh=${seventh ? 1 : 0}`,
          `?key=${key.id}&degree=${degree}&type=${seventh ? 7 : 3}`,
        ]) {
          const settings = parseSettings(query + '&range=follow&view=degree&hidden=1&scale=minor&interval=3');
          expect(settings).toMatchObject({ mode: 'chord', chord: oldChord.quality, interval: 3, range: 'fixed', hidden: true, view: 'degree', scale: 'minor', degree, seventh });
          expect(resolveRoot(settings.root).pc).toBe(oldChord.notes[0].pc);
          expect(ROOTS.some(root => root.id === settings.root)).toBe(true);
          expect(chord(settings.root, settings.chord).map(note => note.pc)).toEqual(oldChord.notes.map(note => note.pc));
          expect(parseSettings(serializeSettings(settings))).toEqual(settings);
        }
      }
    });
  }
  test('E-major leading-tone diminished chord migrates to the same pitch class', () => {
    expect(parseSettings('?root=E&mode=diatonic&degree=7&seventh=0')).toMatchObject({ mode: 'chord', root: 'Eb', chord: 'dim' });
    expect(parseSettings('?key=E&degree=7&type=7')).toMatchObject({ mode: 'chord', root: 'Eb', chord: 'halfDim' });
  });
  test.each(['', '0', '8', '-1', '1.5', 'nonsense'])('missing or invalid old degree %j defaults to the tonic', degree => {
    expect(parseSettings('?mode=diatonic&root=E&degree=' + degree)).toMatchObject({ mode: 'chord', root: 'E', chord: 'major', degree: 1 });
    expect(parseSettings('?key=E&type=7&degree=' + degree)).toMatchObject({ mode: 'chord', root: 'E', chord: 'maj7', degree: 1 });
  });
  test('missing old degree also defaults to tonic', () => {
    expect(parseSettings('?mode=diatonic&root=E')).toMatchObject({ mode: 'chord', root: 'E', chord: 'major', degree: 1 });
    expect(parseSettings('?key=E&type=7')).toMatchObject({ mode: 'chord', root: 'E', chord: 'maj7', degree: 1 });
  });
  test('explicit seventh flag wins over old type, and diatonic mode wins over inactive chord', () => {
    expect(parseSettings('?mode=diatonic&root=E&degree=2&type=7&seventh=0&chord=major')).toMatchObject({ mode: 'chord', root: 'Gb', chord: 'minor', seventh: false });
  });
  test('invalid old key safely migrates using the default E major key', () => {
    expect(parseSettings('?key=H&degree=2&type=7')).toMatchObject({ mode: 'chord', root: 'Gb', chord: 'min7' });
  });
});
