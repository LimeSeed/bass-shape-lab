import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true,args:['--autoplay-policy=no-user-gesture-required','--mute-audio']});
const page=await browser.newPage();
await page.goto(process.env.DSP_URL||'http://127.0.0.1:5178/');
const result=await page.evaluate(async()=>{
  const {AudioEngine}=await import('/src/audio/engine.ts');
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const ctx=new AudioContext({sampleRate:48000});
  const engine=new AudioEngine(ctx);let errors=[];engine.onError=message=>errors.push(message);
  const b=ctx.createBuffer(2,ctx.sampleRate*3,ctx.sampleRate);
  for(let c=0;c<2;c++){const data=b.getChannelData(c);for(let i=0;i<data.length;i++)data[i]=.95*Math.sin(2*Math.PI*(c?220:110)*i/ctx.sampleRate);}
  await engine.load(b);
  const capture=ctx.createScriptProcessor(1024,2,2),silent=ctx.createGain();silent.gain.value=0;
  engine.output.connect(capture).connect(silent).connect(ctx.destination);
  let peak=0,nonFinite=0,step=0;const samples=[[],[]];
  capture.onaudioprocess=e=>{for(let c=0;c<2;c++){const d=e.inputBuffer.getChannelData(c);samples[c].push(d.slice());for(let i=0;i<d.length;i++){peak=Math.max(peak,Math.abs(d[i]));if(!Number.isFinite(d[i]))nonFinite++;if(i)step=Math.max(step,Math.abs(d[i]-d[i-1]));}}};
  engine.setParams({speed:.5,pitch:12});await engine.play();await delay(2200);engine.pause();
  const frequency=[];
  for(let c=0;c<2;c++){const d=new Float32Array(samples[c].length*1024);samples[c].forEach((a,i)=>d.set(a,i*1024));const crossings=[];for(let i=ctx.sampleRate*.5;i<ctx.sampleRate*1.8;i++)if(d[i-1]<=0&&d[i]>0)crossings.push(i-d[i]/(d[i]-d[i-1]));frequency.push((crossings.length-1)*ctx.sampleRate/(crossings.at(-1)-crossings[0]));}
  samples[0]=[];samples[1]=[];peak=0;step=0;
  engine.setEQ([12,12,12]);engine.setVolume(1);
  await engine.seek(.5);await engine.play();await delay(350);
  for(let i=0;i<120;i++) {
    engine.setParams({speed:.25+(i%26)*.05,pitch:i%3*12,loop:i%2===0,a:.2,b:1.5,gap:.1});
    await engine.seek(.2+(i%10)*.1);
    if(i%12===0){engine.pause();await engine.play();}
    await delay(8);
  }
  await delay(300);engine.pause();await delay(80);
  const stressPosition=engine.position;
  // Replacing samples repeatedly exercises release of old worklet buffer refs.
  for(let i=0;i<12;i++)await engine.load(b);
  capture.disconnect();silent.disconnect();await engine.dispose();
  return {sampleRate:ctx.sampleRate,frequency48k:frequency,expectedFrequency48k:[220,440],peakAfterPositiveEQ:peak,maxSampleStepDuringStress:step,nonFinite,errors,stressPosition,seekAndParamChanges:120,bufferReplacements:12,closed:ctx.state,
    limitations:'Node/context lifecycle verified; GC/physical device memory reclamation not instrumented.'};
});
await browser.close();await fs.writeFile(new URL('./dsp-stress-results.json',import.meta.url),JSON.stringify(result,null,2));console.log(result);
if(result.nonFinite||result.errors.length||result.peakAfterPositiveEQ>1||result.closed!=='closed'||result.frequency48k.some((f,i)=>Math.abs(1200*Math.log2(f/result.expectedFrequency48k[i]))>20))process.exitCode=1;
