import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
// @ts-expect-error This is the directly executed JavaScript build tool.
import { generateServiceWorker } from '../scripts/generate-sw.mjs';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'bass-shape-pwa-'));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<html>release one</html>');
  await writeFile(join(directory, 'assets/app.js'), 'console.log("local")');
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

type WorkerEvent = { waitUntil?: (promise: Promise<unknown>) => void; respondWith?: (promise: Promise<unknown>) => void; request?: object; data?: object };
async function worker(scope = 'https://bass.example/lessons/bass/') {
  await generateServiceWorker(directory);
  const source = await readFile(join(directory, 'sw.js'), 'utf8');
  const listeners: Record<string, (event: WorkerEvent) => void> = {};
  const matches = new Map<string, Response>();
  const addAll = vi.fn(async (requests: Request[]) => { requests.forEach(request => matches.set(request.url, new Response(request.url))); });
  const names = new Set<string>();
  const caches = {
    open: vi.fn(async (name: string) => { names.add(name); return { addAll, match: vi.fn(async (url: string) => matches.get(url)) }; }),
    keys: vi.fn(async () => [...names]),
    delete: vi.fn(async (name: string) => names.delete(name)),
  };
  const skipWaiting = vi.fn(async () => {});
  const claim = vi.fn(async () => {});
  const network = vi.fn(async () => new Response('network'));
  runInNewContext(source, { self: { registration: { scope }, addEventListener: (name: string, callback: (event: WorkerEvent) => void) => { listeners[name] = callback; }, skipWaiting, clients: { claim } }, caches, Request, URL, fetch: network });
  function dispatch(type: string, details: WorkerEvent = {}) {
    let pending: Promise<unknown> | undefined;
    listeners[type]({ ...details, waitUntil: promise => { pending = promise; }, respondWith: promise => { pending = promise; } });
    return pending;
  }
  return { dispatch, listeners, matches, names, caches, addAll, skipWaiting, claim, network };
}

describe('static PWA generation and lifecycle', () => {
  it('pre-caches every local asset with deterministic versions that change with any file', async () => {
    const first = await generateServiceWorker(directory);
    const repeat = await generateServiceWorker(directory);
    expect(first.files).toEqual(['assets/app.js', 'index.html']);
    expect(first.version).toBe(repeat.version);
    await writeFile(join(directory, 'assets/app.js'), 'console.log("updated")');
    expect((await generateServiceWorker(directory)).version).not.toBe(first.version);
  });

  it('requires a built HTML entry', async () => {
    await rm(join(directory, 'index.html'));
    await expect(generateServiceWorker(directory)).rejects.toThrow('dist/index.html');
  });

  it('rolls back an incomplete cache without discarding the current release', async () => {
    const w = await worker();
    const old = 'bass-shape-lab:https%3A%2F%2Fbass.example%2Flessons%2Fbass%2F:old';
    w.names.add(old);
    w.addAll.mockRejectedValueOnce(new Error('asset unavailable'));
    await expect(w.dispatch('install')).rejects.toThrow('asset unavailable');
    expect([...w.names]).toEqual([old]);
    expect(w.skipWaiting).not.toHaveBeenCalled();
    expect(w.claim).not.toHaveBeenCalled();
  });

  it('cleans only old caches from this application scope on activation', async () => {
    const w = await worker();
    await w.dispatch('install');
    const old = 'bass-shape-lab:https%3A%2F%2Fbass.example%2Flessons%2Fbass%2F:old';
    const sibling = 'bass-shape-lab:https%3A%2F%2Fbass.example%2Fanother%2F:old';
    w.names.add(old); w.names.add(sibling); w.names.add('another-app');
    await w.dispatch('activate');
    expect(w.names.has(old)).toBe(false);
    expect(w.names.has(sibling)).toBe(true);
    expect(w.names.has('another-app')).toBe(true);
    expect(w.claim).toHaveBeenCalledOnce();
  });

  it('waits for explicit update consent', async () => {
    const w = await worker();
    await w.dispatch('install');
    expect(w.skipWaiting).not.toHaveBeenCalled();
    await w.dispatch('message', { data: { type: 'UNKNOWN' } });
    expect(w.skipWaiting).not.toHaveBeenCalled();
    await w.dispatch('message', { data: { type: 'SKIP_WAITING' } });
    expect(w.skipWaiting).toHaveBeenCalledOnce();
  });

  it('serves never-before-seen URL settings offline at a subdirectory scope', async () => {
    const w = await worker();
    await w.dispatch('install');
    const response = await w.dispatch('fetch', { request: { method: 'GET', mode: 'navigate', url: 'https://bass.example/lessons/bass/?root=Gb&mode=chord&hidden=1' } }) as Response;
    expect(await response.text()).toBe('https://bass.example/lessons/bass/index.html');
    expect(w.network).not.toHaveBeenCalled();
  });

  it('caches local built assets and never intercepts external, mutating or unknown requests', async () => {
    const w = await worker();
    await w.dispatch('install');
    const response = await w.dispatch('fetch', { request: { method: 'GET', mode: 'cors', url: 'https://bass.example/lessons/bass/assets/app.js' } }) as Response;
    expect(await response.text()).toBe('https://bass.example/lessons/bass/assets/app.js');
    for (const request of [
      { method: 'GET', mode: 'cors', url: 'https://external.example/font.woff2' },
      { method: 'POST', mode: 'cors', url: 'https://bass.example/lessons/bass/assets/app.js' },
      { method: 'GET', mode: 'cors', url: 'https://bass.example/api/anything' },
      { method: 'GET', mode: 'navigate', url: 'https://bass.example/lessons/bass/unknown-path' },
    ]) expect(w.dispatch('fetch', { request })).toBeUndefined();
    expect(w.network).not.toHaveBeenCalled();
  });

  it('ships an installable relative manifest and correctly sized local PNG icons', async () => {
    const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
    expect(manifest).toMatchObject({ id: './', start_url: './', scope: './', display: 'standalone' });
    expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const bytes = await readFile(new URL('../public/' + icon.src, import.meta.url));
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  });
});
