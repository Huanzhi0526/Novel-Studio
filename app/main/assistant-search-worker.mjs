import { parentPort, workerData } from 'node:worker_threads';
import { ReferenceStoreV2 } from '../kb-v2/store-v2.mjs';
import { RetrievalEngineV2 } from '../kb-v2/retrieval-v2.mjs';
import { SearchEngineV2 } from '../kb-v2/search-v2.mjs';

const store=new ReferenceStoreV2(workerData.filename,{readOnly:true});
const pending=new Map();let sequence=0,requestId;
const bridge=(kind,payload)=>new Promise((resolve,reject)=>{
  const id=++sequence;pending.set(id,{resolve,reject});parentPort.postMessage({kind,id,requestId,...payload});
});
const engine=new SearchEngineV2(store,{id:workerData.modelId,embed:(texts,{query}={})=>bridge('embed',{texts,query})});
const retrieval=new RetrievalEngineV2(engine,{customComplete:(messages,options)=>bridge('complete',{messages,options})});
parentPort.on('message',async message=>{
  if(message.kind==='reply'){
    const p=pending.get(message.id);if(!p)return;pending.delete(message.id);
    message.error?p.reject(Object.assign(new Error(message.error.message),{code:message.error.code})):p.resolve(message.text);return;
  }
  if(message.kind!=='run')return;
  requestId=message.requestId;store.generation=message.generation;
  try {
    const result=message.method==='read'?engine.toolReadOriginalRange(message.args):await (message.ai?retrieval:engine).query(message.args);
    parentPort.postMessage({requestId,result});
  }catch(error){parentPort.postMessage({requestId,error:{code:error.code,message:error.message}});}
});
