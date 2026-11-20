import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const storageURL = moduleURL(compile(await readFile(new URL('../src/storage.ts', import.meta.url), 'utf8')));
const code = compile(await readFile(new URL('../src/practice.ts', import.meta.url), 'utf8'))
  .replace(/from ['"]\.\/storage['"]/g, `from '${storageURL}'`);
const { normalizeSettings, normalizePracticeSpeed, nextOctave, togglePracticeSpeed } = await import(moduleURL(code));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);


test('new song gets complete defaults; pre-decode empty range becomes whole song', () => {
  const value = normalizeSettings(undefined, 20);
  assert.equal(value.speed, 1);
  assert.equal(value.practiceSpeed, .75);
  assert.equal(value.rewind, 0);
  assert.equal(value.a, 0);
  assert.equal(value.b, 20);
  assert.equal(value.regionSet, false);
  assert.equal(value.activeMarkerId, undefined);
  assert.deepEqual(value.markers, []);
  assert.deepEqual(value.cueMarkers, []);
  assert.equal(value.markerMode, 'node');
  assert.deepEqual(normalizeSettings({ a: 0, b: 0 }, 20), value);
});

test('valid saved settings retain boundaries and fixed R speed independently of current speed', () => {
  const old = {
    position: 13.7, speed: .9, practiceSpeed: .65, pitch: 12.1,
    a: 5.25, b: 19.8, loop: true, gap: 2, rewind: 3,
    step: 5, fineStep: .5, eq: [3, -2, 1],
    markers: [{ id: 'verse', time: 5.25, end: 10.75, label: '主歌' }],
  };
  assert.deepEqual(normalizeSettings(old, 30), { ...old, regionSet: true, activeMarkerId: undefined, cueMarkers: [], markerMode: 'node' });
  const ordinarySpeedChange = normalizeSettings({ ...old, speed: .5 }, 30);
  assert.equal(ordinarySpeedChange.practiceSpeed, .65);
});

test('old point markers become named ranges in chronological order without losing IDs', () => {
  const old = { markers: [
    { id: 'bridge', time: 14, label: '桥段' },
    { id: 'intro', time: 0, label: '前奏' },
    { id: 'verse', time: 5.5, label: '主歌 A' },
  ] };
  assert.deepEqual(normalizeSettings(old, 20).markers, [
    { id: 'intro', time: 0, end: 5.5, label: '前奏' },
    { id: 'verse', time: 5.5, end: 14, label: '主歌 A' },
    { id: 'bridge', time: 14, end: 20, label: '桥段' },
  ]);
});

test('regionSet explicitly records new empty and established ranges without inferring a saved section', () => {
  const markers = [{ id: 'verse', time: 2, end: 5, label: '主歌' }];
  const empty = normalizeSettings({ regionSet: false, a: 2, b: 5, loop: true, markers }, 10);
  assert.equal(empty.regionSet, false);
  assert.equal(empty.loop, false);
  assert.equal(empty.activeMarkerId, undefined);
  const drawn = normalizeSettings({ regionSet: true, a: 2, b: 5, markers }, 10);
  assert.equal(drawn.regionSet, true);
  assert.equal(drawn.activeMarkerId, undefined);
  assert.equal(normalizeSettings({ regionSet: true, a: 0, b: 10, loop: false }, 10).regionSet, true);
});

test('legacy full-song defaults stay unset while edited ranges and enabled loops restore as set', () => {
  for (const old of [undefined, {}, { a: 0, b: 0 }, { a: 0, b: 10, loop: false }]) {
    assert.equal(normalizeSettings(old, 10).regionSet, false);
  }
  for (const old of [{ a: 2, b: 5, loop: false }, { a: .0001, b: 10 }, { a: 0, b: 8 }, { a: 0, b: 10, loop: true }]) {
    assert.equal(normalizeSettings(old, 10).regionSet, true);
  }
});

test('legacy point ranges infer an active section only when saved a/b match the migrated range', () => {
  const markers = [{ id: 'one', time: 2, label: '前半' }, { id: 'two', time: 5, label: '后半' }];
  const old = { a: 2, b: 5, loop: false, markers };
  const before = structuredClone(old);
  const restored = normalizeSettings(old, 10);
  assert.equal(restored.regionSet, true);
  assert.equal(restored.activeMarkerId, 'one');
  assert.deepEqual(restored.markers, [
    { id: 'one', time: 2, end: 5, label: '前半' }, { id: 'two', time: 5, end: 10, label: '后半' },
  ]);
  assert.deepEqual(old, before);
  assert.equal(normalizeSettings({ ...old, a: 3 }, 10).activeMarkerId, undefined);
});

test('valid saved active ids survive only with matching ranges and never override saved a/b', () => {
  const markers = [{ id: 'a', time: 2, end: 5, label: 'A' }, { id: 'b', time: 6, end: 9, label: 'B' }];
  const linked = normalizeSettings({ regionSet: true, a: 2, b: 5, activeMarkerId: 'a', markers }, 10);
  assert.equal(linked.activeMarkerId, 'a');
  const changed = normalizeSettings({ regionSet: true, a: 3, b: 5, activeMarkerId: 'a', markers }, 10);
  assert.equal(changed.activeMarkerId, undefined);
  assert.equal(changed.a, 3); assert.equal(changed.b, 5);
  const mismatchedId = normalizeSettings({ regionSet: true, a: 6, b: 9, activeMarkerId: 'a', markers }, 10);
  assert.equal(mismatchedId.activeMarkerId, undefined);
  assert.equal(mismatchedId.a, 6); assert.equal(mismatchedId.b, 9);
  assert.equal(normalizeSettings({ regionSet: true, a: 2, b: 5, activeMarkerId: 'deleted', markers }, 10).activeMarkerId, undefined);
  const legacyWhole = normalizeSettings({ a: 0, b: 10, activeMarkerId: 'whole', markers: [{ id: 'whole', time: 0, end: 10, label: '整首' }] }, 10);
  assert.equal(legacyWhole.regionSet, true); assert.equal(legacyWhole.activeMarkerId, 'whole');
});

test('explicit new ranges survive alongside old points, including intentionally overlapping ranges', () => {
  const markers = [
    { id: 'one', time: 2, end: 9, label: '整段' },
    { id: 'two', time: 4, label: '细节' },
    { id: 'three', time: 8, end: 9.5, label: '结尾' },
  ];
  assert.deepEqual(normalizeSettings({ markers }, 10).markers, [
    markers[0], { ...markers[1], end: 8 }, markers[2],
  ]);
});

test('invalid and very short selection boundaries stay inside the song', () => {
  const outside = normalizeSettings({ a: 30, b: -1, position: 99 }, 10);
  close(outside.a, 9.95); close(outside.b, 10);
  assert.equal(outside.position, 10);
  const reversed = normalizeSettings({ a: 4, b: 2 }, 10);
  close(reversed.a, 4); close(reversed.b, 4.05);
  const short = normalizeSettings({ a: 2, b: 2.01 }, 10);
  close(short.b, 2.05);
  const validMinimum = normalizeSettings({ a: 2, b: 2.05 }, 10);
  close(validMinimum.a, 2); close(validMinimum.b, 2.05);
});

test('coincident, out-of-bounds and too-short markers keep labels and get usable boundaries', () => {
  const markers = normalizeSettings({ markers: [
    { id: 'a', time: -2, label: '负起点' },
    { id: 'b', time: 0, end: .01, label: '重合' },
    { id: 'c', time: 10, label: '末端' },
    { id: 'd', time: 50, end: 2, label: '越界' },
  ] }, 10).markers;
  assert.deepEqual(markers.map(marker => marker.label), ['负起点', '重合', '末端', '越界']);
  for (const marker of markers) {
    assert.ok(marker.time >= 0 && marker.end <= 10);
    assert.ok(marker.end - marker.time >= .05 - 1e-9);
  }
});

test('sub-50ms and zero-duration audio never produce out-of-range boundaries', () => {
  for (const duration of [0, .001, .02, .049]) {
    const value = normalizeSettings({ a: 4, b: -2, markers: [{ id: 'a', time: 10, label: '短段' }] }, duration);
    assert.equal(value.a, 0);
    close(value.b, duration);
    assert.equal(value.markers[0].time, 0);
    close(value.markers[0].end, duration);
  }
});

test('normalization does not mutate saved objects or change metadata/Blob identity', () => {
  const settings = {
    markers: [{ id: 'a', time: 2, label: '原名称' }],
    eq: [1, 2, 3], a: 1, b: 8,
  };
  const before = structuredClone(settings);
  const blob = new Blob(['audio bytes']);
  const song = { id: 'song', settings, blob };
  const normalized = normalizeSettings(song.settings, 10);
  assert.deepEqual(song.settings, before);
  assert.equal(song.blob, blob);
  assert.notEqual(normalized.markers, settings.markers);
  assert.notEqual(normalized.markers[0], settings.markers[0]);
  assert.notEqual(normalized.eq, settings.eq);
});

test('non-finite restored values use safe finite defaults', () => {
  const value = normalizeSettings({
    speed: NaN, practiceSpeed: Infinity, position: Infinity, pitch: NaN,
    a: -Infinity, b: NaN, gap: Infinity, rewind: NaN, step: 0, fineStep: -10,
    eq: [NaN, Infinity, 99], markers: [{ id: 'x', time: NaN, end: Infinity, label: '保留' }],
  }, NaN);
  for (const key of ['speed', 'practiceSpeed', 'position', 'pitch', 'a', 'b', 'gap', 'rewind', 'step', 'fineStep']) {
    assert.ok(Number.isFinite(value[key]), key);
  }
  assert.equal(value.speed, 1);
  assert.equal(value.practiceSpeed, .75);
  assert.deepEqual(value.eq, [0, 0, 12]);
  assert.equal(value.markers[0].label, '保留');
});

test('O cycles original / +12 / +24, while a fine adjustment first resets to original', () => {
  assert.equal(nextOctave(0), 12);
  assert.equal(nextOctave(12), 24);
  assert.equal(nextOctave(24), 0);
  for (const fine of [12.1, -.1, -12, NaN, Infinity]) assert.equal(nextOctave(fine), 0);
  let pitch = 0;
  for (let i = 0; i < 30; i++) pitch = nextOctave(pitch);
  assert.equal(pitch, 0);
});

test('fixed practice speed has bounded normalization and R does not follow ordinary speed changes', () => {
  assert.equal(normalizePracticeSpeed(.6666), .67);
  assert.equal(normalizePracticeSpeed(0), .25);
  assert.equal(normalizePracticeSpeed(2), 1.5);
  assert.equal(normalizePracticeSpeed(NaN), .75);
  assert.equal(togglePracticeSpeed(1, .65), .65);
  assert.equal(togglePracticeSpeed(.65, .65), 1);
  assert.equal(togglePracticeSpeed(.5, .65), 1);
  assert.equal(togglePracticeSpeed(togglePracticeSpeed(.5, .65), .65), .65);
  assert.equal(togglePracticeSpeed(1, 1), 1);
});

test('many bounded and corrupted inputs preserve selection and marker interval invariants', () => {
  for (let i = 0; i < 1000; i++) {
    const duration = (i * 0.073) % 40;
    const value = normalizeSettings({
      a: Math.sin(i) * 100, b: Math.cos(i) * 100,
      markers: [{ id: 'm', time: Math.sin(i * 2) * 100, end: Math.cos(i * 3) * 100, label: '段' }],
    }, duration);
    assert.ok(value.a >= 0 && value.b <= duration && value.b >= value.a);
    assert.ok(value.b - value.a >= Math.min(.05, duration) - 1e-9);
    for (const marker of value.markers) {
      assert.ok(marker.time >= 0 && marker.end <= duration && marker.end >= marker.time);
      assert.ok(marker.end - marker.time >= Math.min(.05, duration) - 1e-9);
    }
  }
});


test('new exact cue nodes remain points at their timestamps, including the track end', () => {
  const raw = { cueMarkers: [
    { id: 'end', time: 10, label: '曲末' },
    { id: 'middle', time: 5.012, label: '精确节点' },
    { id: 'start', time: 0, label: '开始' },
  ] };
  const result = normalizeSettings(raw, 10);
  assert.deepEqual(result.cueMarkers, [raw.cueMarkers[2], raw.cueMarkers[1], raw.cueMarkers[0]]);
  assert(result.cueMarkers.every(cue => !Object.hasOwn(cue, 'end')));
  assert.deepEqual(result.markers, []);
  assert.equal(result.regionSet, false);
  assert.equal(result.loop, false);
});

test('node names can be edited and restored without changing the point or saved range', () => {
  const range = { id: 'saved', time: 2, end: 6, label: '已保存主歌' };
  const raw = { markers: [range], cueMarkers: [{ id: 'node', time: 4.125, label: '旧名' }] };
  const first = normalizeSettings(raw, 12);
  const renamed = normalizeSettings({ ...first, cueMarkers: [{ ...first.cueMarkers[0], label: '重命名节点' }] }, 12);
  assert.deepEqual(renamed.cueMarkers, [{ id: 'node', time: 4.125, label: '重命名节点' }]);
  assert.deepEqual(renamed.markers, [range]);
  assert.equal(raw.cueMarkers[0].label, '旧名');
  assert.equal(renamed.a, first.a); assert.equal(renamed.b, first.b);
});

test('cue normalization fixes invalid times and duplicate IDs without losing names or colliding with valid later IDs', () => {
  const raw = { cueMarkers: [
    { id: '', time: -4, label: '空编号' },
    { id: 'same', time: NaN, label: '重复甲' },
    { id: 'same', time: Infinity, label: '重复乙' },
    { id: 'same-2', time: 99, label: '有效编号' },
    { id: 'cue-1', time: 5, label: '预留编号' },
    { id: '  ', time: 2, label: '空白编号' },
  ] };
  const before = structuredClone(raw);
  const cues = normalizeSettings(raw, 10).cueMarkers;
  assert.equal(new Set(cues.map(cue => cue.id)).size, raw.cueMarkers.length);
  assert(cues.every(cue => cue.id.trim().length > 0 && Number.isFinite(cue.time) && cue.time >= 0 && cue.time <= 10));
  assert.equal(cues.find(cue => cue.label === '有效编号').id, 'same-2');
  assert.equal(cues.find(cue => cue.label === '预留编号').id, 'cue-1');
  assert.equal(cues.find(cue => cue.label === '有效编号').time, 10);
  assert.deepEqual(cues.map(cue => cue.label).sort(), raw.cueMarkers.map(cue => cue.label).sort());
  assert.deepEqual(raw, before);
  assert.deepEqual(normalizeSettings(raw, 10).cueMarkers, cues);
});

test('legacy point-to-range migration and new point cues coexist without conversion between them', () => {
  const value = normalizeSettings({
    a: 1, b: 3, regionSet: true, loop: true,
    markers: [{ id: 'old-a', time: 2, label: '老段落甲' }, { id: 'old-b', time: 7, label: '老段落乙' }],
    cueMarkers: [{ id: 'new', time: 4, label: '新节点' }, { id: 'new-end', time: 10, label: '最后节点' }],
  }, 10);
  assert.deepEqual(value.markers, [
    { id: 'old-a', time: 2, end: 7, label: '老段落甲' }, { id: 'old-b', time: 7, end: 10, label: '老段落乙' },
  ]);
  assert.deepEqual(value.cueMarkers, [{ id: 'new', time: 4, label: '新节点' }, { id: 'new-end', time: 10, label: '最后节点' }]);
  assert.equal(value.a, 1); assert.equal(value.b, 3); assert.equal(value.loop, true);
});

test('hidden or exited temporary loop cannot restore enabled, while all saved ranges and cues survive', () => {
  const original = {
    a: 2, b: 5, regionSet: false, loop: true, activeMarkerId: 'verse',
    markers: [{ id: 'verse', time: 2, end: 5, label: '主歌' }],
    cueMarkers: [{ id: 'node', time: 10, label: '结尾节点' }], markerMode: 'range',
  };
  const restored = normalizeSettings(original, 10);
  assert.equal(restored.loop, false);
  assert.equal(restored.regionSet, false);
  assert.equal(restored.a, 2); assert.equal(restored.b, 5);
  assert.equal(restored.activeMarkerId, 'verse');
  assert.deepEqual(restored.markers, original.markers);
  assert.deepEqual(restored.cueMarkers, original.cueMarkers);
  assert.equal(restored.markerMode, 'range');
  const selected = normalizeSettings({ ...restored, regionSet: true, loop: true }, 10);
  assert.equal(selected.loop, true);
  const exited = normalizeSettings({ ...selected, regionSet: false, loop: false }, 10);
  assert.equal(exited.loop, false); assert.equal(exited.regionSet, false);
  assert.deepEqual(exited.markers, original.markers); assert.deepEqual(exited.cueMarkers, original.cueMarkers);
});

test('marker modes accept only node or range; malformed optional cue fields safely default', () => {
  assert.equal(normalizeSettings({ markerMode: 'node' }, 10).markerMode, 'node');
  assert.equal(normalizeSettings({ markerMode: 'range' }, 10).markerMode, 'range');
  for (const invalid of ['other', '', null, undefined, 0, {}]) {
    assert.equal(normalizeSettings({ markerMode: invalid }, 10).markerMode, 'node');
  }
  for (const invalid of [null, undefined, false, {}, 'bad']) {
    assert.deepEqual(normalizeSettings({ cueMarkers: invalid }, 10).cueMarkers, []);
  }
  assert.deepEqual(normalizeSettings({ cueMarkers: [null, 1, {id:'x', time:3, label:'有效'}] }, 10).cueMarkers,
    [{id:'x', time:3, label:'有效'}]);
});

test('cue edits and legacy range migration leave the saved song Blob, metadata and original arrays untouched', () => {
  const audio = new Blob(['old audio content']);
  const settings = {
    a: 1, b: 4, regionSet: true, loop: true,
    markers: [{ id: 'old', time: 2, label: '旧范围名' }],
    cueMarkers: [{ id: 'cue', time: 10, label: '节点名' }], markerMode: 'node',
  };
  const before = structuredClone(settings);
  const song = { id:'old-song', name:'old.wav', duration:10, settings, blob:audio };
  const restored = normalizeSettings(song.settings, song.duration);
  assert.equal(song.blob, audio);
  assert.equal(song.id, 'old-song'); assert.equal(song.name, 'old.wav');
  assert.deepEqual(song.settings, before);
  assert.notEqual(restored.markers, settings.markers); assert.notEqual(restored.cueMarkers, settings.cueMarkers);
  assert.notEqual(restored.cueMarkers[0], settings.cueMarkers[0]);
  assert.equal(restored.markers[0].label, '旧范围名');
  assert.equal(restored.cueMarkers[0].time, 10);
  assert.equal(restored.a, 1); assert.equal(restored.b, 4);
});

test('normalizing cue nodes is idempotent at zero length, very short audio, and normal track ends', () => {
  for (const duration of [0, .001, .02, 10, 600]) {
    const first = normalizeSettings({
      cueMarkers: [{ id:'a', time:duration, label:'终点' }, { id:'a', time:-1, label:'起点' }],
      regionSet:false, loop:true,
    }, duration);
    assert.equal(first.cueMarkers.find(cue => cue.label === '终点').time, duration);
    assert.equal(first.loop, false);
    assert.deepEqual(normalizeSettings(first, duration), first);
  }
});
