import {_electron} from 'playwright';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Uses a synthetic vector/question and reads reference data locally only. No CLI/model call.
const exe=resolve(process.argv[2]);
const reference=resolve(process.argv[3]);
const root=resolve('.local/assistant-freeze-025/installed-qa');await mkdir(root,{recursive:true});
const env={...process.env,NOVEL_STUDIO_DATA_DIR:join(root,'profile'),NOVEL_STUDIO_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
const desktop=await _electron.launch({executablePath:exe,env});
try {
 const page=await desktop.firstWindow();await page.waitForLoadState('domcontentloaded');
 const job=desktop.evaluate(async({app},{reference,progress})=>{
   const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
   const {Worker}=require('node:worker_threads');const {join}=require('node:path');
   const {DatabaseSync}=require('node:sqlite');
   const db=new DatabaseSync(reference,{readOnly:true});const model=db.prepare('SELECT model_id,dimension FROM vectors LIMIT 1').get();db.close();
   const vector=new Float32Array(model.dimension);vector[0]=1;
   return new Promise((resolve,reject)=>{
     const worker=new Worker(join(app.getAppPath(),'app/main/assistant-search-worker.mjs'),{workerData:{filename:reference,modelId:model.model_id,method:'query',ai:true,args:{query:'共同完成任务',mode:'fast',lazyFallback:true,limit:8},vectors:[vector]}});
     require('node:fs').writeFileSync(progress,'started\n');
     const timer=setTimeout(()=>{void worker.terminate();reject(new Error('worker deadline'));},150000);
     worker.once('error',error=>{clearTimeout(timer);resolve({workerError:String(error),stack:error.stack,code:error.code});});
     let aiCalls=0;
     worker.on('message',m=>{
       require('node:fs').appendFileSync(progress,JSON.stringify({kind:m.kind??'result',at:Date.now()})+'\n');
       if(m.kind==='embed'){worker.postMessage({id:m.id,text:m.texts.map(()=>vector)});return;}
       if(m.kind==='complete'){aiCalls++;worker.postMessage({id:m.id,text:JSON.stringify(aiCalls===1?{semantic_cues:[],lexical_keywords:['合作'],focus:'scene'}:{matches:[{id:1,takeaway:'本机模拟筛选验收'}]})});return;}
       clearTimeout(timer);void worker.terminate();m.error?resolve({workerError:m.error.message,code:m.error.code}):resolve({hits:m.result.hits.length,aiCalls});
     });
   });
 },{reference,progress:join(root,'progress.log')}).catch(error=>({workerError:String(error)}));
 let worst=0;
 for(let i=0;i<20;i++){
   const start=performance.now();
   const info=await page.evaluate(()=>window.studio.invoke('app.info'));
   assert.equal(info.ok,true);worst=Math.max(worst,performance.now()-start);
   await page.getByRole('button',{name:i%2?'原创写作':'资料与设置',exact:true}).click({timeout:3000});
   await page.waitForTimeout(100);
 }
 const result=await job;console.log(JSON.stringify(result));assert.equal(result.workerError,undefined);assert.ok(worst<1500);assert.equal(result.aiCalls,2);
 await writeFile(join(root,'report.json'),JSON.stringify({passed:true,worstIpcMs:worst,checks:20,...result},null,2));
 console.log(JSON.stringify({worstIpcMs:worst,...result}));
}finally{await desktop.close();}
