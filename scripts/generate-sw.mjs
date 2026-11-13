import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Every precached byte participates in the version, including the HTML shell. */
export async function generateServiceWorker(directory = 'dist') {
  const dist = resolve(directory);
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const groups = await Promise.all(entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }));
    return groups.flat();
  }
  const paths = (await walk(dist)).filter((path) => relative(dist, path) !== 'sw.js').sort();
  const hash = createHash('sha256');
  // Worker-behavior changes also get an isolated cache, even with identical UI assets.
  hash.update(await readFile(new URL(import.meta.url))).update('\0');
  const files = [];
  for (const path of paths) {
    const name = relative(dist, path).split(sep).join('/');
    const contents = await readFile(path);
    hash.update(name).update('\0').update(contents).update('\0');
    files.push(name);
  }
  if (!files.includes('index.html')) throw new Error('Build dist/index.html before generating the service worker.');
  const version = hash.digest('hex').slice(0, 20);
  const script = `/* Generated from build contents. Do not edit. */
const BUILD = ${JSON.stringify(version)};
const BASE = self.registration.scope;
const PREFIX = 'bass-shape-lab:' + encodeURIComponent(BASE) + ':';
const CACHE = PREFIX + BUILD;
const FILES = ${JSON.stringify(files)};
const URLS = FILES.map(path => new URL(path, BASE).href);
const ALLOWED = new Set(URLS);
const SHELL = new URL('index.html', BASE).href;

self.addEventListener('install', event => {
  // A partial download must never replace a working, complete offline version.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(URLS.map(url => new Request(url, { cache: 'reload' })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== new URL(BASE).origin) return;
  const isAppEntry = url.pathname === new URL(BASE).pathname || url.pathname === new URL(SHELL).pathname;
  // URL settings share one cached shell; a waiting release stays opt-in.
  if (request.mode === 'navigate' && isAppEntry) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(SHELL) || fetch(request);
    })());
    return;
  }
  if (!ALLOWED.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(url.href) || fetch(request);
  })());
});
`;
  await writeFile(resolve(dist, 'sw.js'), script);
  return { version, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await generateServiceWorker(process.argv[2] || 'dist');
  console.log(`PWA: ${result.files.length} local files cached · ${result.version}`);
}
