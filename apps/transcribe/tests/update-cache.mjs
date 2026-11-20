import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, readdir, cp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateServiceWorker } from '../scripts/generate-sw.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = await mkdtemp(join(tmpdir(), 'bass-update-regression-'));
const oldBuild = join(work, 'legacy');
const newBuild = join(work, 'new');
const nextBuild = join(work, 'next');
const brokenBuild = join(work, 'broken');
const legacyMain = `import { createRoot } from 'react-dom/client';
import App from './App'; import './style.css';
createRoot(document.getElementById('root')).render(<App/>);
if(import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load',()=>{
 navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js').then(async reg=>{
 await navigator.serviceWorker.ready; window.dispatchEvent(new Event('offline-ready'));
 reg.addEventListener('updatefound',()=>window.dispatchEvent(new Event('app-update')));
 }).catch(()=>window.dispatchEvent(new Event('offline-failed')));
});`;
async function makeBuild(directory, label, legacy = false) {
  await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    plugins: legacy ? [{ name: 'historical-main', enforce: 'pre', load(id) {
      if (id === join(root, 'src/main.tsx')) return legacyMain;
    } }] : [], build: { outDir: directory, emptyOutDir: true } });
  await labelBuild(directory, label);
}
async function labelBuild(directory, label) {
  const path = join(directory, 'index.html');
  const html = (await readFile(path, 'utf8')).replace(/<meta name="update-test-build" content="[^"]*">/g, '');
  await writeFile(path, html.replace('</head>', `<meta name="update-test-build" content="${label}"></head>`));
}
async function makeLegacyWorker(directory) {
  async function walk(folder, prefix = '') {
    const all = [];
    for (const item of await readdir(folder, { withFileTypes: true })) {
      if (item.name === 'shape') continue;
      const name = prefix + item.name;
      if (item.isDirectory()) all.push(...await walk(join(folder, item.name), name + '/'));
      else if (name !== 'sw.js') all.push(name);
    }
    return all;
  }
  const files = await walk(directory);
  // Historical production policy: cache-first HTML, no install skipWaiting, activate claims clients.
  await writeFile(join(directory, 'sw.js'), `
const PREFIX='bass-transcribe-lab:'+self.registration.scope+':';
const CACHE=PREFIX+'legacy-test'; const FILES=${JSON.stringify(files)};
const URLS=FILES.map(p=>new URL(p,self.registration.scope).href);
const INDEX=new URL('index.html',self.registration.scope).href;
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS))));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith(PREFIX)&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;
if(e.request.mode==='navigate'&&(u.pathname===new URL(self.registration.scope).pathname||u.href===INDEX)){
e.respondWith(caches.open(CACHE).then(async c=>(await c.match(INDEX))||fetch(e.request)));return;}
u.search='';if(!URLS.includes(u.href))return;e.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.href))||fetch(e.request)));});
`);
  return files.find(name => /^assets\/.*\.js$/.test(name));
}
function wav(seconds = 60) {
  const rate = 22050, frames = rate * seconds, out = Buffer.alloc(44 + frames * 2);
  out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);
  out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)out.writeInt16LE(Math.round(Math.sin(2*Math.PI*110*i/rate)*12000),44+i*2);
  return out;
}
const results = [];
const errors = [];
let currentRoot = oldBuild;
let denyPath = '';
let browser;
let server;
let origin;
const start = Date.now();
async function check(name, fn) {
  const detail = await fn();
  results.push({ name, passed: true, detail });
  console.log('PASS', name, detail ?? '');
}
async function workerVersion(page) {
  return page.evaluate(async () => {
    const worker = (await navigator.serviceWorker.getRegistration())?.active;
    if (!worker) return null;
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close();resolve(null); }, 500);
      channel.port1.onmessage = event => {clearTimeout(timer);channel.port1.close();resolve(event.data?.version ?? null);};
      worker.postMessage({type:'BTL_GET_VERSION'},[channel.port2]);
    });
  });
}
async function waitVersion(page, version) {
  const deadline = Date.now()+20000;
  while(Date.now()<deadline){if(await workerVersion(page)===version)return;await page.waitForTimeout(200);}
  throw new Error(`active worker did not reach ${version}`);
}
const label = page => page.locator('meta[name="update-test-build"]').getAttribute('content');
const position = async page => {const text=await page.getByTestId('position').textContent();const [m,s]=text.split(':').map(Number);return m*60+s;};
try {
  await makeBuild(oldBuild, 'legacy', true);
  const oldAsset = await makeLegacyWorker(oldBuild);
  await makeBuild(newBuild, 'new');
  const release = await generateServiceWorker(newBuild);
  await cp(newBuild, nextBuild, {recursive:true}); await labelBuild(nextBuild,'next');
  const next = await generateServiceWorker(nextBuild);
  await cp(nextBuild, brokenBuild, {recursive:true}); await labelBuild(brokenBuild,'broken');
  await writeFile(join(brokenBuild,'assets/failed-update.js'),'/* download deliberately fails */');
  const broken = await generateServiceWorker(brokenBuild);
  const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.wasm':'application/wasm'};
  server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(pathname===denyPath){res.writeHead(503);res.end('intentional update failure');return;}
      const path=resolve(currentRoot,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
      if(!path.startsWith(currentRoot+'/')){res.writeHead(403);res.end();return;}
      const info=await stat(path);if(!info.isFile())throw new Error('not file');
      // Deliberately stale HTTP HTML: the new SW must bypass this cache on navigation.
      res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream',
        'Cache-Control':path.endsWith('/sw.js')?'no-store':'public, max-age=31536000'});
      res.end(await readFile(path));
    }catch{res.writeHead(404);res.end('missing');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:process.env.BTL_BROWSER||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true,args:['--autoplay-policy=no-user-gesture-required','--mute-audio']});
  const context=await browser.newContext();
  await context.addInitScript(()=>{window.__updateBoot=Math.random().toString(36);window.__updateNotices=[];window.addEventListener('app-update-ready',e=>window.__updateNotices.push(e.detail?.version));});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await check('historical built app and cache-first worker are running',async()=>{
    assert.equal(await label(page),'legacy');
    await page.locator('input[type=file]').setInputFiles({name:'update-tone.wav',mimeType:'audio/wav',buffer:wav()});
    await page.waitForFunction(()=>document.querySelector('.track-name h2')?.textContent==='update-tone.wav');
    await page.evaluate(async()=>{localStorage.setItem('update-sentinel','keep-me');const c=await caches.open('bass-shape-lab:isolated-shape-sentinel');await c.put('/shape/sentinel',new Response('shape-data'));});
    await page.getByRole('button',{name:'播放',exact:true}).click();await page.waitForTimeout(400);
    assert(await position(page)>.1);
    return {legacyCache:true,audioPlaying:true};
  });
  const oldBoot=await page.evaluate(()=>window.__updateBoot),before=await position(page);
  currentRoot=newBuild;
  await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
  await waitVersion(page,release.version);
  await page.waitForTimeout(600);
  await check('legacy client upgrades its worker without waiting forever or interrupting playback',async()=>{
    assert.equal(await page.evaluate(()=>window.__updateBoot),oldBoot);
    assert.equal(await label(page),'legacy');
    assert.equal(await page.getByRole('button',{name:'暂停',exact:true}).count(),1);
    assert(await position(page)>before+.4);
    const oldResource=await page.evaluate(async path=>(await fetch(path,{cache:'no-store'})).status,'/'+oldAsset);
    assert.equal(oldResource,200);
    return {activeVersion:release.version,oldPageStillPlaying:true,oldLazyAssetStatus:oldResource};
  });
  await check('ordinary browser refresh loads new shell and keeps song, localStorage and Shape cache',async()=>{
    await page.reload();assert.equal(await label(page),'new');
    await page.waitForFunction(()=>document.querySelector('.track-name h2')?.textContent==='update-tone.wav');
    const saved=await page.evaluate(async()=>({local:localStorage.getItem('update-sentinel'),shape:!!await(await caches.open('bass-shape-lab:isolated-shape-sentinel')).match('/shape/sentinel'),updateViaCache:(await navigator.serviceWorker.getRegistration()).updateViaCache}));
    assert.equal(saved.local,'keep-me');assert.equal(saved.shape,true);assert.equal(saved.updateViaCache,'none');
    return saved;
  });
  const second=await context.newPage();second.on('pageerror',error=>errors.push(error.message));
  await second.goto(origin);await second.waitForFunction(()=>document.querySelector('.track-name h2')?.textContent==='update-tone.wav');
  await second.getByRole('button',{name:'播放',exact:true}).click();
  const firstBoot=await page.evaluate(()=>window.__updateBoot),secondBoot=await second.evaluate(()=>window.__updateBoot);
  currentRoot=nextBuild;
  await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
  await waitVersion(page,next.version);await page.waitForTimeout(500);
  await check('new update notifies clients while both tabs stay on their current shell',async()=>{
    assert.equal(await page.evaluate(()=>window.__updateBoot),firstBoot);
    assert.equal(await second.evaluate(()=>window.__updateBoot),secondBoot);
    assert.equal(await label(page),'new');assert.equal(await label(second),'new');
    assert((await page.evaluate(()=>window.__updateNotices)).includes(next.version));
    assert.equal(await second.getByRole('button',{name:'暂停',exact:true}).count(),1);
    return {noticeReceived:true,secondTabStillPlaying:true};
  });
  await check('explicit apply reloads only the requesting tab once; other playing tab continues',async()=>{
    let navigations=0;const listener=frame=>{if(frame===page.mainFrame())navigations++;};page.on('framenavigated',listener);
    const loaded=page.waitForNavigation({waitUntil:'load'});
    await page.evaluate(()=>window.dispatchEvent(new Event('app-apply-update')));await loaded;
    await page.waitForTimeout(800);
    assert.equal(await label(page),'next');assert.equal(navigations,1);
    assert.equal(await second.evaluate(()=>window.__updateBoot),secondBoot);
    assert.equal(await second.getByRole('button',{name:'暂停',exact:true}).count(),1);
    page.off('framenavigated',listener);
    return {requestingTabNavigations:navigations,otherTabNavigations:0};
  });
  await second.close();
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();r.active.postMessage({type:'BTL_CLIENT_VERSION',version:document.querySelector('meta[name="btl-build"]').content});});
  await page.waitForTimeout(400);
  await check('old own caches retire after old tabs close; unrelated Shape cache remains',async()=>{
    const keys=await page.evaluate(()=>caches.keys());
    const own=keys.filter(key=>key.startsWith(`bass-transcribe-lab:${origin}/:`));
    assert.deepEqual(own,[`bass-transcribe-lab:${origin}/:${next.version}`]);
    assert(keys.includes('bass-shape-lab:isolated-shape-sentinel'));
    return {ownCacheCount:own.length,shapeCacheRetained:true};
  });
  await check('offline refresh uses complete latest shell and stored audio can play',async()=>{
    await context.setOffline(true);await page.reload();assert.equal(await label(page),'next');
    await page.waitForFunction(()=>document.querySelector('.track-name h2')?.textContent==='update-tone.wav');
    await page.getByRole('button',{name:'播放',exact:true}).click();const startPosition=await position(page);
    await page.waitForTimeout(500);assert(await position(page)>startPosition+.2);
    await page.getByRole('button',{name:'暂停',exact:true}).click();
    return {offlineShell:next.version,audioPlayed:true};
  });
  await context.setOffline(false);currentRoot=brokenBuild;denyPath='/assets/failed-update.js';
  await check('incomplete update never replaces the complete active offline version',async()=>{
    await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
    await page.waitForTimeout(1000);
    assert.equal(await workerVersion(page),next.version);
    const keys=await page.evaluate(()=>caches.keys());assert(!keys.some(key=>key.endsWith(':'+broken.version)));
    await context.setOffline(true);await page.reload();assert.equal(await label(page),'next');
    assert.equal(await page.evaluate(()=>localStorage.getItem('update-sentinel')),'keep-me');
    return {failedVersion:broken.version,workingVersion:next.version};
  });
  assert.deepEqual(errors,[]);
  results.push({name:'no uncaught browser errors',passed:true,detail:errors});
  console.log(JSON.stringify({browser:await browser.version(),results,errors,seconds:(Date.now()-start)/1000},null,2));
} catch(error) {
  results.push({name:'regression failure',passed:false,detail:error.stack});
  console.error(error);process.exitCode=1;
} finally {
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  const report='# 浏览器更新与离线缓存回归\n\n2026-11-19，macOS Microsoft Edge 157.0.4341.60，无头模式。使用 Vite 实际构建的旧 bootstrap/旧 cache-first worker 与新版 app；同一浏览器上下文和同一网址连续切换发布目录，未清除站点数据。\n\n'+results.map(result=>`- ${result.passed?'通过':'失败'}：${result.name}。${JSON.stringify(result.detail??'')}`).join('\n')+'\n\n旧版尚未下载新 worker 时，旧 cache-first 策略仍可能先返回旧 HTML；新 worker 完整安装后会立即激活，下一次普通刷新从网络取新版，不要求清缓存。更新不会自动刷新正在播放的标签页；点击更新的具体暂停和保存由 App 处理。未验证 Safari、Firefox、真实手机、外网 CDN 或长期跨多版本挂起标签页。测试故意使一个更新资源返回 503 验证失败回退，不涉及清理歌曲库。\n\n复现：`node tests/update-cache.mjs`。可用 `BTL_BROWSER` 指定其他 Chromium 可执行文件。\n';
  await writeFile(join(root,'docs/UPDATE-CACHE-RESULTS.md'),report);
  await rm(work,{recursive:true,force:true});
}
