import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const buildMeta = /<meta name="btl-build" content="[^"]*"\s*\/?>(?:\r?\n)?/g;

/** Complete versioned offline shells; navigation deliberately bypasses HTTP cache. */
export async function generateServiceWorker(directory = fileURLToPath(new URL('../dist/', import.meta.url))) {
  const dist = resolve(directory);
  async function collect(folder) {
    const entries = await readdir(folder, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async entry => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) return entry.name === 'shape' ? [] : collect(path);
      const name = relative(dist, path).split(sep).join('/');
      return name === 'sw.js' || name.endsWith('.map') ? [] : [name];
    }));
    return nested.flat();
  }
  const files = (await collect(dist)).sort();
  if (!files.includes('index.html')) throw new Error('先运行 Vite 生产构建，再生成离线缓存。');
  const hash = createHash('sha256');
  hash.update(await readFile(fileURLToPath(import.meta.url)));
  let html = '';
  for (const name of files) {
    let content = await readFile(join(dist, name));
    if (name === 'index.html') {
      html = content.toString().replace(buildMeta, '');
      content = Buffer.from(html);
    }
    hash.update(name).update('\0').update(content).update('\0');
  }
  const version = hash.digest('hex').slice(0, 16);
  await writeFile(join(dist, 'index.html'), html.replace('</head>', `<meta name="btl-build" content="${version}"></head>`));
  const source = `/* Bass Transcribe Lab app-shell ${version}. */
const VERSION = '${version}';
const BASE = self.registration.scope;
const PREFIX = 'bass-transcribe-lab:' + BASE + ':';
const CACHE = PREFIX + VERSION;
const FILES = ${JSON.stringify(files)};
const URLS = FILES.map(path => new URL(path, BASE).href);
const ALLOWED = new Set(URLS);
const INDEX = new URL('index.html', BASE).href;
const clientVersions = new Map();
const isEntry = url => url.pathname === new URL(BASE).pathname || url.pathname === new URL(INDEX).pathname;

async function cleanupOldShells() {
  const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .filter(client => isEntry(new URL(client.url)));
  // A historical page cannot report its version. Keep its old assets until it closes.
  if (windows.some(client => clientVersions.get(client.id) !== VERSION)) return;
  for (const key of await caches.keys()) {
    if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  }
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(URLS.map(url => new Request(url, { cache: 'no-store' })));
      // Upgrade even when a legacy cache-first page remains open. This never navigates a tab.
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Do not claim unrelated/uncontrolled pages, and never force a playing tab to reload.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (!isEntry(new URL(client.url))) continue;
      client.postMessage({ type: 'BTL_UPDATE_READY', version: VERSION });
      client.postMessage({ type: 'BTL_QUERY_CLIENT_VERSION' });
    }
    await cleanupOldShells();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'BTL_GET_VERSION') event.ports[0]?.postMessage({ version: VERSION });
  if (event.data?.type === 'BTL_CLIENT_VERSION' && event.source?.id) {
    clientVersions.set(event.source.id, event.data.version);
    event.waitUntil(cleanupOldShells());
  }
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(BASE)) return;
  if (event.request.mode === 'navigate' && isEntry(url)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(new Request(event.request, { cache: 'no-store' }));
        if (response.ok && response.headers.get('content-type')?.includes('text/html')) return response;
      } catch { /* A complete cached shell remains available offline. */ }
      // Never replace this version's cached HTML with a newer shell whose assets are not cached yet.
      return (await (await caches.open(CACHE)).match(INDEX)) || Response.error();
    })());
    return;
  }
  url.search = '';
  const isOwnAsset = url.pathname.startsWith(new URL('assets/', BASE).pathname);
  if (!ALLOWED.has(url.href) && !isOwnAsset) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(url.href);
    if (cached) return cached;
    // Old open tabs may still lazily request a file from their original complete build.
    for (const key of (await caches.keys()).reverse()) {
      if (!key.startsWith(PREFIX) || key === CACHE) continue;
      const old = await (await caches.open(key)).match(url.href);
      if (old) return old;
    }
    return fetch(event.request);
  })());
});
`;
  await writeFile(join(dist, 'sw.js'), source);
  return { version, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dist = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../dist/', import.meta.url));
  const result = await generateServiceWorker(dist);
  console.log(`离线缓存已生成：${result.files.length} 个本地文件，版本 ${result.version}`);
}
