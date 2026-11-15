import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReferenceStoreV2} from '../app/kb-v2/store-v2.mjs';
import {SearchEngineV2} from '../app/kb-v2/search-v2.mjs';
import {AssistantSearch} from '../app/main/assistant-search.mjs';
import {RetrievalEngineV2} from '../app/kb-v2/retrieval-v2.mjs';

function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'stability-golden-'));
  const store=new ReferenceStoreV2(join(root,'reference-v2.sqlite'));
  store.ingestExportedBook({work:{work_id:'synthetic',title:'合成黄金库'},resources:[],structures:[],volumes:[{volume_id:'v1',revision_id:'r1',title:'合成卷',normalized_payload:{blocks:Array.from({length:30},(_,i)=>({kind:'text',text:`合成合作任务段${i+1}`}))}}]},null);
  store.replaceVolumeScenes('synthetic','v1','r1',Array.from({length:18},(_,i)=>({title:`合作任务${i+1}`,characters:[],objective_summary:'合作任务',start_p:i+1,end_p:i+1})));
  const encode=async texts=>texts.map(()=>[1,0]);
  const engine=new SearchEngineV2(store,{id:'synthetic',embed:encode});
  let calls=0;
  const retrieval=new RetrievalEngineV2(engine,{customComplete:async()=>JSON.stringify(++calls%2?{lexical_keywords:['合作'],semantic_cues:[]}:{matches:Array.from({length:16},(_,i)=>({id:i+1})),synthesis:'首页导读'})});
  const worker=new AssistantSearch(engine,{retrieval});
  t.after(async()=>{await worker.close();store.close();rmSync(root,{recursive:true,force:true});});
  return {store,engine,retrieval,worker,calls:()=>calls};
}

test('AI cursors survive worker replies, retain order and never generate on page two',async t=>{
  const {worker,calls,store}=fixture(t);
  const args={query:'合作任务',mode:'fast',limit:12};
  const first=await worker.query(args);assert.equal(first.hits.length,12);assert.ok(first.cursor);assert.equal(first.synthesis,'首页导读');
  const second=await worker.query({...args,cursor:first.cursor});
  assert.equal(second.hits.length,4);assert.equal(calls(),2);
  assert.equal(new Set([...first.hits,...second.hits].map(h=>h.card_id)).size,16);
  store.generation++;
  await assert.rejects(worker.query({...args,cursor:first.cursor}),{code:'SEARCH_STALE'});
});

test('default AI success performs no fallback scan; stale errors never trigger fallback',async()=>{
  let scans=0;
  const search={reference:{generation:0},query:async()=>{scans++;return {hits:[]};},multiLayerSearch:async()=>({candidates:[],channels:{},degraded:true,reason:'向量不可用'}),rankedPage:(_a,_i,m)=>m};
  const good=new RetrievalEngineV2(search,{customComplete:async()=>'{"lexical_keywords":[]}'});
  assert.equal((await good.query({query:'合成',mode:'fast'})).degraded,true);assert.equal(scans,0);
  const stale=new RetrievalEngineV2(search,{customComplete:async()=>{throw Object.assign(new Error('stale'),{code:'SEARCH_CONFIG_CHANGED'});}});
  await assert.rejects(stale.query({query:'合成',mode:'fast'}),{code:'SEARCH_CONFIG_CHANGED'});assert.equal(scans,0);
});

test('read tool pins revisions and normalized ranges; deep overlap never crosses revisions',async t=>{
  const {store,engine}=fixture(t);
  // Another revision with the same paragraph numbers must not alter a pinned read.
  store.ingestExportedBook({work:{work_id:'synthetic',title:'合成黄金库'},resources:[],structures:[],volumes:[{volume_id:'v1',revision_id:'r2',title:'合成卷',normalized_payload:{blocks:[{kind:'text',text:'第二版独有内容'}]}}]},null);
  const read=engine.toolReadOriginalRange({volumeId:'v1',revisionId:'r1',startOrdinal:2,endOrdinal:999});
  assert.equal(read.revision_id,'r1');assert.deepEqual(read.range,[2,30]);assert.match(read.paragraphs[0],/合成合作任务/);
  assert.equal(engine.toolReadOriginalRange({volumeId:'v1',revisionId:'missing'}).error,'找不到指定分卷');
  store.db.prepare('DELETE FROM passage_chunks WHERE revision_id=?').run('r1');
  let turns=0;
  const deep=new RetrievalEngineV2(engine,{customComplete:async()=>JSON.stringify(++turns===1?{action:'tools',calls:[{tool:'read_original_range',args:{volumeId:'v1',revisionId:'r1',startOrdinal:2,endOrdinal:3}}]}:{action:'final',selections:[{ref:'original:1'}]})});
  const result=await deep.query({query:'合成合作',mode:'deep'});assert.equal(result.degraded,false);assert.equal(turns,2);assert.equal(result.hits.length,1);assert.equal(result.hits[0].evidence[0].revision_id,'r1');assert.equal(store.getCard({workId:'synthetic',cardId:result.hits[0].card_id}).content,result.hits[0].content);
});


test('cancelled queued queries release promptly and a fresh worker can query after cancellation',async t=>{
 const {worker}=fixture(t);
 const controller=new AbortController();controller.abort();
 await assert.rejects(async()=>worker.query({query:'合作',mode:'local'},{signal:controller.signal}),{name:'AbortError'});
 const first=await worker.query({query:'合作',mode:'local'});assert.ok(first.hits.length);
 await worker.close();assert.equal(worker.worker,null);assert.equal(worker.active.size,0);
 assert.ok((await worker.query({query:'合作',mode:'local'})).hits.length);
});

