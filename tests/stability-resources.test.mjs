import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {AssistantService} from '../app/main/assistant.mjs';
import {AssistantSearch} from '../app/main/assistant-search.mjs';

test('ten book clients are reclaimed at idle without losing per-book history',async t=>{
 const root=mkdtempSync(join(tmpdir(),'assistant-resources-')),works=Array.from({length:10},(_,i)=>({id:'book-'+i,title:'合成'+i}));let clients=0;
 const service=new AssistantService({list:()=>({works})},null,root,{clientFactory:()=>{clients++;let closed=false;return {close(){if(!closed){closed=true;clients--;}},promptText:async()=>({text:'合成回复'})};}});
 service.provider.models=[{id:'gemini-test-low'}];service.start=async e=>{e.client??=service.clientFactory();e.sessionId??='synthetic-session-'+e.cwd;};
 t.after(async()=>{await service.close();rmSync(root,{recursive:true,force:true});});
 t.mock.timers.enable({apis:['setTimeout']});
 for(const book of works)await service.send({workId:book.id,text:'合成问题',modelId:'gemini-test-low'});
 assert.equal(clients,10);t.mock.timers.tick(180001);assert.equal(clients,0);
 for(const book of works){const e=service.entry(book.id);assert.equal(e.messages.length,2);assert.ok(e.sessionId);assert.equal(e.client,null);}
 t.mock.timers.reset();
});

test('twenty cancellation cycles release owned workers and a subsequent query succeeds',async t=>{
 const root=mkdtempSync(join(tmpdir(),'worker-resources-')),file=join(root,'worker.mjs');
 writeFileSync(file,"import {parentPort} from 'node:worker_threads';parentPort.on('message',m=>{if(m.args.query==='busy'){const until=Date.now()+10000;while(Date.now()<until){}}parentPort.postMessage({requestId:m.requestId,result:{hits:[]}});});");
 const channel=new AssistantSearch({reference:{filename:'unused',generation:0}},{workerURL:pathToFileURL(file)});
 t.after(async()=>{await channel.close();rmSync(root,{recursive:true,force:true});});
 const initial=process.memoryUsage().rss;let peak=initial;
 for(let i=0;i<20;i++){
  const controller=new AbortController(),job=channel.query({query:'busy'},{signal:controller.signal}),assertion=assert.rejects(job,{name:'AbortError'});
  await new Promise(resolve=>setTimeout(resolve,100));controller.abort();await assertion;await channel.stopping;assert.equal(channel.active.size,0);peak=Math.max(peak,process.memoryUsage().rss);
 }
 assert.deepEqual((await channel.query({query:'ready'})).hits,[]);await channel.close();assert.equal(channel.active.size,0);assert.equal(channel.queued,0);assert.equal(channel.controllers.size,0);
 t.diagnostic(JSON.stringify({cycles:20,initialRss:initial,peakRss:peak,finalRss:process.memoryUsage().rss,workers:channel.active.size,queue:channel.queued}));
});
