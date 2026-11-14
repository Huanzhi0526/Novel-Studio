import { parentPort, workerData } from 'node:worker_threads';
import { ReferenceStoreV2 } from '../kb-v2/store-v2.mjs';
import {RetrievalEngineV2} from '../kb-v2/retrieval-v2.mjs';
import { SearchEngineV2 } from '../kb-v2/search-v2.mjs';

let store;
try {
  store = new ReferenceStoreV2(workerData.filename, {readOnly:true});
  const engine = new SearchEngineV2(store, {
    id:workerData.modelId,
    embed:async(texts,{query}={})=>{
      if(workerData.ai)return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});parentPort.postMessage({kind:'embed',id,texts,query});});
      if(workerData.embeddingError) throw Object.assign(new Error('Embedding unavailable'),{code:workerData.embeddingError});
      return workerData.vectors;
    }
  });
  const pending=new Map();let sequence=0;
  parentPort.on('message',message=>{const p=pending.get(message.id);if(!p)return;pending.delete(message.id);message.error?p.reject(Object.assign(new Error(message.error.message),{code:message.error.code})):p.resolve(message.text);});
  const retrieval=new RetrievalEngineV2(engine,{customComplete:(messages,options)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});parentPort.postMessage({kind:'complete',id,messages,options});})});
  const result = workerData.ai ? await retrieval.query(workerData.args) : workerData.method==='query'
    ? await engine.query(workerData.args)
    : engine.toolReadOriginalRange(workerData.args);
  parentPort.postMessage({result});
} catch(error) {
  parentPort.postMessage({error:{message:error.message,code:error.code}});
} finally {store?.close();}
