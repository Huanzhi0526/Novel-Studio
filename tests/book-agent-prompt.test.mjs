import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildBookAgentPrompt,completionDisposition,deepseekCompletionInstruction,parseBookProgress} from '../scripts/book-agent-prompt.mjs';
test('Windows UTF-8 BOM进度也识别完成，避免反复续作已完成任务',()=>{
 assert.equal(completionDisposition(parseBookProgress('\uFEFF{"phase":"completed","completedVolumes":14}')),'complete');
 assert.equal(completionDisposition(parseBookProgress('{"phase":"reading"}')),'continue');
});

test('实际DeepSeek调用只注入一次用户原句并携带完整交付约束',()=>{
 const p=buildBookAgentPrompt({model:'deepseek-v4.1-flash',task:`任务\n<!-- DEEPSEEK_ONLY_BEGIN -->${deepseekCompletionInstruction}<!-- DEEPSEEK_ONLY_END -->`,resume:true});
 assert.equal(p.split(deepseekCompletionInstruction).length-1,1);
 assert.match(p,/不要作为正式 `result.zip`/u);
 assert.match(p,/主语、时间和事件归属/u);
 assert.match(p,/每个引用编号可落到支持该主张的段落/u);
});
test('回退免费Hy3时清除旧任务文件里的DeepSeek专属段落',()=>{
 const p=buildBookAgentPrompt({model:'hy3',task:`保留任务\n<!-- DEEPSEEK_ONLY_BEGIN -->${deepseekCompletionInstruction}<!-- DEEPSEEK_ONLY_END -->`,continuation:true});
 assert.ok(p.includes('保留任务'));
 assert.ok(!p.includes(deepseekCompletionInstruction));
 assert.ok(!p.includes('DEEPSEEK_ONLY'));
});
test('阶段、阅读、写卡及缺少状态都继续；完整或真实阻碍才结束',()=>{
 for(const phase of ['partial','reading','writing','validating'])assert.equal(completionDisposition({phase}),'continue');
 assert.equal(completionDisposition(undefined),'continue');
 assert.equal(completionDisposition({phase:'completed'}),'complete');
 assert.equal(completionDisposition({phase:'blocked'}),'blocked');
 assert.equal(completionDisposition({phase:'cancelled'}),'blocked');
});
