import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {quotaRecovery} from './book-quota-policy.mjs';
const qp=resolve('拆书工作区/派工队列.json'),q=JSON.parse(readFileSync(qp,'utf8'));const j=q.jobs.find(j=>j.work_id===process.argv[2]);assert.ok(j,'指定work_id');assert.notEqual(j.state,'running','先核对任务已停止，禁止重开活跃会话');
let resetAt;
if(process.argv[3]){const d=JSON.parse(readFileSync(process.argv[3],'utf8'));const blocking=d.command?.data?.groups?.find(g=>g.name==='Gemini Models')?.buckets?.filter(b=>b.remaining_fraction<=0)??[];if(blocking.length)resetAt=blocking.map(b=>b.reset_time).filter(x=>Number.isFinite(Date.parse(x))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];}
const recovery=quotaRecovery({engine:j.engine??'antigravity',model:j.model,resetAt});
j.quotaHistory??=[];j.quotaHistory.push({at:new Date().toISOString(),previousEngine:j.engine,previousModel:j.model,resetAt,...recovery});j.engine=recovery.engine;j.model=recovery.model;j.effort='low';j.state='retry';j.resume=true;j.lastIssue='quota recovery: '+recovery.action;
if(recovery.retryNotBefore)j.retryNotBefore=recovery.retryNotBefore;else delete j.retryNotBefore;
if(recovery.action==='switch'){q.overnight.defaultEngine=recovery.engine;q.overnight.defaultModel=recovery.model;if(resetAt)q.overnight.geminiResumeAt=resetAt;}
writeFileSync(qp,JSON.stringify(q,null,2));console.log(JSON.stringify({book:j.title,...recovery}));
