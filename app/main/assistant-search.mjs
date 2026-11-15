import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { awaitWithSignal } from '../kb-v2/agy-client.mjs';

const failure = (code, message) => Object.assign(new Error(message), {code});

// One read-only worker, one bounded FIFO. Cursors survive between pages.
// Cancellation kills the scan; never fall back to the UI-serving thread.
export class AssistantSearch {
  constructor(search, {workerURL=new URL('./assistant-search-worker.mjs',import.meta.url),retrieval=null}={}) {
    this.search=search; this.retrieval=retrieval; this.workerURL=workerURL;
    this.controllers=new Set();this.active=new Set(); this.lane=Promise.resolve(); this.queued=0;
    this.worker=null; this.generation=null; this.stopping=Promise.resolve(); this.epoch=0;
  }
  snapshot(includeAI=true) {
    return JSON.stringify([this.search.reference.generation,this.search.embedding?.id,
      includeAI?this.retrieval?.sourceProvider?.snapshot():null,includeAI?this.retrieval?.config?.read():null]);
  }
  query(args,context={}) {return this.run('query',{...args,mode:args.mode ?? (this.retrieval && args.useAi !== false ? 'fast' : 'local')},context);}
  toolReadOriginalRange(args,context={}) {return this.run('read',args,context);}
  run(method,args,{signal,operationId=randomUUID(),parentId,deadline}={}) {
    signal?.throwIfAborted();
    if(this.queued>=20) return Promise.reject(failure('SEARCH_BUSY','检索队列已满，请等待或取消当前任务。'));
    const includeAI=method==='query'&&args.mode!=='local';
    const snapshot=this.snapshot(includeAI), epoch=this.epoch;
    const controller=new AbortController();this.controllers.add(controller);
    signal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const timer=setTimeout(()=>controller.abort(failure('SEARCH_TIMEOUT','参考检索超过总等待上限，已停止。')),Math.min(this.retrieval?360000:60000,deadline?Math.max(0,deadline-Date.now()):Infinity));
    const ensure=()=>{signal.throwIfAborted();if(epoch!==this.epoch||snapshot!==this.snapshot(includeAI))throw failure('SEARCH_STALE','资料或模型配置已变更，请重新检索。');};
    this.queued++;
    const job=this.lane.catch(()=>{}).then(async()=>{
      ensure(); await this.stopping; ensure();
      if(this.generation!==snapshot){await this.stopWorker();ensure();this.generation=snapshot;}
      if(args.cursor&&!this.worker)throw failure('SEARCH_STALE','分页已过期，请重新搜索');
      if(!this.worker)this.worker=new Worker(this.workerURL,{workerData:{filename:this.search.reference.filename,modelId:this.search.embedding?.id}});
      const worker=this.worker,id=randomUUID();this.active.add(worker);
      try {
        const result=await new Promise((resolve,reject)=>{
          const cleanup=()=>{worker.off('message',message);worker.off('error',error);worker.off('exit',exit);signal.removeEventListener('abort',abort);};
          const error=e=>{cleanup();void this.stopWorker();reject(e);};
          const exit=code=>error(failure('SEARCH_WORKER',`检索线程退出（${code}），请重新搜索。`));
          const abort=()=>{error(signal.reason);void this.stopWorker();};
          const message=async m=>{
            if(m.requestId!==id)return;
            if(m.kind==='complete'||m.kind==='embed'){
              try {ensure();const value=await (m.kind==='embed'?this.search.encode(m.texts,signal,m.query):this.retrieval.completeForSearch(m.messages,{...m.options,validate:ensure,operationId:randomUUID(),parentId:operationId,deadline:deadline??Date.now()+360000},signal));ensure();worker.postMessage({kind:'reply',id:m.id,text:value});}
              catch(e){if(this.worker===worker)worker.postMessage({kind:'reply',id:m.id,error:{message:e.message,code:e.code}});}
            }else {cleanup();m.error?reject(failure(m.error.code,m.error.message)):resolve(m.result);}
          };
          worker.on('message',message);worker.once('error',error);worker.once('exit',exit);
          signal.addEventListener('abort',abort,{once:true});
          worker.postMessage({kind:'run',requestId:id,method,args,ai:Boolean(this.retrieval),generation:this.search.reference.generation});
          if(signal.aborted)abort();
        });
        ensure();return result;
      }finally{this.active.delete(worker);}
    });
    this.lane=job;
    job.finally(()=>{this.controllers.delete(controller);this.queued--;clearTimeout(timer);}).catch(()=>{});
    return awaitWithSignal(job,signal);
  }
  stopWorker(){const worker=this.worker;this.worker=null;if(worker){this.active.delete(worker);this.stopping=worker.terminate().then(()=>{});}return this.stopping;}
  async close(){this.epoch++;for(const c of this.controllers)c.abort(failure('SEARCH_STALE','资料库正在切换，检索已停止。'));await this.stopWorker();await this.lane.catch(()=>{});}
}
