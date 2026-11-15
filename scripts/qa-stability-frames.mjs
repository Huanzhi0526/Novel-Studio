import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {_electron} from 'playwright';
import {Store} from '../app/main/store.mjs';
import {WritingService} from '../app/main/writing.mjs';
import {AssistantService} from '../app/main/assistant.mjs';
await mkdir('.local/stability-20261115',{recursive:true});const root=await mkdtemp(resolve('.local/stability-20261115/frames-')),profile=join(root,'profile');
const store=new Store(join(profile,'library.sqlite')),writing=new WritingService(store),workId=writing.createWork({title:'长聊与长章合成书'}).id,doc=writing.list({workId}).docs[0];
writing.save({id:doc.id,expectedRevision:0,text:'合成正文保护。'.repeat(100000),boundary:true});
const assistant=new AssistantService(writing,null,profile),e=assistant.entry(workId);e.messages=Array.from({length:200},(_,i)=>({role:i%2?'assistant':'user',text:'## 合成讨论 '+i+'\n\n'+('保持人物目标和因果。'.repeat(40))}));assistant.saveHistory(e);await assistant.close();store.close();
const report={root,checks:[],errors:[],syntheticOnly:true};
async function launch(){return _electron.launch({executablePath:resolve(process.argv[2]??'node_modules/electron/dist/electron.exe'),args:process.argv[2]?[]:[resolve('.')],env:{...process.env,NOVEL_STUDIO_DATA_DIR:profile,NOVEL_STUDIO_TEST_HIDDEN:'1',NOVEL_STUDIO_NO_MODEL:'1',NOVEL_STUDIO_NO_AGY_FALLBACK:'1'}});}
let app=await launch();
try{
 const page=await app.firstWindow();await page.getByRole('navigation',{name:'主导航'}).waitFor();page.on('pageerror',e=>report.errors.push(e.message));await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
 await page.evaluate(()=>{localStorage.setItem('studio.preferences.v1',JSON.stringify({appearance:'dark'}));});await page.reload();
 const cdp=await page.context().newCDPSession(page);let frameCount=0;
 cdp.on('Page.screencastFrame',async frame=>{frameCount++;if(frameCount<=150)await writeFile(join(root,`frame-${String(frameCount).padStart(3,'0')}.png`),Buffer.from(frame.data,'base64'));await cdp.send('Page.screencastFrameAck',{sessionId:frame.sessionId}).catch(()=>{});});
 await cdp.send('Page.startScreencast',{format:'png',everyNthFrame:1,maxWidth:1000,maxHeight:700});
 for(const appearance of ['light','dark']){
  await page.evaluate(appearance=>{localStorage.setItem('studio.preferences.v1',JSON.stringify({appearance}));},appearance);await page.reload();
  for(let i=0;i<32;i++){
   const name=['原创写作','参考库','创作助手','资料与设置'][i%4];const button=page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true});
   await button.evaluate(el=>el.addEventListener('pointerdown',()=>{const start=performance.now();const check=()=>{if(el.getAttribute('aria-current')==='page')window.__feedbackMs=performance.now()-start;else requestAnimationFrame(check);};requestAnimationFrame(check);},{once:true}));
   const start=performance.now();await button.click();await button.evaluate(el=>new Promise(resolve=>requestAnimationFrame(()=>resolve(el.getAttribute('aria-current')))));
   const automationMs=performance.now()-start;const feedbackMs=await page.evaluate(()=>window.__feedbackMs);
   if(name==='创作助手')await page.getByLabel('助手作品').selectOption(workId);
   if(name==='原创写作'&&await page.getByRole('button',{name:'长聊与长章合成书',exact:true}).isVisible())await page.getByRole('button',{name:'长聊与长章合成书',exact:true}).click();
   const image=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],image=await w.webContents.capturePage();const pixels=image.resize({width:120}).toBitmap();let white=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>245&&pixels[i+1]>245&&pixels[i+2]>245)white++;return {whiteRatio:white/(pixels.length/4),background:w.getBackgroundColor()};});
   if(appearance==='dark')assert.ok(image.whiteRatio<.9,JSON.stringify({i,...image}));report.checks.push({appearance,name,feedbackMs,automationMs,...image});
  }
 }
 await cdp.send('Page.stopScreencast');report.frames=frameCount;
 await page.getByRole('button',{name:'原创写作',exact:true}).click();const editor=page.locator('.cm-content[contenteditable=true]');await editor.click();await editor.press('Control+End');await editor.pressSequentially('追加保护');await page.getByRole('button',{name:'资料与设置',exact:true}).click();
 await app.close();app=await launch();const cold=await app.firstWindow();await cold.getByRole('navigation',{name:'主导航'}).waitFor();report.coldBackground=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBackgroundColor());assert.ok(['#14191f','#ff14191f'].includes(report.coldBackground.toLowerCase()));await app.close();
 const read=new Store(join(profile,'library.sqlite'));assert.ok(new WritingService(read).preview({id:doc.id}).text.endsWith('追加保护'));read.close();
 for(const appearance of ['light','dark']){const times=report.checks.filter(v=>v.appearance===appearance).map(v=>v.feedbackMs).sort((a,b)=>a-b);report[appearance]={count:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)};}
 assert.equal(report.errors.length,0);report.passed=true;
}catch(error){report.failure=error.stack;console.error(error);throw error;}finally{await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));if(report.failure)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});console.log(root);}
