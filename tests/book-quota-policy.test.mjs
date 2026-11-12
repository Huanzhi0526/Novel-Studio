import {test} from 'node:test';import assert from 'node:assert/strict';import {quotaRecovery,isProviderQuotaError} from '../scripts/book-quota-policy.mjs';
test('额度错误只取提供方错误字段，不从正文或工具说明匹配',()=>{
 assert.equal(isProviderQuotaError({stopReason:'end_turn',toolOutput:'遵守额度耗尽后的回退规则'}),false);
 assert.equal(isProviderQuotaError({_meta:{'codebuddy.ai/errorMessage':'usage_limit_exceeded'}}),true);
 assert.equal(isProviderQuotaError('RESOURCE_EXHAUSTED: quota unavailable'),true);
});
const now=new Date('2026-11-12T00:00:00+08:00');
test('Gemini半小时内刷新就等待，不切换',()=>{
 const r=quotaRecovery({engine:'antigravity',now,resetAt:'2026-11-12T00:20:00+08:00'});assert.equal(r.action,'wait');assert.equal(r.engine,'antigravity');assert.ok(Date.parse(r.retryNotBefore)>Date.parse('2026-11-12T00:20:00+08:00'));
});
test('Gemini刷新很久或未知时先切hy4，不去hy3',()=>{
 for(const resetAt of [undefined,'2026-11-12T02:00:00+08:00'])assert.deepEqual(quotaRecovery({engine:'antigravity',now,resetAt}),{engine:'codebuddy',model:'hy4free',action:'switch'});
});
test('hy4不可用再DeepSeek，DeepSeek耗尽保存等待',()=>{
 assert.equal(quotaRecovery({engine:'codebuddy',model:'hy4free',now}).model,'deepseek-v4.1-flash');assert.equal(quotaRecovery({engine:'codebuddy',model:'deepseek-v4.1-flash',now}).action,'wait');
});
