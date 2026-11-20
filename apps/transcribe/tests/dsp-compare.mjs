import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true,args:['--autoplay-policy=no-user-gesture-required','--mute-audio']});
const page=await browser.newPage();
await page.goto('http://127.0.0.1:5178/');
const result=await page.evaluate(async()=>{
  const {default:Stretch}=await import('/node_modules/signalsmith-stretch/SignalsmithStretch.mjs');
  const ctx=new AudioContext();await ctx.resume();
  const n=await Stretch(ctx);const a=new Float32Array(ctx.sampleRate*6);
  for(let i=0;i<a.length;i++)a[i]=.2*Math.sin(2*Math.PI*110*i/ctx.sampleRate);
  await n.addBuffers([a]);
  const processor=ctx.createScriptProcessor(1024,1,1);const g=ctx.createGain();g.gain.value=0;
  const parts=[];processor.onaudioprocess=e=>parts.push(e.inputBuffer.getChannelData(0).slice());
  n.connect(processor).connect(g).connect(ctx.destination);
  await n.schedule({active:true,input:0,rate:.5,semitones:12});
  await new Promise(r=>setTimeout(r,7000));
  await n.stop();
  const data=new Float32Array(parts.length*1024);parts.forEach((p,i)=>data.set(p,i*1024));
  function estimate(start,end){const cross=[];for(let i=Math.round(start*ctx.sampleRate);i<Math.round(end*ctx.sampleRate);i++)if(data[i-1]<=0&&data[i]>0)cross.push(i-data[i]/(data[i]-data[i-1]));return (cross.length-1)*ctx.sampleRate/(cross.at(-1)-cross[0]);}
  function spectral(){let best={frequency:0,power:0};for(let f=217;f<=223;f+=.02){let re=0,im=0;for(let i=ctx.sampleRate;i<ctx.sampleRate*3;i++){const angle=2*Math.PI*f*i/ctx.sampleRate;re+=data[i]*Math.cos(angle);im+=data[i]*Math.sin(angle);}const power=re*re+im*im;if(power>best.power)best={frequency:f,power};}return best;}
  const res={official1sec:estimate(1,2),official4sec:estimate(1,5),spectral:spectral()};
  await ctx.close();return res;
});
console.log(result);
await fs.writeFile(new URL('./dsp-official-comparison.json',import.meta.url),JSON.stringify({inputHz:110,speed:.5,pitchSemitones:12,...result},null,2));
await browser.close();
