export function nextBatchAllowed(policy,now=new Date()){
 return policy?.enabled===true&&!policy.shutdownIssuedAt&&Number.isFinite(Date.parse(policy.cutoffAt))&&+now<Date.parse(policy.cutoffAt);
}
export function shutdownReady(queue,now=new Date()){
 const p=queue.overnight;
 return p?.enabled===true&&p.shutdownAuthorized===true&&p.shutdownReady===true&&
  Number.isFinite(Date.parse(p.cutoffAt))&&+now>=Date.parse(p.cutoffAt)&&
  Date.parse(p.lastBatchAcceptedAt)>=Date.parse(p.cutoffAt)&&
  Array.isArray(p.batchWorkIds)&&p.batchWorkIds.length>0&&
  p.batchWorkIds.every(id=>queue.jobs.find(j=>j.work_id===id)?.state==='completed')&&
  !queue.jobs.some(j=>j.state==='running');
}
