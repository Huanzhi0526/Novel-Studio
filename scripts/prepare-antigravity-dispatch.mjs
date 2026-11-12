import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,cpSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {nextBatchAllowed} from './overnight-dispatch-policy.mjs';
const root=resolve(import.meta.dirname,'..'),qp=join(root,'拆书工作区/派工队列.json');
const q=JSON.parse(readFileSync(qp,'utf8'));const count=Math.min(3,Math.max(0,Number(process.argv[2]??3)));
if(q.stopRequested||existsSync(join(root,'拆书工作区/停止派工'))||q.automationPaused)throw Error('派工暂停/停止，须用户授权恢复');
const p=q.overnight;if(!p?.enabled)throw Error('缺少本轮夜间授权');
if(p.geminiResumeAt&&Date.now()>=Date.parse(p.geminiResumeAt)){p.defaultEngine='antigravity';p.defaultModel='gemini-3.8-flash-low';delete p.geminiResumeAt;}
let batch=q.jobs.filter(j=>p.batchWorkIds?.includes(j.work_id));
if(!batch.length||batch.every(j=>j.state==='completed')){
 if(!nextBatchAllowed(p)) {console.log(JSON.stringify({jobs:[],reason:'cutoff; finalize and shutdown after accepted batch'}));process.exit(0);}
 batch=q.jobs.filter(j=>j.state!=='completed').sort((a,b)=>a.order-b.order).slice(0,3);
 p.batchId=randomUUID();p.batchWorkIds=batch.map(j=>j.work_id);p.batchStartedAt=new Date().toISOString();p.shutdownReady=false;
}
const active=q.jobs.filter(j=>j.state==='running').length;
const selected=batch.filter(j=>['queued','retry','needs_attention','worker_error'].includes(j.state)&&(!j.retryNotBefore||Date.now()>=Date.parse(j.retryNotBefore))).slice(0,Math.min(count,3-active));
const audit=join(root,'.local','overnight-dispatch',p.batchId);mkdirSync(audit,{recursive:true});
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');const bundle=join(root,'release/NovelStudio-拆书交接包-v1.0.zip'),bundleHash=hash(bundle);const jobs=[];
for(const j of selected){
 const resume=j.state!=='queued';const original=j.originalWorkspace??j.workspace;const oldWorkspace=j.workspace;
 if(!j.runtimeWorkspace){
  const dest=join(root,'.local','antigravity-run','book-'+j.order);
  if(existsSync(dest))throw Error('新短目录已存在，先核对身份：'+dest);
  if(!relative(root,resolve(original))||relative(root,resolve(original)).startsWith('..'))throw Error('原目录越界');
  cpSync(original,dest,{recursive:true,filter:src=>!relative(original,src).split(/[\\/]/).includes('运行记录')});
  j.originalWorkspace=original;j.workspace=dest;j.runtimeWorkspace=dest;
  j.input=join(dest,'输入/原文-同版正文.zip');j.prompt=join(dest,'任务提示词.md');
  writeFileSync(j.prompt,readFileSync(j.prompt,'utf8').replaceAll(oldWorkspace,dest));
 }
 if(hash(j.input)!==j.inputSha256)throw Error('原文摘要变化：'+j.title);
 if(j.pendingBundleSha256&&j.pendingBundleSha256!==bundleHash)throw Error('交接摘要变化');
 copyFileSync(bundle,join(j.workspace,'输入', 'NovelStudio-拆书交接包-v1.0.zip'));
 execFileSync('python',['-B','-c',`import sys,zipfile,pathlib; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert all(not n.startswith(('/','../')) and '/../' not in n and ':' not in n for n in z.namelist()); z.extractall(sys.argv[2])`,bundle,join(j.workspace,'工具')],{windowsHide:true});
 j.bundleSha256=bundleHash;delete j.pendingBundleSha256;
 const provider=j.engine==='codebuddy'?{engine:j.engine,model:j.model}:p.defaultEngine==='codebuddy'?{engine:p.defaultEngine,model:p.defaultModel}:{engine:'antigravity',model:'gemini-3.8-flash-low'};
 j.engine=provider.engine;j.model=provider.model;j.effort='low';j.resume=resume;j.nightBatchId=p.batchId;
 const recovery=`本次是用户授权的夜间三并发轮转，只处理本书《${j.title}》全部${j.volumes}卷，同版正文与ID只读，不派子代理/团队或其他书。工作区已确认存在：${j.workspace}，终端命令只在此处运行，禁止探索父目录/CLI缓存/正式资料。遇原生sandbox找不到cwd时可请求本书范围内的终端授权，由接收端路径门校验，不得扩大范围。
${resume?'从现有进度、阅读台账、对象笔记和卡片施工文件继续，保留有效成果及ID，不重新从头读，不反复打印旧卡目录。':'从同版正文分块核读，逐卷建立对象笔记和真实处理范围。'}
每次读150—250段，每500—1000段保存笔记和根进度。优先完成剩余原文与对象汇总，再集中写卡/分组标签、核对引用与关联、自检打包；不要反复制作阶段ZIP。不设任意卡数上限，也不为凑数造卡。公开资料可访问则先查并回同版核实，网络不可用记录后继续正文。完成整个指定范围后一次交最终包，不交阶段稿、不等用户确认。严禁自动填满processed_ranges冒充阅读。
已有正式入库卡的内容/ID保留不动；输入、模型、凭证、其他书和正式库只读或不可访问。保持九类适用标签和受限Markdown，content仍字符串、协议draft-0.1。32MiB仅是result.json上限，整包解压总量512MiB，不因ZIP超过32MiB丢原插图/封面。打包用未占用唯一文件名，最终施工输出/交付/result-完整版-时间戳.zip，实际ZIP生成后再计算ID/SHA，report.issues、研究记录、回执和completed状态必须一致。遇已知权限错误改用等价本书安全方法，不反复触发同一命令。真实额度耗尽或系统阻断就保存断点、原因与剩余范围，不伪报完成、不切换模型、不擅自新增CLI。上下文沿用CLI预设，不主动手动压缩。最终停止等接收方验收，不自行导入。`;
 const job={...j,recovery,dispatchAudit:audit};const jobPath=join(audit,j.work_id+'-job.json');writeFileSync(jobPath,JSON.stringify(job,null,2));writeFileSync(join(j.workspace,'派工任务.json'),JSON.stringify(job,null,2));jobs.push({workId:j.work_id,title:j.title,workspace:j.workspace,originalWorkspace:j.originalWorkspace,jobPath,audit});
}
p.lastDispatchPreparedAt=new Date().toISOString();writeFileSync(qp,JSON.stringify(q,null,2));console.log(JSON.stringify({jobs,batchId:p.batchId,audit}));
