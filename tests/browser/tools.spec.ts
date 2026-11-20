import { test, expect, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

/** Test the actual Pages subdirectory, without Vite's SPA fallback. */
async function siteServer() {
  const directory = resolve('dist');
  const prefix = '/bass-shape-lab/';
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    const local = pathname.slice(prefix.length);
    const path = resolve(directory, local + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!pathname.startsWith(prefix) || !path.startsWith(directory + sep)) {
      response.writeHead(404).end(); return;
    }
    try {
      const bytes = await readFile(path);
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
      response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server');
  return { url: `http://127.0.0.1:${address.port}${prefix}`, close: async () => {
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  } };
}

async function ownWorker(page: Page, scope: string) {
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration(location.href))?.active?.scriptURL)).toBe(scope + 'sw.js');
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(scope + 'sw.js');
}

test('Pages paths preserve old Shape links, and both apps restore and play offline independently', async ({ page, context }) => {
  const site = await siteServer();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(site.url + '?root=Bb&mode=chord&chord=maj7&hidden=1');
    await expect(page.getByRole('heading', { name: 'B♭maj7', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '揭晓答案' })).toBeVisible();
    await ownWorker(page, site.url);
    await page.getByRole('link', { name: '工具', exact: true }).click();
    await expect(page.getByRole('heading', { name: '练习工具', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '打开扒谱', exact: true }).click();
    await expect(page.getByRole('heading', { name: '扒谱', exact: true })).toBeVisible();
    await ownWorker(page, site.url + 'transcribe/');
    await page.locator('input[type=file]').setInputFiles(resolve('apps/transcribe/tests/fixtures/tone.wav'));
    await expect(page.getByRole('heading', { name: 'tone.wav', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '添加标记', exact: true }).click();
    await page.getByTestId('cue-name').fill('起拍');
    await page.getByTestId('cue-name').press('Enter');
    await page.getByRole('heading', { name: '扒谱', exact: true }).click();
    const wave = await page.getByTestId('waveform').boundingBox();
    if (!wave) throw new Error('Waveform is missing');
    const y = wave.y + wave.height - 65;
    await page.mouse.move(wave.x + wave.width * .4 / 3, y);
    await page.mouse.down();
    await page.mouse.move(wave.x + wave.width * 2.4 / 3, y, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByTestId('loop-start-handle')).toHaveCount(1);
    await page.getByTestId('sections-toggle').click();
    await page.getByRole('button', { name: '保存当前循环', exact: true }).click();
    const section = page.getByTestId('sections-panel').getByRole('textbox');
    await section.fill('主歌'); await section.press('Enter');
    await page.getByRole('button', { name: '关闭段落管理', exact: true }).click();
    await page.getByLabel('R练习速度').fill('65');
    await page.getByRole('heading', { name: '扒谱', exact: true }).click();
    await page.keyboard.press('r'); await page.keyboard.press('o');
    await expect(page.getByLabel('播放速度', { exact: true })).toHaveValue('65');
    await expect(page.getByLabel('音高细调')).toHaveValue('12');
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(async () => Number(await page.getByTestId('playhead').getAttribute('aria-valuenow'))).toBeGreaterThan(.5);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await expect(page.getByTestId('nodes-toggle')).toContainText('1');
    await expect(page.locator('.wave-saved-region')).toHaveCount(1);
    // Navigation must persist settings and audio before the offline restoration check.
    await page.waitForTimeout(1000);
    const cachesBefore = await page.evaluate(async () => {
      const names = await caches.keys();
      const shape = names.find(name => name.startsWith('bass-shape-lab:'))!;
      return { names, shapeURLs: (await (await caches.open(shape)).keys()).map(request => request.url) };
    });
    expect(cachesBefore.names.some(name => name.startsWith('bass-transcribe-lab:'))).toBe(true);
    expect(cachesBefore.shapeURLs.some(url => url.includes('/transcribe/'))).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'tone.wav', exact: true })).toBeVisible();
    await expect(page.getByLabel('播放速度', { exact: true })).toHaveValue('65');
    await expect(page.getByLabel('音高细调')).toHaveValue('12');
    await expect(page.getByTestId('nodes-toggle')).toContainText('1');
    await expect(page.locator('.wave-saved-region')).toHaveCount(1);
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('link', { name: '工具', exact: true }).click();
    await expect(page.getByRole('heading', { name: '练习工具', exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('link', { name: '打开指板', exact: true }).click();
    await page.goto(site.url + '?root=Gb&mode=interval&interval=7');
    await expect(page.getByRole('heading', { name: 'G♭ · 纯五度', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('.connection')).toHaveText('离线练习中');
    await page.getByRole('link', { name: '扒谱', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'tone.wav', exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(site.url + 'transcribe/sw.js');
    expect(await page.evaluate(() => caches.keys())).toEqual(cachesBefore.names);
    expect(errors).toEqual([]);
  } finally { await site.close(); }
});

test('tool navigation remains visible without overflow on narrow screens', async ({ page }) => {
  const site = await siteServer();
  try {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['tools/', '', 'transcribe/']) {
        await page.goto(site.url + path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${path}`).toBe(true);
        if (path !== 'tools/') await expect(page.getByRole('link', { name: '工具', exact: true })).toBeVisible();
      }
    }
  } finally { await site.close(); }
});
