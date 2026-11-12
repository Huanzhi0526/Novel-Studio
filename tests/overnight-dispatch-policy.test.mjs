import {test} from 'node:test';import assert from 'node:assert/strict';
import {nextBatchAllowed,shutdownReady} from '../scripts/overnight-dispatch-policy.mjs';
const cutoffAt='2026-11-12T06:00:00+08:00';
test('只在北京时间截止前创建新批次',()=>{
 assert.equal(nextBatchAllowed({enabled:true,cutoffAt},new Date('2026-11-12T05:59:59+08:00')),true);
 assert.equal(nextBatchAllowed({enabled:true,cutoffAt},new Date(cutoffAt)),false);
 assert.equal(nextBatchAllowed({enabled:false,cutoffAt},new Date('2026-11-11T23:00:00+08:00')),false);
});
test('关机须到点、整批接收、无在跑任务且明确准备完成',()=>{
 const q={overnight:{enabled:true,cutoffAt,shutdownAuthorized:true,shutdownReady:true,lastBatchAcceptedAt:'2026-11-12T06:10:00+08:00',batchWorkIds:['a']},jobs:[{work_id:'a',state:'completed'}]};
 assert.equal(shutdownReady(q,new Date('2026-11-12T06:11:00+08:00')),true);
 assert.equal(shutdownReady(q,new Date('2026-11-12T05:59:00+08:00')),false);
 q.jobs[0].state='awaiting_import';assert.equal(shutdownReady(q,new Date('2026-11-12T06:11:00+08:00')),false);
 q.jobs[0].state='completed';q.overnight.shutdownReady=false;assert.equal(shutdownReady(q,new Date('2026-11-12T06:11:00+08:00')),false);
});
