import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const base=process.env.BTL_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.BTL_BROWSER||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',args:['--mute-audio']});
const results=[],errors=[],contexts=[];
async function check(name,fn){try{const detail=await fn();results.push({name,pass:true,detail:detail??''});console.log('PASS',name,JSON.stringify(detail??''));}catch(error){results.push({name,pass:false,detail:error.message});console.log('FAIL',name,error.message);}}
const val=(page,label)=>page.getByLabel(label,{exact:true}).inputValue().then(Number);
const blur=page=>page.evaluate(()=>document.activeElement?.blur());
const region=async page=>({a:Number(await page.getByTestId('loop-start-handle').getAttribute('aria-valuenow')),b:Number(await page.getByTestId('loop-end-handle').getAttribute('aria-valuenow'))});
const near=(actual,expected,tolerance=.075)=>assert(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
const unique=async page=>{await expect(page.getByTestId('waveform-region')).toHaveCount(1);assert.equal(await page.getByTestId('section-region').count(),0);assert.equal(await page.locator('.wave-sections').count(),0);};
async function closePanel(page){if(await page.getByTestId('sections-panel').count())await page.getByRole('button',{name:'关闭段落管理',exact:true}).click();}
async function openPanel(page){if(!await page.getByTestId('sections-panel').count())await page.getByTestId('sections-toggle').click();}
async function example(page){await page.goto(base);await page.getByRole('button',{name:'播放示例',exact:true}).click();await expect(page.getByRole('heading',{name:'贝斯示例.wav',exact:true})).toBeVisible({timeout:20000});await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();await page.getByRole('button',{name:'暂停',exact:true}).click();}
async function setSpeed(page,percent){const slider=page.getByLabel('播放速度',{exact:true});await slider.focus();await slider.press('Home');for(let n=25;n<percent;n+=5)await slider.press('ArrowRight');await blur(page);await expect(slider).toHaveValue(String(percent));}
async function readSong(page,id){return page.evaluate(id=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('bass-transcribe-lab-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{
    const db=request.result,tx=db.transaction(['songs','audio'],'readonly'),key=id||localStorage.getItem('btl-last-song');
    const song=tx.objectStore('songs').get(key),audio=tx.objectStore('audio').get(key);
    tx.oncomplete=async()=>{db.close();try{const blob=audio.result?.blob;const hash=blob?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join(''):null;resolve({song:song.result,audioSize:blob?.size,audioHash:hash});}catch(error){reject(error);}};tx.onerror=()=>reject(tx.error);
  };
}),id);}
async function seed(page,bytes,settings,id='unified-legacy'){
  return page.evaluate(async({base64,settings,id})=>{
    const data=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),blob=new Blob([data],{type:'audio/wav'});
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('bass-transcribe-lab-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction(['songs','audio'],'readwrite');tx.objectStore('songs').put({id,name:`${id}.wav`,type:'audio/wav',size:blob.size,duration:3,createdAt:Date.now(),updatedAt:Date.now(),audioSaved:true,settings});tx.objectStore('audio').put({id,blob});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();localStorage.setItem('btl-last-song',id);
  },{base64:bytes.toString('base64'),settings,id});
}

try{
  for(const width of [390,320]){
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});contexts.push(context);
    const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));const cdp=await context.newCDPSession(page);
    async function touch(x1,y1,x2,y2){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1,id:1,radiusX:4,radiusY:4,force:1}]});for(let i=1;i<=14;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*i/14,y:y1+(y2-y1)*i/14,id:1,radiusX:4,radiusY:4,force:1}]});await page.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);}
    async function seekTouch(seconds){await page.getByTestId('waveform-scroll').scrollIntoViewIfNeeded();const box=await page.getByTestId('waveform-scroll').boundingBox();await page.touchscreen.tap(box.x+box.width*seconds/16,box.y+145);await page.waitForTimeout(80);}
    await check(`${width}px初始未建loop：无overlay、无AB双边界、禁止保存`,async()=>{
      await example(page);await expect(page.getByTestId('waveform-region')).toHaveCount(0);await expect(page.getByTestId('loop-start-handle')).toHaveCount(0);await expect(page.getByTestId('loop-end-handle')).toHaveCount(0);
      await expect(page.getByRole('button',{name:'循环 L',exact:true})).toBeDisabled();await openPanel(page);await expect(page.getByRole('button',{name:'保存当前循环',exact:true})).toBeDisabled();assert.equal(await page.getByRole('button',{name:'添加段落',exact:true}).count(),0);await closePanel(page);return {touchPoints:await page.evaluate(()=>navigator.maxTouchPoints),regionSet:false};
    });
    await check(`${width}pxTouch第一标记仅pending A，第二标记统一生成唯一AB`,async()=>{
      await seekTouch(2);await page.getByRole('button',{name:/添加标记/}).tap();await expect(page.getByTestId('loop-start-handle')).toHaveAttribute('aria-disabled','true');await expect(page.getByTestId('loop-end-handle')).toHaveCount(0);await expect(page.getByTestId('waveform-region')).toHaveCount(0);
      await openPanel(page);await expect(page.getByRole('button',{name:'保存当前循环',exact:true})).toBeDisabled();await closePanel(page);
      await seekTouch(6);await page.getByRole('button',{name:/添加标记/}).tap();await unique(page);const ab=await region(page);near(ab.a,2);near(ab.b,6);await expect(page.getByRole('button',{name:'循环 L',exact:true})).toHaveAttribute('aria-pressed','true');return ab;
    });
    if(width===390){
      await check('390px Touch非中心抓取A/B和整条：位移不跳边界',async()=>{
        const wave=await page.getByTestId('waveform').boundingBox(),before=await region(page);let box=await page.getByTestId('loop-start-handle').boundingBox();
        await touch(box.x+box.width/2+8,box.y+90,box.x+box.width/2+8+wave.width*.025,box.y+90);
        const first=await region(page);near(first.a,before.a+.4);near(first.b,before.b);
        box=await page.getByTestId('loop-end-handle').boundingBox();await touch(box.x+box.width/2-6,box.y+90,box.x+box.width/2-6+wave.width*.05,box.y+90);
        const second=await region(page);near(second.a,first.a);near(second.b,before.b+.8);
        box=await page.locator('.wave-region-move').boundingBox();await touch(box.x+box.width/2,box.y+12,box.x+box.width/2+wave.width*.05,box.y+12);
        const after=await region(page);near(after.a,before.a+1.2);near(after.b,before.b+1.6);await unique(page);return {before,first,second,after};
      });
    }
    let savedId,blobHash,savedBounds;
    await check(`${width}px保存当前循环→命名同一band，tag改名/选择不溢出`,async()=>{
      savedBounds=await region(page);await openPanel(page);await page.getByRole('button',{name:'保存当前循环',exact:true}).tap();const input=page.getByTestId('sections-panel').getByRole('textbox').first();await expect(input).toBeFocused();await input.fill(`统一循环${width}`);await input.press('Enter');await expect(input).toHaveValue(`统一循环${width}`);
      const box=await page.getByTestId('sections-panel').boundingBox();assert(box.x>=0&&box.x+box.width<=width+.1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
      await page.getByTestId('sections-panel').getByRole('button',{name:`选择段落 统一循环${width}`,exact:true}).tap();await closePanel(page);await expect(page.locator('.wave-region-label')).toHaveText(`统一循环${width}`);await unique(page);assert.deepEqual(await region(page),savedBounds);
      await page.waitForTimeout(700);const stored=await readSong(page);savedId=stored.song.settings.activeMarkerId;blobHash=stored.audioHash;assert(savedId);assert.equal(stored.song.settings.regionSet,true);const marker=stored.song.settings.markers.find(m=>m.id===savedId);near(marker.time,savedBounds.a,.002);near(marker.end,savedBounds.b,.002);return {bounds:savedBounds,panel:box,activeMarkerId:savedId,marker};
    });
    if(width===390){
      await check('390px已保存loop拖动两端/整条：关联marker同步，无第二lane',async()=>{
        await page.getByTestId('waveform').scrollIntoViewIfNeeded();const wave=await page.getByTestId('waveform').boundingBox(),before=await region(page);let box=await page.getByTestId('loop-start-handle').boundingBox();
        await touch(box.x+box.width/2+7,box.y+95,box.x+box.width/2+7+wave.width*.025,box.y+95);
        box=await page.getByTestId('loop-end-handle').boundingBox();await touch(box.x+box.width/2-5,box.y+95,box.x+box.width/2-5-wave.width*.025,box.y+95);
        box=await page.locator('.wave-region-move').boundingBox();await touch(box.x+box.width/2,box.y+12,box.x+box.width/2+wave.width*.05,box.y+12);
        const after=await region(page);near(after.a,before.a+1.2);near(after.b,before.b+.4);await page.waitForTimeout(700);const stored=await readSong(page);assert.equal(stored.song.settings.activeMarkerId,savedId);const marker=stored.song.settings.markers.find(m=>m.id===savedId);near(marker.time,after.a,.002);near(marker.end,after.b,.002);await expect(page.locator('.wave-region-label')).toHaveText('统一循环390');await unique(page);savedBounds=after;return {before,after,marker};
      });
      await check('390pxR固定目标和O三档仍正确，名称输入不触发播放快捷键',async()=>{
        await page.getByLabel('R练习速度',{exact:true}).fill('80');await setSpeed(page,65);await page.keyboard.press('r');assert.equal(await val(page,'播放速度'),100);await page.keyboard.press('r');assert.equal(await val(page,'播放速度'),80);assert.equal(await val(page,'R练习速度'),80);
        await page.getByLabel('音高细调',{exact:true}).fill('0');await blur(page);const octave=[];for(let i=0;i<3;i++){await page.keyboard.press('o');octave.push(await val(page,'音高细调'));}assert.deepEqual(octave,[12,24,0]);await page.getByLabel('音高细调',{exact:true}).fill('2.3');await blur(page);await page.keyboard.press('o');assert.equal(await val(page,'音高细调'),0);
        await openPanel(page);const input=page.getByTestId('sections-panel').getByRole('textbox').first();await input.fill('名称');await input.press('r');await input.press('o');await input.press('Space');assert.equal(await val(page,'播放速度'),80);assert.equal(await val(page,'音高细调'),0);await expect(page.getByRole('button',{name:'播放',exact:true})).toBeVisible();await input.fill('统一循环390');await input.press('Enter');await closePanel(page);return {r:[65,100,80],target:80,octave,textInputProtected:true};
      });
    }
    await check(`${width}px刷新恢复activeMarkerId/AB/名称与同一音频Blob`,async()=>{
      await page.waitForTimeout(2200);const before=await readSong(page);await page.reload();await expect(page.getByRole('heading',{name:'贝斯示例.wav',exact:true})).toBeVisible({timeout:15000});await unique(page);await expect(page.locator('.wave-region-label')).toHaveText(`统一循环${width}`);const after=await readSong(page);assert.equal(after.song.settings.activeMarkerId,savedId);assert.equal(after.song.settings.regionSet,true);assert.deepEqual(await region(page),savedBounds);assert.equal(after.audioHash,blobHash);assert.deepEqual(after.song.settings.markers,before.song.settings.markers);
      if(width===390)assert.equal(await val(page,'R练习速度'),80);return {ab:await region(page),activeMarkerId:after.song.settings.activeMarkerId,audioSize:after.audioSize,audioSHA256:after.audioHash};
    });
    await check(`${width}px重新添加第一标记禁保存，选择已存循环结束pending`,async()=>{
      await page.getByRole('button',{name:/添加标记/}).tap();await expect(page.getByTestId('waveform-region')).toHaveCount(0);await expect(page.getByTestId('loop-start-handle')).toHaveAttribute('aria-disabled','true');await openPanel(page);await expect(page.getByRole('button',{name:'保存当前循环',exact:true})).toBeDisabled();await page.getByTestId('sections-panel').getByRole('button',{name:`选择段落 统一循环${width}`,exact:true}).tap();await closePanel(page);await unique(page);assert.deepEqual(await region(page),savedBounds);await expect(page.locator('.wave-region-label')).toHaveText(`统一循环${width}`);return {pendingCannotSave:true,selectedRange:savedBounds};
    });
    if(width===390){
      await check('390px统一loop的Touch水平pan与页面纵向滚动不误改范围',async()=>{
        const zoom=page.getByLabel('波形缩放',{exact:true});await zoom.focus();await zoom.press('Home');for(let i=0;i<10;i++)await zoom.press('ArrowRight');await blur(page);await page.getByRole('button',{name:'拖动视图',exact:true}).tap();const scroll=page.getByTestId('waveform-scroll');await scroll.scrollIntoViewIfNeeded();const rect=await scroll.boundingBox(),before=await region(page),left=await scroll.evaluate(el=>el.scrollLeft);
        const point=await page.evaluate(rect=>{for(const r of [.65,.5,.8,.9]){const x=rect.x+rect.width*r,y=rect.y+185,hit=document.elementFromPoint(x,y);if(hit&&!hit.closest('[data-drag]'))return {x,y};}return null;},rect);assert(point);await touch(point.x,point.y,point.x-rect.width*.35,point.y);const moved=await scroll.evaluate(el=>el.scrollLeft);assert(moved>left+25,`${left}->${moved}`);assert.deepEqual(await region(page),before);await page.getByRole('button',{name:'拖动视图',exact:true}).tap();
        await zoom.focus();await zoom.press('Home');await blur(page);await scroll.scrollIntoViewIfNeeded();const bounds=await scroll.boundingBox(),startY=await page.evaluate(()=>scrollY);await touch(bounds.x+bounds.width*.75,bounds.y+220,bounds.x+bounds.width*.75,bounds.y+70);const endY=await page.evaluate(()=>scrollY);assert(endY>startY+25);assert.deepEqual(await region(page),before);await page.evaluate(()=>scrollTo(0,0));await expect(page.getByRole('heading',{name:'扒谱',exact:true})).toBeVisible();await page.screenshot({path:fileURLToPath(new URL('../docs/unified-loop-mobile.png',import.meta.url)),fullPage:true});return {pan:{left,moved},vertical:{startY,endY},unchanged:before};
      });
    }
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  const bytes=await fs.readFile(new URL('./fixtures/tone.wav',import.meta.url)),hash=createHash('sha256').update(bytes).digest('hex');
  const old={position:.4,speed:.65,practiceSpeed:.8,pitch:0,a:.5,b:1.5,loop:false,gap:0,rewind:0,step:3,fineStep:1,eq:[0,0,0],markers:[{id:'old-point',time:.5,label:'旧点段落'},{id:'old-end',time:1.5,end:2.6,label:'旧范围段落'}]};
  await check('真实旧IDB无regionSet的point/end兼容：推断当前loop和关联、Blob字节保留',async()=>{
    await seed(page,bytes,old);await page.reload();await expect(page.getByRole('heading',{name:'unified-legacy.wav',exact:true})).toBeVisible({timeout:15000});await unique(page);await expect(page.locator('.wave-region-label')).toHaveText('旧点段落');await page.waitForTimeout(700);const first=await readSong(page);assert.equal(first.audioHash,hash);assert.equal(first.song.settings.regionSet,true);assert.equal(first.song.settings.activeMarkerId,'old-point');assert.deepEqual(first.song.settings.markers,[{id:'old-point',time:.5,end:1.5,label:'旧点段落'},{id:'old-end',time:1.5,end:2.6,label:'旧范围段落'}]);
    await page.reload();await expect(page.getByRole('heading',{name:'unified-legacy.wav',exact:true})).toBeVisible();const second=await readSong(page);assert.deepEqual(second.song.settings.markers,first.song.settings.markers);assert.equal(second.song.settings.activeMarkerId,'old-point');assert.equal(second.audioHash,hash);return {markers:second.song.settings.markers,activeMarkerId:'old-point',audioSize:second.audioSize,audioSHA256:hash};
  });
  await check('旧整曲默认0/duration且loop关闭，恢复后仍无loop而非默认整曲选中',async()=>{
    await seed(page,bytes,{...old,a:0,b:3,loop:false,markers:[]},'unified-legacy-default');await page.reload();await expect(page.getByRole('heading',{name:'unified-legacy-default.wav',exact:true})).toBeVisible();await expect(page.getByTestId('waveform-region')).toHaveCount(0);await page.waitForTimeout(600);const result=await readSong(page);assert.equal(result.song.settings.regionSet,false);assert.equal(result.audioHash,hash);return {regionSet:false,audioSHA256:hash};
  });
  await check('新数据显式regionSet且未关联：同范围marker不会在刷新时自动接管AB',async()=>{
    await seed(page,bytes,{...old,regionSet:true,activeMarkerId:undefined},'unified-new-unlinked');await page.reload();await expect(page.getByRole('heading',{name:'unified-new-unlinked.wav',exact:true})).toBeVisible();await unique(page);await expect(page.locator('.wave-region-label')).toHaveText('');await page.waitForTimeout(600);const result=await readSong(page);assert.equal(result.song.settings.activeMarkerId,undefined);assert.deepEqual(await region(page),{a:.5,b:1.5});assert.equal(result.audioHash,hash);return {activeMarkerId:null,ab:await region(page),audioSHA256:hash};
  });
  await check('所有生产页面无未捕获JavaScript异常',async()=>{assert.deepEqual(errors,[]);return {errors};});
}finally{
  for(const context of contexts)await context.close().catch(()=>{});await browser.close().catch(()=>{});const passed=results.filter(r=>r.pass).length;
  const report=`# 统一循环触控、保存和快捷键回归\n\n${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（Asia/Shanghai）。本机 Microsoft Edge Chromium / Playwright 无界面，独立临时浏览器配置。生产预览${base}。触控仿真390×844和320×844，hasTouch/isMobile，CDP派发touchStart/touchMove/touchEnd；桌面兼容夹具1440×1000。示例真实启动后暂停，没有放宽自动播放策略。\n\n**${passed}/${results.length} 项通过。**\n\n| 行为 | 结果 | 证据 |\n| --- | --- | --- |\n${results.map(r=>`| ${r.name} | ${r.pass?'通过':'失败'} | ${JSON.stringify(r.detail).replaceAll('|','/').replaceAll('\n',' ')} |`).join('\n')}\n\n唯一工作流：添加两个标记或拖出范围建立当前AB；“保存当前循环”仅给该范围增加名称和保存关联；命名后的范围仍使用同一overlay和可拖动上沿，不绘制独立段落lane。测试同时检查保存后拖动同步marker、未完成标记禁保存、刷新关联、旧point/end兼容和新未关联范围不被旧marker接管。旧音频使用合法合成WAV，按完整SHA-256比较保存前后字节。\n\n截图unified-loop-mobile.png来自正常应用页面，390px浏览器触控仿真，非浏览器插件。\n\n限制：未验证实体手机、iOS/Safari、Android硬件、系统软键盘/音频后台行为。本轮不重测DSP频谱和SW升级；未执行外部部署或中国大陆网络访问验收。\n`;
  await fs.writeFile(new URL('../docs/UNIFIED-TOUCH-RESULTS.md',import.meta.url),report);console.log(`RESULT ${passed}/${results.length}`);if(passed!==results.length)process.exitCode=1;
}
