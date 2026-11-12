import {parseBookProgress} from './book-agent-prompt.mjs';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const base=resolve('拆书工作区');const path=join(base,'派工队列.json');
const queue=JSON.parse(readFileSync(path,'utf8'));const summary=[];
for(const job of queue.jobs){
 const stateFile=join(job.workspace,'运行记录/运行状态.json');
 const progressFile=join(job.workspace,'进度.json');let state,progress;
 try{state=JSON.parse(readFileSync(stateFile,'utf8'));}catch{}
 try{progress=parseBookProgress(readFileSync(progressFile,'utf8'));}catch{}
 if(job.state==='running'&&state){
  if(state.state==='rate_limited'){
   job.state='retry';job.effort='low';job.resume=true;job.lastIssue='quota_exhausted';
   if(!queue.overnight?.quotaPolicy)job.model='hy3';
  }
  else if(['awaiting_review','needs_attention','worker_error'].includes(state.state)){job.state=state.state;job.lastIssue=state.error??state.promptResult?._meta?.['codebuddy.ai/errorMessage']??null;}
 }
 if(job.state!=='completed'&&(state||job.state!=='queued'))summary.push({book:job.title,state:job.state,workerState:state?.state,model:state?.model,sessionId:state?.sessionId,lastActivityAt:state?.lastActivityAt,progress:progress?{phase:progress.phase,completedVolumes:progress.completedVolumes,totalVolumes:progress.totalVolumes,estimatedMinutesRemaining:progress.estimatedMinutesRemaining,remainingWork:String(progress.remainingWork??'').slice(0,400),updatedAt:progress.updatedAt}:undefined,issue:job.lastIssue});
}
queue.stopRequested=queue.stopRequested||existsSync(join(base,'停止派工'));
queue.lastObservedAt=new Date().toISOString();
writeFileSync(path,JSON.stringify(queue,null,2));
console.log(JSON.stringify({stopRequested:queue.stopRequested,counts:queue.jobs.reduce((a,j)=>(a[j.state]=(a[j.state]??0)+1,a),{}),active:summary},null,2));
