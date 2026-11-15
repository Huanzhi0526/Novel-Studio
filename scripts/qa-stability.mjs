import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {_electron} from 'playwright';
import {ReferenceStoreV2} from '../app/kb-v2/store-v2.mjs';
import {Store} from '../app/main/store.mjs';
import {WritingService} from '../app/main/writing.mjs';

await mkdir('.local/stability-20261115',{recursive:true});
const root=await mkdtemp(resolve('.local/stability-20261115/ui-')),profile=process.env.NOVEL_STUDIO_QA_REUSE??join(root,'profile');
const rows=Number(process.env.NOVEL_STUDIO_QA_ROWS??240000),dimension=1536;
if(!process.env.NOVEL_STUDIO_QA_REUSE){
const ref=new ReferenceStoreV2(join(profile,'reference-v2.sqlite'));
ref.ingestExportedBook({work:{work_id:'synthetic',title:'合成性能库'},resources:[],structures:[],volumes:[{volume_id:'v1',revision_id:'r1',title:'合成卷',normalized_payload:{blocks:[{kind:'text',text:'合作任务合成原文'}]}}]},null);
const scene=ref.db.prepare("INSERT INTO scenes(work_id,volume_id,revision_id,scene_id,scene_index,title,objective_summary,evidence_start,evidence_end,search_text) VALUES('synthetic','v1','r1',?,?,'合作任务','合作任务',1,1,'合作任务')");
const vec=new Float32Array(dimension).fill(1/Math.sqrt(dimension));
const insert=ref.db.prepare("INSERT INTO vectors VALUES('scene',?,'sentence-transformers-local',?,?)");
ref.db.exec('BEGIN');for(let i=1;i<=rows;i++){const id=scene.run('s'+i,i).lastInsertRowid;insert.run(id,dimension,Buffer.from(vec.buffer));}ref.db.exec('COMMIT');ref.close();}
const store=new Store(join(profile,'library.sqlite')),writing=new WritingService(store),workId=writing.list().works.find(w=>w.title==='稳定性合成书')?.id??writing.createWork({title:'稳定性合成书'}).id;
const doc=writing.list({workId}).docs[0];writing.save({id:doc.id,expectedRevision:writing.open({id:doc.id}).revision,text:'原稿保护合成正文。',boundary:true});store.close();
const desktop=await _electron.launch({executablePath:resolve(process.argv[2]??'node_modules/electron/dist/electron.exe'),args:process.argv[2]?[]:[resolve('.')],env:{...process.env,NOVEL_STUDIO_DATA_DIR:profile,NOVEL_STUDIO_TEST_HIDDEN:'1',NOVEL_STUDIO_NO_MODEL:'1',NOVEL_STUDIO_NO_AGY_FALLBACK:'1',NOVEL_STUDIO_AGY_BIN:process.execPath}});
const report={root,rows,dimension,syntheticOnly:true,seed:'uniform-v1',entries:[],errors:[]};
try{
 await desktop.evaluate(({app,BrowserWindow},{dimension,node,fixture})=>{
  const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
  const {Worker}=require('node:worker_threads'),post=Worker.prototype.postMessage,emit=Worker.prototype.emit,terminate=Worker.prototype.terminate;
  Worker.prototype.terminate=function(){const start=Date.now();return terminate.call(this).then(value=>{stabilityQA.lastTerminationMs=Date.now()-start;return value;});};
  globalThis.stabilityQA={runs:0,completions:0,ai:0,scans:[],started:0,saveBodies:0,checkpoints:0};
  Worker.prototype.postMessage=function(m,...rest){if(m.kind==='run'){stabilityQA.runs++;stabilityQA.started=Date.now();}return post.call(this,m,...rest);};
  Worker.prototype.emit=function(event,m,...rest){
   if(event==='message'&&m?.kind==='embed'){stabilityQA.scanStart=Date.now();post.call(this,{kind:'reply',id:m.id,text:m.texts.map(()=>Array(dimension).fill(1/Math.sqrt(dimension)))});return true;}
   if(event==='message'&&m?.kind==='complete'){stabilityQA.ai++;const plan=m.messages[0].content.includes('semantic_cues');const reply={kind:'reply',id:m.id,text:JSON.stringify(plan?{semantic_cues:[],lexical_keywords:['合作'],focus:'scene'}:{matches:Array.from({length:16},(_,i)=>({id:i+1})),synthesis:'合成首页导读'})};if(stabilityQA.longDelay&&plan)setTimeout(()=>post.call(this,reply),185000);else post.call(this,reply);return true;}
   if(event==='message'&&m?.result){stabilityQA.completions++;stabilityQA.scans.push(Date.now()-stabilityQA.scanStart);}
   return emit.call(this,event,m,...rest);
  };
  const cp=require('node:child_process'),spawn=cp.spawn;
  cp.spawn=function(exe,args,options){return spawn(exe===node&&args[0]==='acp'?node:exe,exe===node&&args[0]==='acp'?[fixture]:args,options);};
  process.getBuiltinModule('module').syncBuiltinESMExports();
  const {ipcMain}=require('electron'),handle=ipcMain._invokeHandlers.get('novel:invoke');
  ipcMain._invokeHandlers.set('novel:invoke',async(event,method,args)=>{if(method==='writing.stage'||method==='writing.save')stabilityQA.saveBodies++;if(method==='writing.checkpoint')stabilityQA.checkpoints++;const result=await handle(event,method,args);if(!result.ok)stabilityQA.error={method,...result.error};return result;});
  BrowserWindow.getAllWindows()[0].showInactive();
 },{dimension,node:process.execPath,fixture:resolve('scripts/fixtures/stability/fake-agy.mjs')});
 const page=await desktop.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
 const nav=name=>page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true});
 await nav('原创写作').click();if(await page.getByRole('button',{name:'稳定性合成书',exact:true}).isVisible())await page.getByRole('button',{name:'稳定性合成书',exact:true}).click();
 const editor=page.locator('.cm-content[contenteditable=true]');await editor.fill('原稿保护合成正文。追加保存。');await editor.press('Control+s');
 await nav('参考库').click().catch(async()=>nav('参考库').click());
 async function sample(entry,startAction,done){
  const samples=[];let live=true;
  const monitor=(async()=>{while(live){const start=performance.now();const result=await page.evaluate(()=>window.studio.invoke('app.info'));assert.equal(result.ok,true);samples.push(performance.now()-start);await page.waitForTimeout(50);}})();
  try{await startAction();await done();}finally{live=false;await monitor;}
  samples.sort((a,b)=>a-b);const stats={entry,samples:samples.length,p95:samples[Math.floor(samples.length*.95)],max:samples.at(-1)};report.entries.push(stats);await writeFile(join(root,'progress.json'),JSON.stringify(report,null,2));assert.ok(stats.samples>=100,JSON.stringify(stats));assert.ok(stats.p95<=100,JSON.stringify(stats));assert.ok(stats.max<=500,JSON.stringify(stats));
 }
 // A full scan provides >=100 samples for each ordinary entry.
 for(const entry of (process.env.NOVEL_STUDIO_QA_ASSISTANT_ONLY==='1'?[]:['reference','sidebar'])){
  if(entry==='reference')await nav('参考库').click().catch(async()=>nav('参考库').click());
  else{await nav('原创写作').click();await page.getByRole('group',{name:'写作资料速查'}).getByRole('button',{name:'参考',exact:true}).click();}
  const region=page.getByRole('region',{name:entry==='reference'?'参考库检索':'参考检索侧栏',exact:true}).filter({visible:true});
  await sample(entry,async()=>{},async()=>{
   for(let n=0;n<1;n++){
    const before=await desktop.evaluate(()=>stabilityQA.completions);await region.getByRole('button',{name:'本地混合',exact:true}).click();await region.getByLabel('检索问题').fill('合作任务');await region.getByLabel('检索问题').press('Enter');
    await page.waitForFunction(()=>true);await nav('资料与设置').click();await nav(entry==='reference'?'参考库':'原创写作').click();
    await assert.doesNotReject(async()=>{for(let i=0;i<2400;i++){const progress=await desktop.evaluate(()=>stabilityQA);if(progress.error)throw new Error(JSON.stringify(progress.error));if(progress.completions>before)return;await page.waitForTimeout(50);}throw new Error('scan did not finish');});
   }
  });
 }
 // Real assistant handler -> local ACP fixture -> scoped MCP -> same retrieval worker.
 await nav('创作助手').click();const assistant=page.getByRole('region',{name:'创作助手'}).filter({visible:true});await assistant.getByLabel('助手作品').selectOption(workId);
 if(process.env.NOVEL_STUDIO_QA_LONG==='1')await desktop.evaluate(()=>{stabilityQA.longDelay=true;});
 const assistantBefore=await desktop.evaluate(()=>stabilityQA.completions);
 await sample('assistant',async()=>{await assistant.getByLabel('助手问题').fill('QA_ASSISTANT 合成检索');await assistant.getByLabel('助手问题').press('Enter');},async()=>{for(let i=0;i<6000;i++){if(await desktop.evaluate(()=>stabilityQA.completions)>assistantBefore)break;await page.waitForTimeout(50);}await assistant.getByText('合成助手已领取参考结果。',{exact:true}).last().waitFor({timeout:300000});});
 report.runtime=await desktop.evaluate(()=>({...stabilityQA,rss:process.memoryUsage().rss}));
 assert.ok(report.runtime.scans.some(ms=>ms>=2000),JSON.stringify(report.runtime.scans));
 // Stop a real UI-initiated scan, then verify that a new query still works.
 await nav('参考库').click();const region=page.getByRole('region',{name:'参考库检索',exact:true});await region.getByLabel('检索问题').fill('合作任务');await region.getByLabel('检索问题').press('Enter');await page.waitForTimeout(300);
 const stop=region.getByRole('button',{name:'取消',exact:true}).last();
 await stop.evaluate(el=>el.addEventListener('pointerdown',()=>{const start=performance.now();const observer=new MutationObserver(()=>{if([...document.querySelectorAll('.notice')].some(el=>el.textContent.includes('已取消检索'))){window.__cancelMs=performance.now()-start;observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true,characterData:true});},{once:true}));
 const start=performance.now();await stop.click();await region.getByText('已取消',{exact:false}).last().waitFor();report.cancelAutomationMs=performance.now()-start;report.cancelMs=await page.evaluate(()=>window.__cancelMs);assert.ok(report.cancelMs<250);
 const renewed=await page.evaluate(()=>window.studio.invoke('search.query',{query:'合作任务',mode:'local',workIds:['synthetic-absent'],limit:12,requestId:crypto.randomUUID()}));assert.equal(renewed.ok,true);assert.equal(renewed.value.hits.length,0);report.cancelReleaseMs=await desktop.evaluate(()=>stabilityQA.lastTerminationMs);assert.ok(report.cancelReleaseMs<1000);
 const png=await desktop.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(join(root,'results.png'),Buffer.from(png,'base64'));
 assert.equal(report.errors.length,0);
 const before=await desktop.evaluate(()=>stabilityQA.saveBodies);await nav('原创写作').click();await nav('资料与设置').click();assert.equal(await desktop.evaluate(()=>stabilityQA.saveBodies),before);
 await desktop.close();
 const read=new Store(join(profile,'library.sqlite'));assert.equal(new WritingService(read).preview({id:doc.id}).text,'原稿保护合成正文。追加保存。');read.close();
 report.passed=true;
}catch(error){report.failure=String(error);report.runtime=await desktop.evaluate(()=>stabilityQA).catch(()=>null);report.body=await (await desktop.firstWindow()).locator('body').innerText().catch(()=>null);throw error;}finally{await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));if(report.failure)await desktop.evaluate(({app})=>app.exit(0)).catch(()=>{});await desktop.close().catch(()=>{});console.log(root);}

