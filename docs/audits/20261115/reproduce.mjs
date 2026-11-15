// Baseline diagnostic probes, NOT a post-fix acceptance test. Synthetic data only.
// Run from repo root: node --disable-warning=ExperimentalWarning docs/audits/20261115/reproduce.mjs
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SearchEngineV2 } from '../../../app/kb-v2/search-v2.mjs';
import { RetrievalEngineV2 } from '../../../app/kb-v2/retrieval-v2.mjs';
import { AgyFlashClient } from '../../../app/kb-v2/agy-client.mjs';
import { EmbeddingProvider } from '../../../app/main/embedding.mjs';
import { AssistantService } from '../../../app/main/assistant.mjs';

const root = resolve('.local/project-audit-20261115');
mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, 'probe-'));
const report = { syntheticOnly: true, node: process.version, results: {} };
const delay = ms => new Promise(r => setTimeout(r, ms));

// Exercise the real SQL iterator / scoring loop. FTS and materialization are
// deliberately stubbed: this measures event-loop blocking, not retrieval quality.
{
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE works(work_id TEXT PRIMARY KEY,deleted INTEGER); CREATE TABLE scenes(id INTEGER PRIMARY KEY,work_id TEXT); CREATE TABLE vectors(unit_type TEXT,unit_row INTEGER,model_id TEXT,dimension INTEGER,data BLOB); INSERT INTO works VALUES('synthetic',NULL)");
  const rows = 40000, dimension = 768;
  const vector = new Float32Array(dimension).fill(1 / Math.sqrt(dimension));
  const bytes = Buffer.from(vector.buffer);
  const scene = db.prepare('INSERT INTO scenes VALUES(?,?)');
  const insert = db.prepare('INSERT INTO vectors VALUES(?,?,?,?,?)');
  db.exec('BEGIN');
  for (let i = 1; i <= rows; i++) { scene.run(i, 'synthetic'); insert.run('scene', i, 'synthetic', dimension, bytes); }
  db.exec('COMMIT');
  const engine = new SearchEngineV2({ db, generation: 0, materializeUnit: (_t,id) => ({id}) }, { id: 'synthetic', embed: async () => [vector] });
  engine.lexicalSearchLayer = () => [];
  engine.weightsFromLegacyCategories = () => ({ scene: 1 });
  let ticks = 0;
  const heartbeat = setInterval(() => ticks++, 5);
  const controller = new AbortController();
  const cancel = setTimeout(() => controller.abort(), 5);
  const start = performance.now();
  const value = await engine.query({query:'synthetic'}, {signal:controller.signal});
  report.results.mainScan = {rows, dimension, elapsedMs:performance.now()-start, heartbeatTicksBeforeReturn:ticks, cancellationDeliveredBeforeReturn:controller.signal.aborted, hits:value.hits.length};
  clearInterval(heartbeat); clearTimeout(cancel); db.close();
}

{
  const engine = new SearchEngineV2({generation:0, materializeUnit:(_t,id)=>({id})}, null);
  const items = Array.from({length:13},(_,i)=>({unitType:'scene',unitRow:i+1}));
  const page = engine.rankedPage({query:'synthetic',limit:12},items,{mode:'fast'});
  let failure;
  try { await engine.query({query:'synthetic',limit:12,cursor:page.cursor}); }
  catch(e) { failure=e.code; }
  engine.multiLayerSearch=async()=>({candidates:items,channels:{}});
  const local=await engine.query({query:'synthetic',limit:12});
  const next=await engine.query({query:'synthetic',limit:12,cursor:local.cursor});
  report.results.pagination={aiFirstCount:page.hits.length,aiHasCursor:Boolean(page.cursor),aiSecondPageError:failure,localSecondCount:next.hits.length};
}

{
  let localCalls=0, recallCalls=0;
  const search={reference:{generation:0},query:async()=>{localCalls++;return {hits:[]};},multiLayerSearch:async()=>{recallCalls++;return {candidates:[],channels:{}};},rankedPage:()=>({hits:[]})};
  const retrieval=new RetrievalEngineV2(search,{customComplete:async()=>'{"semantic_cues":[],"lexical_keywords":[]}'});
  await retrieval.query({query:'synthetic',mode:'fast'});
  const normal={localCalls,recallCalls};localCalls=0;recallCalls=0;
  await retrieval.query({query:'synthetic',mode:'fast',lazyFallback:true});
  report.results.duplicateFallback={normal,lazy:{localCalls,recallCalls}};
}

function fakeChild() {
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.killed=false;
  child.kill=()=>{child.killed=true;queueMicrotask(()=>child.emit('exit',0));};
  return child;
}

{
  const timings=[];
  const c=new AgyFlashClient({cwd:directory,executable:'synthetic',env:{HTTP_PROXY:'http://127.0.0.1:1'},thoughtLevel:null,initializeTimeoutMs:500,sessionNewTimeoutMs:500,spawnImpl:()=>{
    const child=fakeChild();let buf='';
    child.stdin.on('data',chunk=>{buf+=chunk;let i;while((i=buf.indexOf('\n'))>=0){const req=JSON.parse(buf.slice(0,i));buf=buf.slice(i+1);timings.push(req.method);
      if(req.method==='session/prompt')continue;
      const result=req.method==='initialize'?{agentCapabilities:{}}:req.method==='session/new'?{sessionId:'synthetic'}:{};
      setTimeout(()=>child.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result})+'\n'), req.method==='session/set_model'?0:60);
    }});return child;
  }});
  const start=performance.now();let code;
  try {await c.promptText('synthetic',{timeoutMs:20});}catch(e){code=e.code;}
  report.results.promptBudget={promptTimeoutMs:20,elapsedMs:performance.now()-start,code,methods:timings};c.close();
}

{
  const provider=new EmbeddingProvider({modelPath:'synthetic',startupTimeoutMs:200,spawnImpl:fakeChild});
  const controller=new AbortController();
  const start=performance.now();const p=provider.embed(['synthetic'],{signal:controller.signal});
  const timer=setTimeout(()=>controller.abort(),10);let code;
  try{await p;}catch(e){code=e.code;}
  report.results.embeddingStartupCancel={cancelAfterMs:10,elapsedMs:performance.now()-start,code};clearTimeout(timer);await provider.close();
}

{
  const assistant=new AssistantService({list:()=>({works:[{id:'synthetic',title:'Synthetic'}]})},null,directory);
  assistant.provider.listModels=async()=>{await delay(180);throw Object.assign(new Error('synthetic catalogue failure'),{code:'AGY_MODELS'});};
  const controller=new AbortController();const start=performance.now();
  const p=assistant.send({workId:'synthetic',text:'synthetic',modelId:'gemini-3.8-flash-low',requestId:'synthetic'},{signal:controller.signal});
  const timer=setTimeout(()=>controller.abort(),10);let code;
  try{await p;}catch(e){code=e.code;}
  report.results.catalogueCancel={cancelAfterMs:10,elapsedMs:performance.now()-start,code};clearTimeout(timer);assistant.close();
}
writeFileSync(join(directory,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({directory,...report},null,2));
