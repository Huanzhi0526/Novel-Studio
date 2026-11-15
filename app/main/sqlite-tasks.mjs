import {Worker} from 'node:worker_threads';
export class SqliteTasks {
  constructor(){this.jobs=new Map();this.blocked=false;}
  run(data,{signal}={}){
    signal?.throwIfAborted();
    if(this.blocked||this.jobs.size>=4)return Promise.reject(Object.assign(new Error('资料维护正在进行，请稍后重试。'),{code:'BACKUP_BUSY'}));
    const worker=new Worker(new URL('./sqlite-worker.mjs',import.meta.url),{workerData:data});
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=async(error,result)=>{
        if(settled)return;settled=true;signal?.removeEventListener('abort',abort);
        await worker.terminate();this.jobs.delete(worker);error?reject(error):resolve(result);
      };
      const abort=()=>void finish(signal.reason);
      this.jobs.set(worker,()=>finish(Object.assign(new Error('资料库正在切换'),{code:'SEARCH_STALE'})));
      worker.once('message',m=>void finish(m.error?Object.assign(new Error(m.error.message),{code:m.error.code}):null,m.result));
      worker.once('error',e=>void finish(e));
      worker.once('exit',code=>{if(!settled)void finish(new Error(`资料线程意外退出(${code})`));});
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    });
  }
  async close(){this.blocked=true;await Promise.all([...this.jobs.values()].map(stop=>stop()));}
}
export const sqliteTasks=new SqliteTasks();
