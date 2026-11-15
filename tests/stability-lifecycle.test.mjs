import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AgyFlashClient} from '../app/kb-v2/agy-client.mjs';
import {AgyRetrievalProvider} from '../app/kb-v2/agy-provider.mjs';
import {EmbeddingProvider} from '../app/main/embedding.mjs';
import {AssistantService} from '../app/main/assistant.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function child(){const p=new EventEmitter();p.stdout=new PassThrough();p.stderr=new PassThrough();p.stdin=new PassThrough();p.killed=false;p.kill=()=>{p.killed=true;queueMicrotask(()=>p.emit('exit',0));};return p;}
function directory(t){const root=mkdtempSync(join(tmpdir(),'stability-lifecycle-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}

test('deadline includes initialization; expired setup never transmits a prompt (three trials)',async t=>{
 const root=directory(t);
 for(let n=0;n<3;n++){
  const methods=[];const client=new AgyFlashClient({cwd:root,executable:'synthetic',env:{HTTP_PROXY:'http://127.0.0.1:1'},spawnImpl:()=>{const p=child();p.stdin.on('data',data=>{const m=JSON.parse(data);methods.push(m.method);setTimeout(()=>{if(!p.killed)p.stdout.write(JSON.stringify({id:m.id,result:{agentCapabilities:{}}})+'\n');},150);});return p;}});
  const start=performance.now();await assert.rejects(client.promptText('synthetic',{timeoutMs:30}),e=>e.code==='AGY_TIMEOUT'&&e.details.stage==='initialize'&&!e.details.promptSent);
  assert.ok(performance.now()-start<250);assert.ok(!methods.includes('session/prompt'));client.close();
 }
});

test('queued configuration changes never transmit old task with new model',async t=>{
 const root=directory(t);const sent=[];let release;
 const provider=new AgyRetrievalProvider(root,{env:{NOVEL_STUDIO_AGY_BIN:process.execPath},clientFactory:options=>({close(){},complete:async()=>{sent.push(options.modelId);await new Promise(r=>release=r);return '{}';}})});
 t.after(()=>provider.close());provider.models=[{id:'gemini-3.8-flash-low'},{id:'gemini-next-low'}];
 const first=provider.complete([],{});for(let i=0;i<200&&!release;i++)await delay(5);assert.ok(release);
 const old=provider.complete([],{});const assertion=assert.rejects(old,{code:'SEARCH_CONFIG_CHANGED'});
 await provider.save({source:'agy',modelId:'gemini-next-low'});release();await first;await assertion;
 assert.deepEqual(sent,['gemini-3.8-flash-low']);
});

test('embedding startup cancellation is prompt and another waiter still succeeds',async t=>{
 const root=directory(t);let proc;
 const embedding=new EmbeddingProvider({modelPath:root,startupTimeoutMs:1000,spawnImpl:()=>{proc=child();setTimeout(()=>proc.stdout.write('{"type":"ready"}\n'),70);proc.stdin.on('data',data=>{const m=JSON.parse(data);proc.stdout.write(JSON.stringify({id:m.id,vectors:[[1,0]]})+'\n');});return proc;}});
 t.after(()=>embedding.close());const controller=new AbortController();
 const a=embedding.embed(['a'],{signal:controller.signal}),b=embedding.embed(['b']);const assertion=assert.rejects(a,{code:'EMBED_ABORTED'});
 const start=performance.now();setTimeout(()=>controller.abort(),10);await assertion;assert.ok(performance.now()-start<100);assert.deepEqual(Array.from((await b)[0]),[1,0]);assert.equal(proc.killed,false);
});

test('assistant directory cancellation, capacity, previous-turn rejection and reset cleanup',async t=>{
 const root=directory(t);const service=new AssistantService({list:()=>({works:[{id:'synthetic',title:'合成'}]})},{query:async()=>new Promise(()=>{})},root);
 t.after(()=>service.close());service.provider.listModels=async()=>{await delay(150);throw Object.assign(new Error('catalogue'),{code:'AGY_MODELS'});};
 const controller=new AbortController();const start=performance.now();const send=service.send({workId:'synthetic',text:'合成',modelId:'gemini-3.8-flash-low'},{signal:controller.signal});const assertion=assert.rejects(send,{name:'AbortError'});setTimeout(()=>controller.abort(),10);await assertion;assert.ok(performance.now()-start<100);
 const e=service.entry('synthetic'),signal=new AbortController().signal;e.signal=signal;
 for(let i=0;i<20;i++)await service.tool(e,'synthetic','reference_search',{query:'合成'+i},signal);
 await assert.rejects(service.tool(e,'synthetic','reference_search',{query:'overflow'},signal),/任务过多/);assert.equal(e.jobs.size,20);assert.ok([...e.jobs.values()].every(j=>j.promise));
 await assert.rejects(service.tool(e,'synthetic','reference_result',{jobId:e.jobs.keys().next().value},new AbortController().signal),/本轮/);
 e.sources={hits:[{}]};e.lastError={message:'old'};e.failedPartial='old';service.reset({workId:'synthetic'});assert.equal(e.sources,null);assert.equal(e.jobs.size,0);assert.equal(e.lastError,null);assert.equal(e.failedPartial,'');
});


test('incremental status prefix stays bounded across arbitrary fragments without modifying final prose',async()=>{
 const {AgyStatusAccumulator,separateAgyStatus}=await import('../app/kb-v2/agy-client.mjs');
 const text='⚠ API error (attempt 1): UNAVAILABLE (code 503) No capacity available\n'+('合成正文⚠普通提醒。'.repeat(10000));
 for(const size of [1,7,4096]){
  const parser=new AgyStatusAccumulator();for(let i=0;i<text.length;i+=size)parser.push(text.slice(i,i+size));
  assert.equal(parser.capacity,true);assert.equal(parser.hasText,true);assert.ok(parser.pending.length<8193);assert.equal(separateAgyStatus(text).text,'合成正文⚠普通提醒。'.repeat(10000));
 }
});
