import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
const root=resolve('.');const base=join(root,'拆书工作区');
if(existsSync(join(base,'派工队列.json')))throw new Error('派工队列已存在；不要重建覆盖在跑状态，请用状态和补派脚本接续。');
const dispatch=join(base,'Novel Studio 拆书派工');const output=join(base,'本地知识库拆书');
const dbPath='C:/Users/78828/AppData/Local/Novel Studio/library.sqlite';
const db=new DatabaseSync(dbPath,{readOnly:true});
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const bundle='NovelStudio-拆书交接包-v1.0.zip';
assert.equal(hash(join(dispatch,bundle)),hash(join(root,'release',bundle)));
execFileSync('python',['-B','-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None',join(dispatch,bundle)]);
const skipped=new Set(['a393787e-e834-4a00-890c-2e0da4b1c155','5aee8911-cecc-5e6c-b0b1-0aeb487eb20d']);
const works=db.prepare('SELECT w.work_id,w.title,w.deleted IS NOT NULL archived,count(v.volume_id) volumes FROM reference_works w JOIN reference_volumes v USING(work_id) GROUP BY w.work_id').all().filter(w=>!skipped.has(w.work_id));
works.sort((a,b)=>a.archived-b.archived||a.volumes-b.volumes||a.title.localeCompare(b.title,'zh-CN'));
// 后日谈在主篇之后处理。
const after=works.findIndex(w=>w.title.includes('Unnamed Memory')&&w.title.includes('后日谈'));
if(after>=0){const [item]=works.splice(after,1);const main=works.findIndex(w=>w.title.includes('Unnamed Memory')&&!w.title.includes('后日谈'));works.splice(main+1,0,item);}
const generic=readFileSync(join(root,'待拆书交接/拆书Agent接手提示词.md'),'utf8');
const queue={schema:1,createdAt:new Date().toISOString(),concurrency:3,model:'deepseek-v4.1-flash',effort:'low',contextPolicy:'highest-model-preset',fallbackModel:'hy3',fallbackEffort:'low',firstCheckIntervalMinutes:30,checkIntervalMinutes:30,stopRequested:false,completedWorkIds:[...skipped],jobs:[]};
try{for(const [i,w] of works.entries()){
 const name=w.title.replace(/（中译版）$/u,'').replace(/[<>:"/\\|?*]/g,'_');const workspace=join(output,name);mkdirSync(workspace,{recursive:true});
 const input=join(workspace,'输入');mkdirSync(input,{recursive:true});
 const raw=join(input,'同版正文');const archive=join(input,'原文-同版正文.zip');
 const volumes=db.prepare('SELECT v.volume_id,r.revision_id FROM reference_volumes v JOIN reference_revisions r USING(volume_id) WHERE v.work_id=? ORDER BY v.title,r.imported DESC,r.revision_id').all(w.work_id);
 const unique=[...new Map(volumes.map(v=>[v.volume_id,v])).values()];
 // 当前库每卷只有一个版本；防止选择逻辑静默覆盖新版。
 assert.equal(unique.length,volumes.length,'多版本卷需要明确版本选择');
 if(!existsSync(raw))execFileSync(process.execPath,['--disable-warning=ExperimentalWarning','scripts/export-reference-input.mjs','export',dbPath,w.work_id,raw,...unique.map(v=>v.volume_id+'@'+v.revision_id)],{cwd:root,stdio:'pipe'});
 if(!existsSync(archive))execFileSync('python',['-B','-X','utf8','待拆书交接/工具/pack-result.py',raw,'--out',archive],{cwd:root,stdio:'pipe'});
 copyFileSync(join(dispatch,bundle),join(input,bundle));
 const prompt=generic+`\n\n# 本次自动派工（优先于通用提示中的留空项）\n\n- 书名：${w.title}\n- 范围：本次原文 ZIP 内全部 ${w.volumes} 卷，沿用 work_id ${w.work_id}、每卷 revision_id 与全部段号；不接触历史旧卡。\n- 工作区：${workspace}\n- 三件套：输入/原文-同版正文.zip、输入/${bundle}、本任务提示词.md。先把交接包解压到本书工作区工具目录，再读其中 AGENTS、README、流程及九类标准。\n- 输入只读，施工写入本书的施工输出目录；不得改项目代码、正式库、模型、凭证、其他书或共享派工原文。需要工具时只用交接包自带工具和本机现成 Node/Python，不安装或升级依赖。\n- 所有派工卷均需真实读完并登记；分块阅读，持续维护跨卷对象笔记和处理范围，不把自动扫词或模板填充冒充阅读。公开资料先查作者/出版社，再同版原文核实与独立归纳。网络不可用时如实记录，继续原文。\n- 成稿必须含受限 Markdown、九类适用分组检索标签、贴近主张的证据编号。不得只批量产生空泛短卡或用标签代替具体内容；没有合适卡的类别按实际说明。\n- 全局并发上限3；本会话不得启动子代理、团队、其他模型或其他 CodeBuddy 进程。只完成这一部。\n- 每完成一卷或一个阶段更新 进度.json，字段 phase、completedVolumes、totalVolumes、remainingWork、estimatedMinutesRemaining、updatedAt；估计要诚实，不能伪报完成。\n- 最终 施工输出/交付 只留本次正式 result.zip（超过协议32MiB时按交接流程拆包，回执解释），附研究与验收记录、作品与卷身份清单、真实检索题及预期卡ID、校验日志、未完成事项。工作台实测不可用则注明待接收方复跑。\n- 完成随包打包器、校验器、内容筛查和独立自检后，把最终包ID及SHA-256写入交付回执.md。只有全部派工范围完成才把进度.json的phase写 completed；未完成只保存内部检查点并继续，不交阶段稿；真实阻碍如实记录，不得冒充完工。\n- 不向用户询问常规施工选择，按规范持续完成。不得正式导入或解除封存，接收方会验收。\n`;
 const promptPath=join(workspace,'任务提示词.md');writeFileSync(promptPath,prompt);
 writeFileSync(join(workspace,'AGENTS.md'),'# 本书拆书工作区\n\n按任务提示词.md施工，只在本目录内写入。输入只读；不修改父项目、正式用户资料及其他书。全局并发最多3，本会话不再派生模型或子代理。每阶段维护进度.json。\n');
 const job={...w,order:i+1,state:'queued',workspace,prompt:promptPath,model:queue.model,effort:queue.effort,contextPolicy:queue.contextPolicy,input:archive,inputSha256:hash(archive),bundleSha256:hash(join(input,bundle)),volumesIdentity:unique};
 writeFileSync(join(workspace,'派工任务.json'),JSON.stringify(job,null,2));queue.jobs.push(job);
 console.log(`${i+1}/${works.length} ${w.title} ${w.volumes}卷`);
}}finally{db.close();writeFileSync(join(base,'派工队列.json'),JSON.stringify(queue,null,2));}
