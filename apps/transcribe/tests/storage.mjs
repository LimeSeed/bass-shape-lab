import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import ts from 'typescript';

// Isolated real-browser storage regression. Route interception only serves this
// module and a blank page; IndexedDB, transactions, and Blobs are the browser's.
const source = await readFile(new URL('../src/storage.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const browser = await chromium.launch({
  executablePath: process.env.BTL_BROWSER || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  headless: true,
});
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const origin = 'http://localhost:4711';
await page.route(`${origin}/**`, async route => {
  const isModule = new URL(route.request().url()).pathname === '/storage.js';
  await route.fulfill({
    status: 200,
    contentType: isModule ? 'application/javascript' : 'text/html',
    body: isModule ? javascript : '<!doctype html><html lang="zh"><title>Storage regression</title><body></body></html>',
  });
});

const results = [];
async function check(name, run) {
  const result = await page.evaluate(run);
  assert.equal(result.pass, true, `${name}: ${JSON.stringify(result)}`);
  results.push({ name, ...result });
}

try {
  await page.goto(`${origin}/`);
  await page.evaluate(async () => {
    window.store = await import('/storage.js');
    window.example = {
      id: 'storage-test', name: 'generated-tone.wav', size: 17,
      type: 'audio/wav', duration: 10, createdAt: Date.now(), updatedAt: Date.now(),
      settings: window.store.defaultSettings(10), blob: new Blob(['local-audio-bytes'], { type: 'audio/wav' }),
    };
  });
  await check('保存与读取真实 Blob，歌曲列表不加载 Blob', async () => {
    const saved = await window.store.saveSong(window.example);
    const loaded = await window.store.getSong(window.example.id);
    const list = await window.store.listSongs();
    return {
      pass: saved.audioSaved === true && loaded.audioSaved === true
        && await loaded.blob.text() === 'local-audio-bytes'
        && list.length === 1 && !Object.hasOwn(list[0], 'blob'),
      audioSaved: saved.audioSaved, listIncludesBlob: Object.hasOwn(list[0], 'blob'),
    };
  });
  await check('设置并发更新保留音频，最后一次参数写入生效', async () => {
    const first = { ...window.example.settings, speed: .5, position: 2, pitch: 12 };
    const last = {
      ...first, speed: .65, practiceSpeed: .65, position: 4.25, a: 2, b: 8,
      loop: true, gap: 1, rewind: 2, step: 5, fineStep: .5, eq: [3, -2, 1],
      markers: [{ id: 'm1', time: 3.25, label: '主歌' }],
    };
    await Promise.all([
      window.store.saveSettings(window.example.id, first),
      window.store.saveSettings(window.example.id, last),
    ]);
    const loaded = await window.store.getSong(window.example.id);
    window.expectedSettings = last;
    return {
      pass: JSON.stringify(loaded.settings) === JSON.stringify(last)
        && await loaded.blob.text() === 'local-audio-bytes',
      speed: loaded.settings.speed, position: loaded.settings.position,
      marker: loaded.settings.markers[0].label,
    };
  });
  await page.reload();
  await check('页面刷新后音频和练习参数恢复', async () => {
    window.store = await import('/storage.js');
    const loaded = await window.store.getSong('storage-test');
    window.example = loaded;
    return {
      pass: loaded.settings.speed === .65 && loaded.settings.position === 4.25
        && loaded.settings.pitch === 12 && loaded.settings.a === 2 && loaded.settings.b === 8
        && loaded.settings.loop === true && loaded.settings.gap === 1
        && loaded.settings.markers[0].label === '主歌'
        && await loaded.blob.text() === 'local-audio-bytes',
      savedBytes: loaded.blob.size,
    };
  });
  await check('仅更新元数据不删除已存音频', async () => {
    const { blob, ...metadata } = window.example;
    const result = await window.store.saveSong({ ...metadata, name: 'renamed.wav' });
    const loaded = await window.store.getSong(metadata.id);
    return { pass: result.audioSaved && loaded.name === 'renamed.wav' && await loaded.blob.text() === 'local-audio-bytes' };
  });
  await check('模拟音频配额失败：元数据降级保存并返回明确提示', async () => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'audio') throw new DOMException('Synthetic quota exhaustion', 'QuotaExceededError');
      return original.apply(this, args);
    };
    try {
      const result = await window.store.saveSong({ ...window.example, id: 'quota-test', name: 'quota.wav' });
      const loaded = await window.store.getSong('quota-test');
      return {
        pass: result.audioSaved === false && !!result.warning?.includes('存储不足')
          && loaded.name === 'quota.wav' && !loaded.blob && loaded.audioSaved === false,
        warning: result.warning, metadataSaved: !!loaded,
      };
    } finally { IDBObjectStore.prototype.put = original; }
  });
  await check('模拟元数据存储失败：抛出错误，不宣称保存成功', async () => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Synthetic quota exhaustion', 'QuotaExceededError');
    };
    try {
      await window.store.saveSong({ ...window.example, id: 'total-failure' });
      return { pass: false, error: 'unexpected successful save' };
    } catch (error) {
      return { pass: error.message.includes('存储不足'), message: error.message };
    } finally { IDBObjectStore.prototype.put = original; }
  });
  await check('自动保存配额失败：抛出明确错误并保留原设置', async () => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Synthetic quota exhaustion', 'QuotaExceededError');
    };
    let message = '';
    try {
      await window.store.saveSettings(window.example.id, { ...window.example.settings, position: 9 });
    } catch (error) {
      message = error.message;
    } finally { IDBObjectStore.prototype.put = original; }
    const loaded = await window.store.getSong(window.example.id);
    return { pass: message.includes('存储不足') && loaded.settings.position === 4.25, message };
  });
  await check('删除与迟到自动保存竞态不重建歌曲，Blob同步删除', async () => {
    await Promise.all([
      window.store.deleteSong(window.example.id),
      window.store.saveSettings(window.example.id, window.example.settings),
    ]);
    const loaded = await window.store.getSong(window.example.id);
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('bass-transcribe-lab-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const audio = await new Promise((resolve, reject) => {
      const request = db.transaction('audio').objectStore('audio').get(window.example.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { pass: !loaded && !audio, metadataDeleted: !loaded, audioDeleted: !audio };
  });
  await check('持久存储请求返回明确布尔状态', async () => {
    const result = await window.store.requestPersistence();
    return { pass: typeof result === 'boolean', granted: result };
  });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log(JSON.stringify({ browser: await browser.version(), platform: process.platform, results, uncaughtErrors: errors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
