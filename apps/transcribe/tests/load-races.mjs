import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

// Run after the root's final production build, against its existing local preview.
// The isolated context intentionally delays real browser audio decoding; it never
// touches the user's browser profile or runs a second server.
const url = process.env.BTL_URL || 'http://127.0.0.1:4173';
const audioBytes = await readFile(new URL('./fixtures/tone.wav', import.meta.url));
const browser = await chromium.launch({
  executablePath: process.env.BTL_BROWSER || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const context = await browser.newContext();
await context.addInitScript(() => {
  let delays = [];
  try { delays = JSON.parse(localStorage.getItem('__loadRaceNextDelays') || '[]'); localStorage.removeItem('__loadRaceNextDelays'); } catch {}
  window.__loadRaces = { delays, calls: [], failures: [] };
  const decode = AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData = function (...args) {
    const delay = window.__loadRaces.delays.shift() || 0;
    window.__loadRaces.calls.push({ delay, started: performance.now() });
    return decode.apply(this, args).then(async buffer => {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      return buffer;
    });
  };
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const results = [];
async function check(name, action) {
  await action(); results.push({ name, passed: true }); console.log('PASS', name);
}
const input = () => page.locator('input[type=file]');
async function loaded(name) {
  await page.waitForFunction(name => document.querySelector('.track-name h2')?.textContent === name
    && document.querySelector('button.play')?.disabled === false, name);
}
async function library() {
  if (!await page.getByRole('dialog', { name: '本地歌曲库' }).count()) await page.getByRole('button', { name: /^歌曲库/ }).click();
}
async function choose(name) {
  await library();
  await page.locator('.song-list .song-row > button').filter({ hasText: name }).click();
  await loaded(name);
}
try {
  await page.goto(url);
  await input().setInputFiles({ name: 'race-A.wav', mimeType: 'audio/wav', buffer: audioBytes }); await loaded('race-A.wav');
  await page.getByLabel('R练习速度').fill('65'); await page.waitForTimeout(600);
  await input().setInputFiles({ name: 'race-B.wav', mimeType: 'audio/wav', buffer: audioBytes }); await loaded('race-B.wav');

  await check('two song selections in one event turn start only the first load', async () => {
    await library();
    const before = await page.evaluate(() => { window.__loadRaces.delays = [500]; return window.__loadRaces.calls.length; });
    await page.locator('.song-list').evaluate(list => {
      const buttons = [...list.querySelectorAll('.song-row > button')];
      buttons.find(button => button.textContent.includes('race-A.wav')).click();
      buttons.find(button => button.textContent.includes('race-B.wav')).click();
    });
    await loaded('race-A.wav'); await page.waitForTimeout(650);
    assert.equal(await page.locator('.track-name h2').textContent(), 'race-A.wav');
    assert.equal(await page.evaluate(() => window.__loadRaces.calls.length), before + 1);
  });

  await check('failed import releases busy state and preserves the current song and parameters', async () => {
    await input().setInputFiles({ name: 'invalid-race.wav', mimeType: 'audio/wav', buffer: Buffer.from('broken audio') });
    await page.getByRole('alert').waitFor();
    await loaded('race-A.wav');
    assert.equal(await page.getByLabel('R练习速度').inputValue(), '65');
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('button', { name: '关闭提示' }).click();
  });

  await check('user import replaces a delayed automatic restore and the old restore cannot overwrite it', async () => {
    await page.evaluate(() => localStorage.setItem('__loadRaceNextDelays', '[1000,0]'));
    await page.reload();
    await page.waitForFunction(() => window.__loadRaces.calls.length >= 1);
    await input().setInputFiles({ name: 'race-C.wav', mimeType: 'audio/wav', buffer: audioBytes });
    await loaded('race-C.wav'); await page.waitForTimeout(1300);
    assert.equal(await page.locator('.track-name h2').textContent(), 'race-C.wav');
    const remembered = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('bass-transcribe-lab-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const id = localStorage.getItem('btl-last-song');
      const song = await new Promise((resolve, reject) => { const request = db.transaction('songs').objectStore('songs').get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      db.close(); return song?.name;
    });
    assert.equal(remembered, 'race-C.wav');
  });

  await check('deleting a loaded song survives late autosave and refresh without resurrecting audio', async () => {
    await page.getByLabel('R练习速度').fill('70');
    await library();
    await page.getByRole('button', { name: '删除歌曲 race-C.wav', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.track-name h2'));
    await page.waitForTimeout(900); await page.reload(); await page.waitForTimeout(500);
    assert.equal(await page.locator('.track-name h2').count(), 0);
    await library();
    assert.equal(await page.getByRole('button', { name: '删除歌曲 race-C.wav', exact: true }).count(), 0);
    await page.getByRole('button', { name: '关闭面板' }).click();
  });

  await check('database deletion failure leaves the original song usable and unlocks controls', async () => {
    await choose('race-A.wav');
    await page.evaluate(() => {
      window.__originalDelete = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete = function (...args) {
        if (this.name === 'songs') throw new DOMException('Synthetic deletion denied', 'NotAllowedError');
        return window.__originalDelete.apply(this, args);
      };
    });
    await library();
    await page.getByRole('button', { name: '删除歌曲 race-A.wav', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await page.getByRole('alert').waitFor(); await loaded('race-A.wav');
    await page.evaluate(() => { IDBObjectStore.prototype.delete = window.__originalDelete; delete window.__originalDelete; });
    await page.getByRole('button', { name: '关闭面板' }).click();
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('button', { name: '关闭提示' }).click();
  });

  await check('reopening the current song reads parameters after its final save rather than an old snapshot', async () => {
    await page.getByLabel('R练习速度').fill('70');
    await library();
    await page.locator('.song-list .song-row > button').filter({ hasText: 'race-A.wav' }).click();
    await loaded('race-A.wav');
    assert.equal(await page.getByLabel('R练习速度').inputValue(), '70');
  });

  await check('double click or saved section click during slow loading cannot restart the previous song', async () => {
    await page.getByTestId('playhead').press('Home');
    const wave=await page.getByTestId('waveform').boundingBox();await page.mouse.move(wave.x+wave.width*.2,wave.y+180);await page.mouse.down();await page.mouse.move(wave.x+wave.width*.7,wave.y+180,{steps:8});await page.mouse.up();
    await page.getByTestId('sections-toggle').click();await page.getByRole('button',{name:'保存当前循环',exact:true}).click();await page.getByRole('button',{name:'关闭段落管理',exact:true}).click();
    await page.evaluate(() => { window.__loadRaces.delays = [600]; });
    await library();
    await page.locator('.song-list .song-row > button').filter({ hasText: 'race-B.wav' }).click();
    await page.waitForFunction(() => document.querySelector('button.play')?.disabled === true);
    await page.getByTestId('waveform').evaluate(element => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: rect.x + rect.width * .5, clientY: rect.y + 160 }));
    });
    await page.locator('.wave-saved-select').first().evaluate(button=>button.click());
    await page.waitForTimeout(100);
    assert.equal(await page.getByRole('button', { name: '暂停', exact: true }).count(), 0);
    await loaded('race-B.wav');
    assert.equal(await page.getByRole('button', { name: '播放', exact: true }).count(), 1);
  });

  await check('failed progress save stops an update refresh and retains unsaved markers', async () => {
    await page.evaluate(() => {window.__updateApplyCount=0;window.addEventListener('app-apply-update',()=>window.__updateApplyCount++);window.dispatchEvent(new Event('app-update-ready'));window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='songs')throw new DOMException('Synthetic save denied','NotAllowedError');return window.__originalPut.apply(this,args);};});
    await page.getByRole('button',{name:'更新',exact:true}).click();await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(()=>window.__updateApplyCount),0);assert.equal(await page.locator('.track-name h2').textContent(),'race-B.wav');
    await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut;delete window.__originalPut;});
  });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: await browser.version(), url, results, uncaughtErrors: errors }, null, 2));
} finally { await context.close(); await browser.close(); await writeFile(new URL('../docs/LOAD-RACES-RESULTS.md',import.meta.url),'# 歌曲加载与删除竞态回归\n\n2026-11-19，本机Edge无界面浏览器、隔离测试数据。实际解码合成WAV，用可控解码延迟复现竞态，并模拟数据库删除失败。\n\n'+results.map(r=>'通过：'+r.name).join('\n\n')+'\n\n'+results.length+'/8 项完成；页面异常：'+JSON.stringify(errors)+'。\n'); }
