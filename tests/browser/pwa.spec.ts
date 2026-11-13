import { test, expect, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
// @ts-expect-error This is the directly executed JavaScript build tool.
import { generateServiceWorker } from '../../scripts/generate-sw.mjs';

async function waitUntilOfflineReady(page: Page) {
  await expect(page.locator('.connection')).toHaveText('离线已就绪');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

/** An isolated copy allows real update/failure tests without mutating the shared build. */
async function releaseServer(prefix = '/') {
  const directory = await mkdtemp(join(tmpdir(), 'bass-shape-browser-'));
  await cp(resolve('dist'), directory, { recursive: true });
  let failAssets = false;
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    const localPath = pathname.slice(prefix.length) || 'index.html';
    const path = resolve(directory, localPath);
    if (!pathname.startsWith(prefix) || !path.startsWith(directory + sep)) {
      response.writeHead(404).end(); return;
    }
    if (failAssets && localPath.startsWith('assets/')) {
      response.writeHead(503).end('simulated incomplete deployment'); return;
    }
    try {
      const contents = await readFile(path);
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
      response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(contents);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>((complete, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', complete);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start');
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    directory,
    url: origin + prefix,
    origin,
    failAssets: (value: boolean) => { failAssets = value; },
    publish: async (label: string) => {
      const htmlPath = join(directory, 'index.html');
      const current = await readFile(htmlPath, 'utf8');
      await writeFile(htmlPath, current.replace('<html', `<html data-test-release="${label}"`));
      await generateServiceWorker(directory);
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((complete, reject) => server.close(error => error ? reject(error) : complete()));
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('offline reload restores settings, and an unseen shared query works without any network', async ({ page, context }) => {
  const requests: string[] = [];
  context.on('request', request => requests.push(request.url()));
  await page.goto('/?root=E&mode=scale');
  await waitUntilOfflineReady(page);
  expect(requests.every(url => new URL(url).origin === 'http://127.0.0.1:4173')).toBe(true);
  await context.setOffline(true);
  await page.goto('/?root=E&mode=interval&interval=3&view=degree&range=fixed&hidden=1');
  await expect(page.getByRole('heading', { name: 'E · 小三度', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '揭晓答案' })).toBeVisible();
  await expect(page.locator('.fretboard')).toHaveAttribute('aria-label', /1至12品/);
  await expect(page.locator('.connection')).toHaveText('离线练习中');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'E · 小三度', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '揭晓答案' }).click();
  await expect(page.locator('.note-summary')).toContainText('E');
  await expect(page.locator('.note-summary')).toContainText('G');
});

test('manifest, icons and offline entry work from a nested static hosting path', async ({ page, context }) => {
  const release = await releaseServer('/lessons/bass/');
  try {
    await page.goto(release.url + '?root=Bb&mode=chord&chord=maj7');
    await waitUntilOfflineReady(page);
    await expect(page.getByRole('heading', { name: 'B♭maj7', exact: true })).toBeVisible();
    const manifest = await page.evaluate(async () => {
      const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href;
      const data = await (await fetch(href)).json();
      const icons = await Promise.all(data.icons.map(async (icon: { src: string }) => (await fetch(new URL(icon.src, href))).ok));
      const registration = await navigator.serviceWorker.getRegistration();
      return { scope: registration!.scope, startURL: new URL(data.start_url, href).href, icons, display: data.display };
    });
    expect(manifest.scope).toBe(release.url);
    expect(manifest.startURL).toBe(release.url);
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toEqual([true, true, true]);
    await context.setOffline(true);
    await page.goto(release.url + '?root=E&mode=scale&range=follow');
    await expect(page.getByRole('heading', { name: 'E 自然大调音阶', exact: true })).toBeVisible();
    await expect(page.locator('.fretboard')).toHaveAttribute('aria-label', /1至12品/);
  } finally { await release.close(); }
});

test('a new release waits for consent, updates once, and preserves current URL settings', async ({ page }) => {
  const release = await releaseServer();
  try {
    await page.goto(release.url + '?root=E&mode=interval&interval=3&view=degree&range=fixed&hidden=1');
    await waitUntilOfflineReady(page);
    const sharedURL = page.url();
    const initialCaches = await page.evaluate(() => caches.keys());
    await release.publish('two');
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.getByRole('button', { name: '立即更新' })).toBeVisible();
    expect(await page.locator('html').getAttribute('data-test-release')).toBeNull();
    expect(page.url()).toBe(sharedURL);
    expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting)).toBe(true);
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '立即更新' }).click()]);
    await expect(page.locator('html')).toHaveAttribute('data-test-release', 'two');
    await expect(page.getByRole('heading', { name: 'E · 小三度', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '揭晓答案' })).toBeVisible();
    expect(page.url()).toBe(sharedURL);
    await expect(page.locator('.update-banner')).toHaveCount(0);
    const nextCaches = await page.evaluate(() => caches.keys());
    expect(nextCaches).toHaveLength(1);
    expect(nextCaches[0]).not.toBe(initialCaches[0]);
  } finally { await release.close(); }
});

test('an incomplete update fails atomically and the previous release still opens offline', async ({ page, context }) => {
  const release = await releaseServer();
  try {
    await page.goto(release.url + '?root=E&mode=scale');
    await waitUntilOfflineReady(page);
    const initialCaches = await page.evaluate(() => caches.keys());
    await release.publish('broken');
    release.failAssets(true);
    await page.evaluate(async () => {
      const registration = (await navigator.serviceWorker.getRegistration())!;
      const completed = new Promise<void>(resolve => registration.addEventListener('updatefound', () => {
        const worker = registration.installing!;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant') resolve();
        });
      }, { once: true }));
      await registration.update();
      await completed;
    });
    await expect(page.locator('.update-banner')).toHaveCount(0);
    expect(await page.evaluate(() => caches.keys())).toEqual(initialCaches);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'E 自然大调音阶', exact: true })).toBeVisible();
    expect(await page.locator('html').getAttribute('data-test-release')).toBeNull();
  } finally { await release.close(); }
});

test('an update already accepted in another tab remains actionable in this tab', async ({ page, context }) => {
  const release = await releaseServer();
  try {
    await page.goto(release.url);
    await waitUntilOfflineReady(page);
    const second = await context.newPage();
    await second.goto(release.url + '?root=Bb&mode=chord&chord=maj7');
    await waitUntilOfflineReady(second);
    const secondURL = second.url();
    await release.publish('other-tab');
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.getByRole('button', { name: '立即更新' })).toBeVisible();
    await expect(second.getByRole('button', { name: '立即更新' })).toBeVisible();
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '立即更新' }).click()]);
    await expect(page.locator('html')).toHaveAttribute('data-test-release', 'other-tab');
    expect(await second.locator('html').getAttribute('data-test-release')).toBeNull();
    await Promise.all([second.waitForEvent('load'), second.getByRole('button', { name: '立即更新' }).click()]);
    await expect(second.locator('html')).toHaveAttribute('data-test-release', 'other-tab');
    await expect(second.getByRole('heading', { name: 'B♭maj7', exact: true })).toBeVisible();
    expect(second.url()).toBe(secondURL);
  } finally { await release.close(); }
});
