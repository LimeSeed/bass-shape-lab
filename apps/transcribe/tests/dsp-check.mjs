import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const browser = await chromium.launch({
  executablePath: process.env.BTL_BROWSER || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const page = await browser.newPage();
page.on('pageerror', error => console.error('PAGE ERROR', error));
page.on('console', message => { if (message.type() === 'error') console.error('BROWSER', message.text()); });
await page.goto(process.env.DSP_URL || 'http://127.0.0.1:5178/');
const result = await page.evaluate(async () => {
  const { AudioEngine } = await import('/src/audio/engine.ts');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const engine = new AudioEngine();
  const ctx = engine.context;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate;
    data[i] = 0.2 * Math.sin(2 * Math.PI * 110 * t) * Math.min(1, t / .02, (3 - t) / .02);
  }
  await engine.load(buffer);
  const capture = ctx.createScriptProcessor(1024, 1, 1);
  const silence = ctx.createGain(); silence.gain.value = 0;
  engine.output.connect(capture).connect(silence).connect(ctx.destination);
  let chunks = [];
  capture.onaudioprocess = e => chunks.push(e.inputBuffer.getChannelData(0).slice());
  function analyse(input) {
    const count = input.reduce((n, a) => n + a.length, 0);
    const samples = new Float32Array(count);
    let offset = 0;
    for (const chunk of input) { samples.set(chunk, offset); offset += chunk.length; }
    let first = samples.findIndex(v => Math.abs(v) > .005);
    let last = samples.length - 1;
    while (last > first && Math.abs(samples[last]) <= .005) last--;
    const from = Math.max(0, first) + Math.round(.3 * ctx.sampleRate);
    const to = Math.min(last, from + ctx.sampleRate);
    const crossings = [];
    let peak = 0, rms = 0;
    for (let i = from + 1; i < to; i++) {
      if (samples[i-1] <= 0 && samples[i] > 0) crossings.push(i - samples[i] / (samples[i] - samples[i-1]));
      peak = Math.max(peak, Math.abs(samples[i]));
      rms += samples[i] * samples[i];
    }
    const silentRuns = []; let silentStart = -1;
    for(let i=0;i<samples.length;i++) {
      if(Math.abs(samples[i]) < .00001) { if(silentStart<0) silentStart=i; }
      else if(silentStart>=0) { if(i-silentStart>ctx.sampleRate*.05) silentRuns.push((i-silentStart)/ctx.sampleRate); silentStart=-1; }
    }
    return { frequency: (crossings.length - 1) * ctx.sampleRate / (crossings.at(-1) - crossings[0]), silentRuns,
      audibleDuration: (last - first) / ctx.sampleRate, peak, rms: Math.sqrt(rms / (to - from)), capturedSamples: count };
  }
  const cases = [];
  for (const [speed, pitch] of [[1,0],[.5,0],[1,12],[.5,12],[1,24]]) {
    engine.pause(); await engine.seek(0);
    engine.setParams({speed,pitch,loop:false});
    chunks = [];
    await engine.play();
    const start = ctx.currentTime;
    while (engine.playing && ctx.currentTime - start < 3/speed + 2) await delay(20);
    const clockDuration = ctx.currentTime - start;
    await delay(160);
    const measured = analyse(chunks);
    cases.push({speed,pitch,expectedFrequency:110*2**(pitch/12),expectedDuration:3/speed,clockDuration,
      pitchErrorCents:1200*Math.log2(measured.frequency/(110*2**(pitch/12))),...measured});
  }
  const loopTimes = [];
  engine.onLoop = t => loopTimes.push(t);
  engine.setParams({speed:.5,pitch:0,loop:true,a:.5,b:1.1,gap:.2});
  await engine.seek(.5);
  chunks = [];
  await engine.play();
  await delay(6100);
  engine.pause();
  const loopCapture = analyse(chunks);
  const loopIntervals = loopTimes.slice(1).map((t,i) => t-loopTimes[i]);
  const loop = {expectedInterval:1.4,loopTimes,loopIntervals,...loopCapture};

  engine.setParams({speed:1,pitch:0,loop:false});
  const seekBuffer = ctx.createBuffer(1, ctx.sampleRate*4,ctx.sampleRate);
  const seekData = seekBuffer.getChannelData(0);
  for (let i=0;i<seekData.length;i++) seekData[i]=.2*Math.sin(2*Math.PI*(i<ctx.sampleRate*2?110:330)*i/ctx.sampleRate);
  await engine.load(seekBuffer);
  await engine.seek(.5); await engine.play(); await delay(500);
  await engine.seek(2.5); chunks=[]; await delay(1000);
  const seekHigh = analyse(chunks);
  await engine.seek(.5); chunks=[]; await delay(1000);
  const seekLow = analyse(chunks);
  engine.pause(); const pausedPosition = engine.position;
  await delay(250); const pausedAfter = engine.position;
  for(let i=0;i<40;i++) { engine.setParams({speed:.5+(i%10)*.05,pitch:i%3*12}); await engine.seek((i%20)/10); }
  await engine.play(); await delay(300); engine.pause();
  const stressFinite = Number.isFinite(engine.position);
  capture.disconnect(); silence.disconnect(); await engine.dispose();
  return { userAgent:navigator.userAgent,sampleRate:ctx.sampleRate,cases,loop,seekHigh,seekLow,pausedPosition,pausedAfter,stressFinite,closed:ctx.state};
});
await browser.close();
await fs.writeFile(new URL('./dsp-results.json', import.meta.url), JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
const failures=[];
const strictPitchFailures=[];
for(const c of result.cases) {
  if(Math.abs(c.frequency-c.expectedFrequency)>1) strictPitchFailures.push(`frequency ${c.speed}/${c.pitch}`);
  if(Math.abs(c.pitchErrorCents)>20) failures.push(`pitch above explicit 20-cent practical tolerance ${c.speed}/${c.pitch}`);
  if(Math.abs(c.clockDuration-c.expectedDuration)>.12) failures.push(`duration ${c.speed}/${c.pitch}`);
  if(c.rms<.02 || c.peak>.8) failures.push(`signal ${c.speed}/${c.pitch}`);
}
if(result.loop.loopIntervals.length<3 || result.loop.loopIntervals.some(t=>Math.abs(t-1.4)>.002)) failures.push('loop timing');
if(result.loop.silentRuns.filter(t=>t>=.195&&t<=.21).length<3) failures.push('loop silent gaps');
if(Math.abs(result.seekHigh.frequency-330)>1||Math.abs(result.seekLow.frequency-110)>1) failures.push('seek reset');
if(result.pausedPosition!==result.pausedAfter||!result.stressFinite||result.closed!=='closed') failures.push('transport cleanup');
console.log('STRICT 1Hz PITCH CHECK:', strictPitchFailures.length ? `FAIL ${strictPitchFailures.join(', ')}` : 'PASS');
if(failures.length) { console.error('FAIL', failures); process.exitCode=1; }
else console.log('PASS within explicit 20-cent practical pitch tolerance: independent pitch/tempo, render-clock loops, seek, pause, repeated operations, disposal.');
