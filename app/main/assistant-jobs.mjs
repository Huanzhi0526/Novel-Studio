import { randomUUID } from 'node:crypto';
import { awaitWithSignal } from '../kb-v2/agy-client.mjs';

export function submitReferenceJob(e,search,args,signal) {
  const key=JSON.stringify([args.query.trim(),args.mode==='deep'?'deep':'fast']);
  const existing=[...e.jobs.values()].find(j=>j.key===key&&j.signal===signal);
  if(existing)return {jobId:existing.id,status:existing.status,nextTool:'reference_result'};
  while(e.jobs.size>=20){
    const old=[...e.jobs.values()].find(j=>!['queued','running'].includes(j.status));
    if(!old)throw new Error('检索任务过多，请先等待当前任务');
    e.jobs.delete(old.id);
  }
  const controller=new AbortController();const taskSignal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const job={id:randomUUID(),key,status:'queued',started:Date.now(),signal,controller};
  e.jobs.set(job.id,job);
  job.promise=e.jobLane.catch(()=>{}).then(async()=>{
    taskSignal.throwIfAborted();job.status='running';e.activity='检索AI正在查库与筛选';
    e.client?.record?.('retrieval-start');
    const progress=setInterval(()=>{const state=e.client?.sessionStatus?.get(e.client.assistantSessionId);if(state)state.lastActivity=Date.now();},1000);
    progress.unref?.();
    try {
      const result=await awaitWithSignal(search.query({query:args.query,mode:args.mode==='deep'?'deep':'fast',limit:8},{signal:taskSignal,operationId:job.id,parentId:e.operationId,deadline:e.deadline}),taskSignal);
      taskSignal.throwIfAborted();job.result=result;job.status='done';e.sources=result;e.sourceVersion++;e.activity='检索已完成，等待助手领取并整理';
      e.client?.record?.('retrieval-complete',{durationMs:Date.now()-job.started,degraded:Boolean(result.degraded)});
    }finally{clearInterval(progress);}
  }).catch(error=>{job.status='failed';job.error={code:error.code??error.name,message:error.message};e.client?.record?.('retrieval-failed',{code:job.error.code,durationMs:Date.now()-job.started});});
  e.jobLane=job.promise;
  return {jobId:job.id,status:'queued',nextTool:'reference_result',instruction:'请用reference_result领取结果，不要重新提交相同查询。'};
}

export async function collectReferenceJob(e,args,signal) {
  const job=e.jobs.get(args.jobId);
  if(!job||job.signal!==signal)throw new Error('找不到本书本轮检索任务');
  if(['queued','running'].includes(job.status)){
    let timer;
    try{await awaitWithSignal(Promise.race([job.promise,new Promise(resolve=>{timer=setTimeout(resolve,8000);})]),signal);}
    finally{clearTimeout(timer);}
  }
  signal?.throwIfAborted();
  if(!['queued','running'].includes(job.status)){job.collected=true;e.activity='正在结合本书资料整理建议';}
  return {jobId:job.id,status:job.status,elapsedMs:Date.now()-job.started,...(job.status==='done'?{result:job.result}:job.status==='failed'?{error:job.error}:{nextTool:'reference_result',instruction:'任务仍在运行，请继续领取；不要虚构检索结果。'})};
}
