import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.BTL_URL || 'http://127.0.0.1:4173';
// launch creates its own temporary browser profile; it never reads a user profile.
const browser = await chromium.launch({headless:true,
  executablePath:process.env.BTL_BROWSER || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  args:['--mute-audio']});
const results = [], errors = [];
const contexts = [];
const check = async (name, action) => {
  try { const detail = await action(); results.push({name,pass:true,detail:detail ?? ''}); console.log('PASS',name,JSON.stringify(detail ?? '')); }
  catch(error) { results.push({name,pass:false,detail:error.message}); console.log('FAIL',name,error.message); }
};
const observe = page => page.on('pageerror',error=>errors.push(error.message));
const value = (page,label) => page.getByLabel(label,{exact:true}).inputValue().then(Number);
const region = async page => ({a:Number(await page.getByTestId('loop-start-handle').getAttribute('aria-valuenow')),b:Number(await page.getByTestId('loop-end-handle').getAttribute('aria-valuenow'))});
const blur = page => page.evaluate(()=>document.activeElement?.blur());
const speed = page => value(page,'播放速度');
async function setSpeed(page,percent) {
  const slider=page.getByLabel('播放速度',{exact:true});
  await slider.focus(); await slider.press('Home');
  for(let i=25;i<percent;i+=5) await slider.press('ArrowRight');
  await blur(page); await expect(slider).toHaveValue(String(percent));
}
async function setZoom(page,steps) {
  const slider=page.getByLabel('波形缩放',{exact:true});
  await slider.focus(); await slider.press('Home');
  for(let i=0;i<steps;i++) await slider.press('ArrowRight');
  await blur(page); await page.waitForTimeout(120);
}
async function example(page) {
  await page.goto(base);
  await page.getByRole('button',{name:'播放示例',exact:true}).click();
  await expect(page.getByRole('heading',{name:'贝斯示例.wav',exact:true})).toBeVisible({timeout:20000});
  await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await expect(page.getByRole('button',{name:'播放',exact:true})).toBeVisible();
}
async function mouseDrag(page,x1,y1,x2,y2) {
  await page.mouse.move(x1,y1); await page.mouse.down();
  await page.mouse.move(x2,y2,{steps:12}); await page.mouse.up(); await page.waitForTimeout(120);
}
async function readSong(page,id) {
  return page.evaluate(id=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('bass-transcribe-lab-v1');
    open.onerror=()=>reject(open.error);open.onsuccess=()=>{
      const db=open.result,tx=db.transaction(['songs','audio'],'readonly');
      const meta=tx.objectStore('songs').get(id || localStorage.getItem('btl-last-song'));
      const audio=tx.objectStore('audio').get(id || localStorage.getItem('btl-last-song'));
      tx.oncomplete=async()=>{db.close();try {
        let base64=null;
        if(audio.result?.blob){const bytes=new Uint8Array(await audio.result.blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));base64=btoa(binary);}
        resolve({song:meta.result,audioSize:audio.result?.blob.size,audioType:audio.result?.blob.type,audioBase64:base64});
      }catch(error){reject(error);}};
      tx.onerror=()=>reject(tx.error);
    };
  }),id);
}

try {
  const desktop=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(desktop);
  const page=await desktop.newPage();observe(page);
  await check('桌面生产包：示例实际启动后暂停，已移除旧全览/定位和AB数值框',async()=>{
    await example(page);assert.equal(await page.getByLabel('循环起点秒',{exact:true}).count(),0);assert.equal(await page.getByLabel('循环终点秒',{exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:/全览|定位播放位置/}).count(),0);return {url:page.url(),playing:false};
  });
  await check('固定R目标80%，手调65%后R先100%再80%，不覆盖目标',async()=>{
    await page.getByLabel('R练习速度',{exact:true}).fill('80');await setSpeed(page,65);
    await page.keyboard.press('r');assert.equal(await speed(page),100);await page.keyboard.press('r');assert.equal(await speed(page),80);
    assert.equal(await value(page,'R练习速度'),80);return {sequence:[65,100,80],target:80};
  });
  await check('正在使用旧R目标时改为85%，当前速度同步85%；上下键不改目标',async()=>{
    await page.getByLabel('R练习速度',{exact:true}).fill('85');await blur(page);assert.equal(await speed(page),85);
    await page.keyboard.press('ArrowUp');assert.equal(await speed(page),90);await page.keyboard.press('ArrowDown');assert.equal(await speed(page),85);
    await setSpeed(page,65);assert.equal(await value(page,'R练习速度'),85);await page.keyboard.press('r');assert.equal(await speed(page),100);await page.keyboard.press('r');assert.equal(await speed(page),85);
    return {target:85,manualDoesNotOverwrite:true};
  });
  await check('O三档0→12→24→0，细调先回0，重复keydown不连跳',async()=>{
    await page.getByLabel('音高细调',{exact:true}).fill('0');await blur(page);const sequence=[];
    for(let i=0;i<3;i++){await page.keyboard.press('o');sequence.push(await value(page,'音高细调'));}assert.deepEqual(sequence,[12,24,0]);
    await page.getByLabel('音高细调',{exact:true}).fill('3.2');await blur(page);await page.keyboard.press('o');assert.equal(await value(page,'音高细调'),0);
    await page.keyboard.down('o');assert.equal(await value(page,'音高细调'),12);await page.keyboard.down('o');assert.equal(await value(page,'音高细调'),12);await page.keyboard.up('o');
    await page.keyboard.press('o');await page.keyboard.press('o');assert.equal(await value(page,'音高细调'),0);return {sequence,repeatIgnored:true};
  });
  await check('系统组合键不触发播放器R/O或速度变化',async()=>{
    const before={speed:await speed(page),pitch:await value(page,'音高细调'),target:await value(page,'R练习速度')};
    for(const key of ['Control+ArrowUp','Alt+o','Meta+ArrowDown'])await page.keyboard.press(key);
    assert.deepEqual({speed:await speed(page),pitch:await value(page,'音高细调'),target:await value(page,'R练习速度')},before);return before;
  });
  await check('创建AB后段落默认折叠，添加保存当前范围并自动聚焦名称',async()=>{
    await page.getByTestId('waveform').scrollIntoViewIfNeeded();const box=await page.getByTestId('waveform').boundingBox();
    await mouseDrag(page,box.x+box.width*.2,box.y+140,box.x+box.width*.5,box.y+140);
    assert.equal(await page.getByTestId('sections-toggle').getAttribute('aria-expanded'),'false');await page.getByTestId('sections-toggle').click();
    await page.getByRole('button',{name:'添加段落',exact:true}).click();const name=page.getByTestId('sections-panel').getByRole('textbox').first();
    await expect(name).toBeFocused();await name.fill('  主歌范围  ');await name.press('Enter');await expect(name).toHaveValue('主歌范围');
    const section=page.getByTestId('section-region').first();await expect(section).toBeVisible();await page.waitForTimeout(700);
    const stored=await readSong(page);const marker=stored.song.settings.markers[0],ab=await region(page);
    assert(Math.abs(marker.time-ab.a)<.002&&Math.abs(marker.end-ab.b)<.002);return {marker,ab};
  });
  await check('段落名称输入保护播放快捷键，空名回退，外部点击保存并关闭',async()=>{
    const panel=page.getByTestId('sections-panel'),input=panel.getByRole('textbox').first();
    const before={speed:await speed(page),pitch:await value(page,'音高细调')};await input.fill('');await input.press('Enter');await expect(input).toHaveValue('主歌范围');
    await input.fill('名称');await input.press('r');await input.press('o');await input.press('Space');assert.equal(await speed(page),before.speed);assert.equal(await value(page,'音高细调'),before.pitch);
    await expect(page.getByRole('button',{name:'播放',exact:true})).toBeVisible();await input.fill('主歌范围');await page.locator('h1').click();await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('section-region').first()).toBeVisible();return {textInputProtected:true,waveSectionsRetained:true};
  });
  await check('刷新恢复固定R速度、段落end和歌曲Blob，选择段落设循环',async()=>{
    await page.waitForTimeout(2200);const before=await readSong(page);await page.reload();await expect(page.getByRole('heading',{name:'贝斯示例.wav',exact:true})).toBeVisible({timeout:15000});
    assert.equal(await value(page,'R练习速度'),85);const after=await readSong(page);assert.deepEqual(after.song.settings.markers,before.song.settings.markers);assert.equal(after.audioBase64,before.audioBase64);
    await page.getByTestId('sections-toggle').click();await page.getByTestId('sections-panel').getByRole('button',{name:'选择段落 主歌范围',exact:true}).click();
    const ab=await region(page);assert.equal(ab.a,after.song.settings.markers[0].time);assert.equal(ab.b,after.song.settings.markers[0].end);
    await page.getByRole('button',{name:'关闭段落管理',exact:true}).click();return {target:85,marker:after.song.settings.markers[0],audioSize:after.audioSize};
  });
  await check('旧point数据真实IDB迁移：保留id/时间/名称，补范围，音频Blob不丢',async()=>{
    const bytes=await fs.readFile(new URL('./fixtures/tone.wav',import.meta.url));
    await page.evaluate(async(base64)=>{
      const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:'audio/wav'});
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('bass-transcribe-lab-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      await new Promise((resolve,reject)=>{const tx=db.transaction(['songs','audio'],'readwrite');tx.objectStore('songs').put({id:'legacy-practice-ui',name:'legacy-synthetic.wav',type:'audio/wav',size:blob.size,duration:3,createdAt:Date.now(),updatedAt:Date.now(),audioSaved:true,
        settings:{position:.4,speed:.65,practiceSpeed:.8,pitch:0,a:.2,b:1.5,loop:false,gap:0,rewind:0,step:3,fineStep:1,eq:[0,0,0],markers:[{id:'old-a',time:.5,label:'旧主歌'},{id:'old-b',time:1.5,label:'旧过门'}]}});
        tx.objectStore('audio').put({id:'legacy-practice-ui',blob});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();localStorage.setItem('btl-last-song','legacy-practice-ui');
    },bytes.toString('base64'));
    await page.reload();await expect(page.getByRole('heading',{name:'legacy-synthetic.wav',exact:true})).toBeVisible({timeout:15000});await page.waitForTimeout(650);
    const first=await readSong(page,'legacy-practice-ui');assert.equal(first.audioBase64,bytes.toString('base64'));assert.equal(first.song.settings.practiceSpeed,.8);
    assert.deepEqual(first.song.settings.markers.map(m=>[m.id,m.time,m.label]),[['old-a',.5,'旧主歌'],['old-b',1.5,'旧过门']]);
    assert.equal(first.song.settings.markers[0].end,1.5);assert(Math.abs(first.song.settings.markers[1].end-first.song.duration)<.001);
    await page.reload();await expect(page.getByRole('heading',{name:'legacy-synthetic.wav',exact:true})).toBeVisible();const second=await readSong(page,'legacy-practice-ui');
    assert.deepEqual(second.song.settings.markers,first.song.settings.markers);assert.equal(second.audioBase64,first.audioBase64);return {markers:first.song.settings.markers,audioSize:first.audioSize,secondRestoreStable:true};
  });

  for(const width of [390,320]) {
    const mobile=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});contexts.push(mobile);
    const page=await mobile.newPage();observe(page);const cdp=await mobile.newCDPSession(page);
    async function touch(x1,y1,x2,y2) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1,id:1,radiusX:4,radiusY:4,force:1}]});
      for(let i=1;i<=14;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*i/14,y:y1+(y2-y1)*i/14,id:1,radiusX:4,radiusY:4,force:1}]});await page.waitForTimeout(16);}
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(180);
    }
    await check(`${width}px触控仿真：展开/添加/改名/关闭无横向溢出`,async()=>{
      await example(page);assert((await page.evaluate(()=>navigator.maxTouchPoints))>0);await page.getByTestId('sections-toggle').tap();await page.getByRole('button',{name:'添加段落',exact:true}).tap();
      const input=page.getByTestId('sections-panel').getByRole('textbox').first();await input.fill(`窄屏${width}`);await input.press('Enter');
      const bounds=await page.getByTestId('sections-panel').boundingBox(),metrics=await page.evaluate(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth}));
      assert(bounds.x>=0&&bounds.x+bounds.width<=width+.1);assert.equal(metrics.doc,width);
      await page.getByRole('button',{name:'关闭段落管理',exact:true}).tap();await expect(page.getByTestId('sections-panel')).toHaveCount(0);
      await page.getByTestId('sections-toggle').tap();await expect(page.getByTestId('sections-panel').getByRole('textbox').first()).toHaveValue(`窄屏${width}`);
      await page.keyboard.press('Escape');await expect(page.getByTestId('sections-panel')).toHaveCount(0);return {bounds,metrics,touchPoints:await page.evaluate(()=>navigator.maxTouchPoints)};
    });
    if(width!==390)continue;
    // The first range fills the entire song. Remove it so touch AB creation has
    // no overlapping section selection; all changes still use real UI controls.
    await page.getByTestId('sections-toggle').tap();await page.getByRole('button',{name:'删除段落 窄屏390',exact:true}).tap();await page.getByRole('button',{name:'关闭段落管理',exact:true}).tap();
    await check('390px真实Touch序列：创建loop、拖动A/B边界与整体平移',async()=>{
      await page.getByTestId('waveform').scrollIntoViewIfNeeded();let wave=await page.getByTestId('waveform').boundingBox();
      await touch(wave.x+wave.width*.2,wave.y+145,wave.x+wave.width*.5,wave.y+145);
      let ab=await region(page);assert(Math.abs(ab.a-3.2)<.15&&Math.abs(ab.b-8)<.15,JSON.stringify(ab));
      let h=await page.getByTestId('loop-start-handle').boundingBox();await touch(h.x+h.width/2,h.y+90,h.x+h.width/2+wave.width*.05,h.y+90);
      h=await page.getByTestId('loop-end-handle').boundingBox();await touch(h.x+h.width/2,h.y+90,h.x+h.width/2-wave.width*.05,h.y+90);
      ab=await region(page);assert(Math.abs(ab.a-4)<.15&&Math.abs(ab.b-7.2)<.15,JSON.stringify(ab));
      const move=await page.locator('.wave-region-move').boundingBox();await touch(move.x+move.width/2,move.y+12,move.x+move.width/2+wave.width*.05,move.y+12);
      ab=await region(page);assert(Math.abs(ab.a-4.8)<.18&&Math.abs(ab.b-8)<.18,JSON.stringify(ab));return ab;
    });
    await check('390px Touch段落两端和整体移动，当前选中循环同步范围',async()=>{
      await page.getByTestId('sections-toggle').tap();await page.getByRole('button',{name:'添加段落',exact:true}).tap();
      const input=page.getByTestId('sections-panel').getByRole('textbox').first();await input.fill('触控段落');await input.press('Enter');await page.getByRole('button',{name:'关闭段落管理',exact:true}).tap();
      await page.getByTestId('waveform').scrollIntoViewIfNeeded();const wave=await page.getByTestId('waveform').boundingBox();
      const steps=[{stage:'before',ab:await region(page)}];
      let h=await page.locator('[data-testid^="section-start-"]').boundingBox();await touch(h.x+h.width/2,h.y+h.height/2,h.x+h.width/2+wave.width*.025,h.y+h.height/2);
      steps.push({stage:'start-drag',ab:await region(page)});
      h=await page.locator('[data-testid^="section-end-"]').boundingBox();await touch(h.x+h.width/2,h.y+h.height/2,h.x+h.width/2+wave.width*.05,h.y+h.height/2);
      steps.push({stage:'end-drag',ab:await region(page)});
      const section=await page.getByTestId('section-region').boundingBox();await touch(section.x+section.width/2,section.y+section.height/2,section.x+section.width/2+wave.width*.05,section.y+section.height/2);
      const start=Number(await page.locator('[data-testid^="section-start-"]').getAttribute('aria-valuenow')),end=Number(await page.locator('[data-testid^="section-end-"]').getAttribute('aria-valuenow'));
      const ab=await region(page);steps.push({stage:'whole-drag',ab});assert(Math.abs(start-6)<.2&&Math.abs(end-9.6)<.2,JSON.stringify({start,end,steps}));assert(Math.abs(start-ab.a)<.002&&Math.abs(end-ab.b)<.002);return {section:{start,end},ab,steps};
    });
    await check('390px手形水平pan只移动视图，不重选loop/段落',async()=>{
      await setZoom(page,10);await page.getByRole('button',{name:'拖动视图',exact:true}).tap();
      const scroll=page.getByTestId('waveform-scroll');await scroll.scrollIntoViewIfNeeded();const box=await scroll.boundingBox();
      const before=await region(page),left=await scroll.evaluate(el=>el.scrollLeft);
      const point=await page.evaluate(box=>{
        for(const ratio of [.65,.5,.4,.9]){const x=box.x+box.width*ratio,y=box.y+195,hit=document.elementFromPoint(x,y);if(hit&&!hit.closest('[data-drag]'))return {x,y,hit:hit.className};}
        return null;
      },box);assert(point,'未找到无handle覆盖的空白pan落点');
      await touch(point.x,point.y,point.x-box.width*.4,point.y);
      const after=await scroll.evaluate(el=>el.scrollLeft);assert(after>left+30,`${left}->${after}`);assert.deepEqual(await region(page),before);
      await page.getByRole('button',{name:'拖动视图',exact:true}).tap();return {scrollBefore:left,scrollAfter:after,region:before,point};
    });
    await check('390px普通波形纵向Touch滚动页面，取消选区拖动且不改loop',async()=>{
      await setZoom(page,0);await page.getByTestId('waveform-scroll').scrollIntoViewIfNeeded();
      const box=await page.getByTestId('waveform-scroll').boundingBox(),before=await region(page),y=await page.evaluate(()=>scrollY);
      await touch(box.x+box.width*.75,box.y+230,box.x+box.width*.75,box.y+80);
      const after=await page.evaluate(()=>scrollY);assert(after>y+30,`${y}->${after}`);assert.deepEqual(await region(page),before);
      await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL('../docs/regions-mobile.png',import.meta.url)),fullPage:true});return {scrollBefore:y,scrollAfter:after,region:before};
    });
  }
  await check('全部页面没有未捕获JavaScript异常',async()=>{assert.deepEqual(errors,[]);return {errors};});
} finally {
  for(const context of contexts)await context.close().catch(()=>{});await browser.close().catch(()=>{});
  const passed=results.filter(item=>item.pass).length;
  const report=`# 段落、R/O快捷键与窄屏触控回归\n\n${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（Asia/Shanghai）。本机 Microsoft Edge Chromium / Playwright 无界面生产预览 ${base}。独立临时浏览器配置，桌面1440×1000；触控仿真390×844和320×844，hasTouch/isMobile，CDP派发touchStart/touchMove/touchEnd。未接触用户现有浏览器配置。未放宽自动播放策略；示例真实启动后先暂停再测试快捷键。\n\n**${passed}/${results.length} 项通过。**\n\n| 行为 | 结果 | 证据 |\n| --- | --- | --- |\n${results.map(item=>`| ${item.name} | ${item.pass?'通过':'失败'} | ${JSON.stringify(item.detail).replaceAll('|','/').replaceAll('\n',' ')} |`).join('\n')}\n\nR行为按本轮约定：任意非原速先回100%，100%时再切固定R目标；滑块和上下键不重写目标。O为0/12/24循环，非预设细调值先回0。旧point fixture直接写入IndexedDB，并通过生产界面加载和再次刷新验证范围迁移、id/名称/起点稳定及完整WAV Blob字节不变。\n\n截图：regions-mobile.png，为390px浏览器触控仿真。\n\n限制：这不是实体手机测试；没有验证iOS/Safari、Android硬件、系统软键盘弹起后的视口变化、真实扬声器音质。本轮不重新进行DSP频谱测量，也未执行外部部署或中国大陆网络访问验收。\n`;
  await fs.writeFile(new URL('../docs/PRACTICE-UI-RESULTS.md',import.meta.url),report);console.log(`RESULT ${passed}/${results.length}`);
  if(passed!==results.length)process.exitCode=1;
}
