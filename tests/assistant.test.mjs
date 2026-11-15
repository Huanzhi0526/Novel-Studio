import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../app/main/store.mjs';
import {WritingService} from '../app/main/writing.mjs';
import {AssistantService} from '../app/main/assistant.mjs';

test('book workspaces isolate memories and expose only current nondeleted materials; tool writes never change originals',async t=>{
 const root=mkdtempSync(join(tmpdir(),'novel-assistant-')),store=new Store(join(root,'library.sqlite')),writing=new WritingService(store);
 const a=writing.createWork({title:'甲'}).id,b=writing.createWork({title:'乙'}).id;
 const doc=writing.createDoc({workId:a,kind:'outline',title:'大纲',text:'合成大纲'}).id;
 const other=writing.createDoc({workId:b,kind:'setting',title:'保密设定',text:'乙'}).id;
 const svc=new AssistantService(writing,{query:async()=>({hits:[{title:'合成参考'}]})},root);
 t.after(()=>{svc.close();store.close();rmSync(root,{recursive:true,force:true});});
 assert.throws(()=>svc.get({workId:'../../elsewhere'}));
 const e=svc.entry(a);assert.notEqual(e.cwd,svc.entry(b).cwd);
 assert.equal((await svc.tool(e,a,'book_materials',{})).length,1);
 assert.equal((await svc.tool(e,a,'book_materials',{docId:doc})).text,'合成大纲');
 await assert.rejects(svc.tool(e,a,'book_materials',{docId:other}));
 await svc.memory({workId:a,text:'# 任务\n已确定：合成主旨'});
 assert.match(svc.get({workId:a}).memory,/合成主旨/);assert.doesNotMatch(svc.get({workId:b}).memory,/合成主旨/);
 assert.equal(writing.preview({id:doc}).text,'合成大纲');
 const job=await svc.tool(e,a,'reference_search',{query:'任务'});assert.equal((await svc.tool(e,a,'reference_result',{jobId:job.jobId})).status,'done');assert.equal(svc.get({workId:a}).sources.hits.length,1);
 await assert.rejects(svc.tool(e,a,'memory_write',{text:''}));
});

test('assistant send persists discussion, recovers with recent context, and closes failed sessions',async t=>{
 const root=mkdtempSync(join(tmpdir(),'novel-assistant-')),store=new Store(join(root,'library.sqlite')),writing=new WritingService(store);
 const workId=writing.createWork({title:'合成书'}).id;let calls=0,closed=0;
 const svc=new AssistantService(writing,null,root,{clientFactory:()=>({promptText:async (text,options)=>{assert.equal(options.timeoutMs,600000);calls++;assert.match(text,/本轮消息/);assert.match(text,/输出面向作者阅读/);if(calls===2)throw new Error('503');return {text:'合成建议'};},close:()=>closed++})});
 svc.models=async()=>[{id:'gemini-test-low'}];
 // No network or CLI in this test; exercise orchestration and persistence only.
 svc.start=async e=>{e.client??=svc.clientFactory();};
 t.after(()=>{svc.close();store.close();rmSync(root,{recursive:true,force:true});});
 await svc.send({workId,text:'合成问题',modelId:'gemini-test-low'});
 assert.equal(svc.get({workId}).messages.length,2);
 await assert.rejects(svc.send({workId,text:'再讨论',modelId:'gemini-test-low'}),/503/);
 assert.equal(svc.get({workId}).busy,false);assert.ok(closed);
 assert.equal(JSON.parse(readFileSync(svc.entry(workId).history)).length,3);
 const memory=svc.get({workId}).memory;svc.reset({workId});assert.equal(svc.get({workId}).memory,memory);
});

test('MCP endpoint rejects missing credentials and serves only scoped tools',async t=>{
 const root=mkdtempSync(join(tmpdir(),'novel-assistant-')),store=new Store(join(root,'library.sqlite')),writing=new WritingService(store);
 const workId=writing.createWork({title:'合成接口测试'}).id;
 const svc=new AssistantService(writing,null,root,{clientFactory:()=>({close(){}})});
 t.after(()=>{svc.close();store.close();rmSync(root,{recursive:true,force:true});});
 const e=svc.entry(workId);await svc.start(e,workId);
 const url=`http://127.0.0.1:${e.server.address().port}`;
 const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'});
 assert.equal((await fetch(url,{method:'POST',body})).status,401);
 const response=await fetch(url,{method:'POST',body,headers:{Authorization:'Bearer '+e.token}});
 const reply=await response.json();assert.ok(reply.result.tools.some(t=>t.name==='reference_search'));
 const bad=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+e.token},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'execute_shell',arguments:{command:'echo unsafe'}}})});
 assert.equal((await bad.json()).result.isError,true);
});

test('long retrieval submits immediately, deduplicates per turn, and can be collected only by its book',async t=>{
 const root=mkdtempSync(join(tmpdir(),'assistant-job-')),store=new Store(join(root,'library.sqlite')),writing=new WritingService(store);
 const a=writing.createWork({title:'甲'}).id,b=writing.createWork({title:'乙'}).id;let release,calls=0;
 const service=new AssistantService(writing,{query:async()=>{calls++;return await new Promise(resolve=>release=resolve);}},root);
 t.after(()=>{service.close();store.close();rmSync(root,{recursive:true,force:true});});
 const e=service.entry(a),signal=new AbortController().signal;
 const first=await Promise.race([service.tool(e,a,'reference_search',{query:'合成问题'},signal),new Promise((_,reject)=>setTimeout(()=>reject(new Error('submission blocked')),500))]);
 assert.equal(first.status,'queued');assert.equal(calls,1);
 const duplicate=await service.tool(e,a,'reference_search',{query:'合成问题'},signal);assert.equal(duplicate.jobId,first.jobId);assert.equal(calls,1);
 await assert.rejects(service.tool(service.entry(b),b,'reference_result',{jobId:first.jobId}));
 release({hits:[],degraded:false});const done=await service.tool(e,a,'reference_result',{jobId:first.jobId},signal);
 assert.equal(done.status,'done');assert.deepEqual(done.result.hits,[]);assert.equal(e.jobs.get(first.jobId).collected,true);
});

test('assistant never saves an answer that abandons an uncollected retrieval job',async t=>{
 const root=mkdtempSync(join(tmpdir(),'assistant-abandon-')),store=new Store(join(root,'library.sqlite')),writing=new WritingService(store);
 const workId=writing.createWork({title:'合成书'}).id;
 const service=new AssistantService(writing,{query:async()=>({hits:[]})},root,{clientFactory:()=>({close(){},promptText:async()=>{
   await service.tool(service.entry(workId),workId,'reference_search',{query:'合成'},service.entry(workId).signal);
   return {text:'没有领取结果却声称完成'};
 }})});
 service.models=async()=>[{id:'gemini-test-low'}];service.start=async e=>{e.client??=service.clientFactory();};
 t.after(()=>{service.close();store.close();rmSync(root,{recursive:true,force:true});});
 await assert.rejects(service.send({workId,modelId:'gemini-test-low',text:'合成'}),{code:'ASSISTANT_RESULT_NOT_COLLECTED'});
 assert.equal(service.get({workId}).messages.length,1);assert.equal(service.get({workId}).busy,false);
});

test('retrieval failures are collectable with their code and visible in current-turn status',async t=>{
 const root=mkdtempSync(join(tmpdir(),'assistant-job-error-')),store=new Store(join(root,'library.sqlite')),writing=new WritingService(store),workId=writing.createWork({title:'合成'}).id;
 const service=new AssistantService(writing,{query:async()=>{throw Object.assign(new Error('合成检索超时'),{code:'TEST_TIMEOUT'});}},root);
 t.after(()=>{service.close();store.close();rmSync(root,{recursive:true,force:true});});
 const e=service.entry(workId);e.signal=new AbortController().signal;
 const job=await service.tool(e,workId,'reference_search',{query:'合成'},e.signal);
 const result=await service.tool(e,workId,'reference_result',{jobId:job.jobId},e.signal);
 assert.equal(result.status,'failed');assert.equal(result.error.code,'TEST_TIMEOUT');
 assert.equal(service.get({workId}).retrievalJobs[0].error.message,'合成检索超时');assert.equal(e.sources,undefined);
});


test('MCP captures the turn at request start and cannot apply a late body to the next turn',async t=>{
 const {request}=await import('node:http');
 const root=mkdtempSync(join(tmpdir(),'assistant-late-body-')),store=new Store(join(root,'library.sqlite')),writing=new WritingService(store),workId=writing.createWork({title:'合成'}).id;
 const service=new AssistantService(writing,null,root,{clientFactory:()=>({close(){}})});t.after(async()=>{await service.close();store.close();rmSync(root,{recursive:true,force:true});});
 const e=service.entry(workId),old=new AbortController();e.signal=old.signal;await service.start(e,workId);
 const body=JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'memory_write',arguments:{text:'不应写入下一轮'}}});
 const before=readFileSync(e.memory,'utf8');
 const response=new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port:e.server.address().port,method:'POST',headers:{authorization:'Bearer '+e.token,'content-length':Buffer.byteLength(body)}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve(JSON.parse(text)));});req.on('error',reject);req.write(body.slice(0,20));
  setTimeout(()=>{old.abort();e.signal=new AbortController().signal;req.end(body.slice(20));},30);
 });
 assert.equal((await response).result.isError,true);assert.equal(readFileSync(e.memory,'utf8'),before);
});
