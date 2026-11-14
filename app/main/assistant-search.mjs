import { Worker } from 'node:worker_threads';

// SQLite scanning and vector scoring must never run on Electron's UI-serving thread.
export class AssistantSearch {
  constructor(search, {workerURL=new URL('./assistant-search-worker.mjs',import.meta.url),retrieval=null}={}) {
    this.search=search;this.retrieval=retrieval;this.workerURL=workerURL;this.active=new Set();
  }
  async query(args,{signal}={}) {
    if(this.retrieval)return this.run('query',{...args,mode:args.mode??'fast'},{signal});
    let vectors=[],embeddingError;
    try {vectors=await this.search.encode([args.query],signal,true);}
    catch(error){signal?.throwIfAborted();embeddingError=error.code??'EMBED_UNAVAILABLE';}
    return this.run('query',{...args,...(this.retrieval?{mode:args.mode??'fast'}:{})},{signal,vectors,embeddingError});
  }
  toolReadOriginalRange(args,{signal}={}) {return this.run('read',args,{signal});}
  run(method,args,{signal,vectors,embeddingError}={}) {
    signal?.throwIfAborted();
    return new Promise((resolve,reject)=>{
      const worker=new Worker(this.workerURL,{workerData:{filename:this.search.reference.filename,method,args,vectors,embeddingError,ai:method==='query'&&Boolean(this.retrieval),modelId:this.search.embedding?.id}});
      let settled=false;
      const finish=(error,value)=>{
        if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
        this.active.delete(worker);void worker.terminate();error?reject(error):resolve(value);
      };
      const abort=()=>finish(signal.reason??new Error('检索已取消'));
      const timer=setTimeout(()=>finish(new Error('参考检索超过等待上限，已停止；可缩小问题后重试。')),this.retrieval?210000:60000);
      worker.on('message',async message=>{
        if(message.kind==='complete'||message.kind==='embed') {
          try {const text=await (message.kind==='embed'?this.search.encode(message.texts,signal,message.query):this.retrieval.completeForSearch(message.messages,message.options,signal));if(!settled)worker.postMessage({id:message.id,text});}
          catch(error){if(!settled)worker.postMessage({id:message.id,error:{message:error.message,code:error.code}});}
          return;
        }
        finish(message.error?Object.assign(new Error(message.error.message),{code:message.error.code}):null,message.result);
      });
      worker.once('error',error=>finish(error));
      worker.once('exit',code=>finish(new Error(`检索工作线程提前退出（${code}）`)));
      signal?.addEventListener('abort',abort,{once:true});
      this.active.add(worker);if(signal?.aborted)abort();
    });
  }
  close(){for(const worker of this.active)void worker.terminate();this.active.clear();}
}
