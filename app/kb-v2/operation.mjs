import { randomUUID } from 'node:crypto';
import { awaitWithSignal } from './agy-client.mjs';

export function operation({signal,timeoutMs=90000,deadline=Date.now()+timeoutMs,operationId=randomUUID(),parentId,validate}={}) {
  deadline=Math.min(deadline,Date.now()+timeoutMs);
  const controller=new AbortController();
  const error=Object.assign(new Error('请求总等待期限已到，已停止。'),{code:'AGY_TIMEOUT'});
  const timer=setTimeout(()=>controller.abort(error),Math.max(0,deadline-Date.now()));
  const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  return {signal:combined,deadline,operationId,parentId,validate,close:()=>clearTimeout(timer)};
}

// Hold this lane only through process/session setup, never through a prompt or tool.
export class StartupLane {
  constructor(limit=32){this.tail=Promise.resolve();this.size=0;this.limit=limit;}
  run(task,signal){
    signal?.throwIfAborted();
    if(this.size>=this.limit)return Promise.reject(Object.assign(new Error('本机连接准备队列已满，请稍后重试。'),{code:'AGY_BUSY'}));
    this.size++;
    const job=this.tail.catch(()=>{}).then(()=>{signal?.throwIfAborted();return task();});
    this.tail=job;
    job.finally(()=>this.size--).catch(()=>{});
    return awaitWithSignal(job,signal);
  }
}
export const startupLane=new StartupLane();
