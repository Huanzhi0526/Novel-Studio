// Explicit opt-in: synthetic texts only; consumes the signed-in CLI account quota.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {AgyRetrievalProvider} from '../app/kb-v2/agy-provider.mjs';
import {Store} from '../app/main/store.mjs';
import {WritingService} from '../app/main/writing.mjs';
import {ReferenceStoreV2} from '../app/kb-v2/store-v2.mjs';
import {SearchEngineV2} from '../app/kb-v2/search-v2.mjs';
import {RetrievalEngineV2} from '../app/kb-v2/retrieval-v2.mjs';
import {AssistantSearch} from '../app/main/assistant-search.mjs';
import {AssistantService} from '../app/main/assistant.mjs';
assert.equal(process.env.NOVEL_STUDIO_REAL_QA,'1','Set NOVEL_STUDIO_REAL_QA=1 to explicitly spend account quota on synthetic QA.');
const root=await mkdtemp(resolve('.local/stability-20261115/real-')),report={root,syntheticOnly:true,checks:[]};
const formal='C:/Users/78828/AppData/Local/Novel Studio';
const choices={retrieval:JSON.parse(await readFile(join(formal,'retrieval-provider.json'),'utf8')),expand:JSON.parse(await readFile(join(formal,'expansion-provider.json'),'utf8'))};
const providers=[];
let service,store,ref;
try{
 for(const purpose of ['retrieval','expand']){
  const dir=join(root,purpose);await mkdir(dir,{recursive:true});const file=purpose==='expand'?'expansion-provider.json':'retrieval-provider.json';
  await writeFile(join(dir,file),JSON.stringify({...choices[purpose],source:'agy'}));
  const p=new AgyRetrievalProvider(dir,{purpose});providers.push(p);
  for(const temperature of ['cold','warm']){
   const start=Date.now();try{const text=await p.complete([{role:'user',content:'合成连接验收，请只返回JSON {"ok":true}，不要调用工具。'}],{timeoutMs:90000});assert.match(text,/"ok"\s*:\s*true/);report.checks.push({purpose,temperature,modelId:p.read().modelId,durationMs:Date.now()-start,passed:true});}
   catch(error){report.checks.push({purpose,temperature,modelId:p.read().modelId,durationMs:Date.now()-start,passed:false,code:error.code,stage:error.details?.stage,promptSent:error.details?.promptSent});break;}
  }
 }
 const dir=join(root,'assistant');await mkdir(dir,{recursive:true});await writeFile(join(dir,'retrieval-provider.json'),JSON.stringify({...choices.retrieval,source:'agy'}));
 store=new Store(join(dir,'library.sqlite'));const writing=new WritingService(store),workId=writing.createWork({title:'合成纸桥'}).id;writing.createDoc({workId,kind:'outline',title:'合成大纲',text:'两位虚构学徒合作修桥，争论应当先试验还是先筹钱。'});
 ref=new ReferenceStoreV2(join(dir,'reference-v2.sqlite'));ref.ingestExportedBook({work:{work_id:'qa-reference',title:'合成合作案例'},resources:[],structures:[],volumes:[{volume_id:'v1',revision_id:'r1',title:'合成卷',normalized_payload:{blocks:[{kind:'text',text:'两名学徒分工修桥。一人寻找木料，另一人检验承重；他们在争论后互相理解。'}]}}]},null);ref.replaceVolumeScenes('qa-reference','v1','r1',[{title:'学徒分工合作修桥',characters:['学徒甲','学徒乙'],objective_summary:'通过分工修桥建立互信。',start_p:1,end_p:1}]);
 const provider=new AgyRetrievalProvider(dir);providers.push(provider);const engine=new SearchEngineV2(ref,null),retrieval=new RetrievalEngineV2(engine,{sourceProvider:provider});
 service=new AssistantService(writing,new AssistantSearch(engine,{retrieval}),dir);
 for(const temperature of ['cold','warm']){
  const start=Date.now();try{
   await service.send({workId,text:'这是合成验收。请先用reference_search查“合作修桥”，继续用reference_result领取到done，再给一句创作建议；不要联网，不写记忆。',modelId:choices.retrieval.modelId});
   const e=service.entry(workId),jobs=[...e.jobs.values()].filter(j=>j.signal===e.signal);assert.ok(jobs.some(j=>j.status==='done'&&j.collected));assert.ok(e.messages.at(-1).text.trim());
   report.checks.push({purpose:'assistant',temperature,modelId:choices.retrieval.modelId,durationMs:Date.now()-start,jobs:jobs.map(j=>({status:j.status,collected:j.collected,degraded:j.result?.degraded,hits:j.result?.hits?.length})),passed:true});
  }catch(error){report.checks.push({purpose:'assistant',temperature,modelId:choices.retrieval.modelId,durationMs:Date.now()-start,passed:false,code:error.code,stage:error.details?.stage,promptSent:error.details?.promptSent});break;}
 }
 report.passed=report.checks.length===6&&report.checks.every(v=>v.passed);
}finally{await service?.close();await Promise.all(providers.map(p=>p.close()));ref?.close();store?.close();await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
