import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ReferenceStoreV2} from '../app/kb-v2/store-v2.mjs';
import {AssistantSearch} from '../app/main/assistant-search.mjs';
import {RetrievalEngineV2} from '../app/kb-v2/retrieval-v2.mjs';

test('assistant worker queries read-only reference store and preserves local fallback',async t=>{
 const root=mkdtempSync(join(tmpdir(),'assistant-search-')),filename=join(root,'ref.sqlite');
 const store=new ReferenceStoreV2(filename);store.close();
 const read=new ReferenceStoreV2(filename,{readOnly:true});
 assert.throws(()=>read.db.exec('CREATE TABLE unexpected(id)'));read.close();
 const search=new AssistantSearch({reference:{filename},embedding:{id:'test'},encode:async()=>{throw Object.assign(new Error('no model'),{code:'EMBED_MODEL_NOT_CONFIGURED'});}});
 t.after(()=>{search.close();rmSync(root,{recursive:true,force:true});});
 const result=await search.query({query:'合作任务',limit:8});assert.deepEqual(result.hits,[]);assert.equal(result.degraded,true);
 assert.equal((await search.toolReadOriginalRange({volumeId:'absent'})).error,'找不到指定分卷');
});

test('busy worker leaves UI-serving event loop responsive and cancellation terminates it',async t=>{
 const root=mkdtempSync(join(tmpdir(),'assistant-busy-')),file=join(root,'busy.mjs');
 writeFileSync(file,"import {parentPort} from 'node:worker_threads';const until=Date.now()+10000;while(Date.now()<until){};parentPort.postMessage({result:{}});");
 const search=new AssistantSearch({reference:{filename:'unused'},encode:async()=>[]},{workerURL:pathToFileURL(file)});
 t.after(()=>{search.close();rmSync(root,{recursive:true,force:true});});
 let ticks=0;const timer=setInterval(()=>ticks++,10);const controller=new AbortController();
 const job=search.query({query:'synthetic'},{signal:controller.signal});
 setTimeout(()=>controller.abort(),120);const start=performance.now();
 await assert.rejects(job,{name:'AbortError'});clearInterval(timer);
 assert.ok(ticks>=3);assert.ok(performance.now()-start<1500);assert.equal(search.active.size,0);
});

test('assistant delegates to the existing retrieval AI pipeline and embeds its expanded queries',async t=>{
 const root=mkdtempSync(join(tmpdir(),'assistant-ai-')),filename=join(root,'ref.sqlite');
 const store=new ReferenceStoreV2(filename);store.close();let aiCalls=0;const embedded=[];
 const search=new AssistantSearch({reference:{filename},embedding:{id:'test'},encode:async texts=>{embedded.push(...texts);return texts.map(()=>[1,0]);}},
 {retrieval:{completeForSearch:async()=>{aiCalls++;return JSON.stringify({semantic_cues:['人物合作'],lexical_keywords:['合作'],focus:'scene'});}}});
 t.after(()=>{search.close();rmSync(root,{recursive:true,force:true});});
 const result=await search.query({query:'合成问题',limit:8});
 assert.equal(aiCalls,1);assert.ok(embedded.includes('人物合作'));assert.equal(result.degraded,false);
});

test('assistant lazy fallback avoids duplicate local scans but preserves explicit failure fallback',async()=>{
 let localCalls=0;
 const search={reference:{generation:0},query:async()=>{localCalls++;return {hits:[]};},multiLayerSearch:async()=>({candidates:[],channels:{}}),rankedPage:()=>({hits:[],degraded:false})};
 const good=new RetrievalEngineV2(search,{customComplete:async()=>'{"semantic_cues":[],"lexical_keywords":[]}'});
 await good.query({query:'合成',mode:'fast',lazyFallback:true},{});assert.equal(localCalls,0);
 const failed=new RetrievalEngineV2(search,{customComplete:async()=>{throw new Error('合成故障');}});
 const result=await failed.query({query:'合成',mode:'fast',lazyFallback:true},{});assert.equal(localCalls,1);assert.equal(result.degraded,true);assert.match(result.reason,/合成故障/);
});
