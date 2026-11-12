import {readFileSync} from 'node:fs';

export const deepseekCompletionInstruction='我们是deepseek，你的预算是无限量的，请不要在意陈本，一定要把交付的任务完完本本地做完，不要有遗漏';
const contract=readFileSync(new URL('../拆书规范包/完整交付与内容自检.md',import.meta.url),'utf8');
export function buildBookAgentPrompt({model,task='',resume=false,continuation=false}){
 const clean=task.replace(/<!-- DEEPSEEK_ONLY_BEGIN -->[\s\S]*?<!-- DEEPSEEK_ONLY_END -->/gu,'').trim();
 const intro=continuation?'原任务尚未完整完成。保留已有笔记、卡片ID和已接收基线，直接继续剩余工作，不交阶段稿、不等用户确认。':resume?'继续此前本书任务，先核对进度和施工输出，从断点完成全部原范围，保留有效成果。':'';
 const modelExtra=/deepseek/iu.test(model??'')?`\n\n## 当前DeepSeek模型专属督促\n${deepseekCompletionInstruction}\n`:'';
 return `${intro}\n\n${clean}\n\n# 最新完整交付与核证要求（优先适用）\n${contract}${modelExtra}`.trim();
}
export function completionDisposition(progress){
 if(progress?.phase==='completed')return 'complete';
 if(['blocked','cancelled','stopped'].includes(progress?.phase))return 'blocked';
 return 'continue';
}
export function parseBookProgress(text){return JSON.parse(text.replace(/^\uFEFF/u,''));}
