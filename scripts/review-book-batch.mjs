import {parseBookProgress} from './book-agent-prompt.mjs';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import {readResultPackage} from '../app/main/protocol.mjs';
assert.ok(process.argv[2],'指定审计目录'); const audit=resolve(process.argv[2]);
const queue=JSON.parse(await readFile('拆书工作区/派工队列.json','utf8'));
const report=[];
for(const job of queue.jobs.filter(j=>queue.overnight?.batchWorkIds?.includes(j.work_id)&&j.state!=='completed')){
 const progress=parseBookProgress(await readFile(join(job.workspace,'进度.json'),'utf8').catch(()=>'{}'));
 if(progress.phase!=='completed')continue;
 if(job.state==='awaiting_import'&&job.reviewReport){const previous=JSON.parse(await readFile(job.reviewReport,'utf8')).find(b=>b.workId===job.work_id);assert.ok(previous);assert.equal(createHash('sha256').update(await readFile(previous.filename)).digest('hex'),previous.sha256);report.push(previous);continue;}
 const folder=join(job.workspace,'施工输出/交付');
 const names=(await readdir(folder)).filter(n=>/^result(?:-.+)?\.zip$/u.test(n));
 const files=await Promise.all(names.map(async n=>({filename:join(folder,n),mtime:(await stat(join(folder,n))).mtimeMs})));
 files.sort((a,b)=>b.mtime-a.mtime);assert.ok(files.length,'无完整交付包');
 const filename=files[0].filename;
 const {result,warnings}=await readResultPackage(filename);
 const input=(await readResultPackage(job.input)).result;
 assert.equal(result.work.work_id,job.work_id);
 assert.ok(isDeepStrictEqual(result.volumes.toSorted((a,b)=>a.volume_id.localeCompare(b.volume_id)),input.volumes.toSorted((a,b)=>a.volume_id.localeCompare(b.volume_id))),'正文身份或内容改变');
 const sort=a=>a.toSorted((a,b)=>(a.volume_id+a.structure_id).localeCompare(b.volume_id+b.structure_id));
 assert.ok(isDeepStrictEqual(sort(result.structures),sort(input.structures)),'目录改变');
 assert.deepEqual(result.resources,input.resources);
 assert.ok(result.cards.length);
 const errors=[];
 for(const c of result.cards){
  const tree=unified().use(remarkParse).parse(c.content);let tags=false,groups=0;
  const walk=n=>{if(['html','image','link','code','inlineCode','table','delete'].includes(n.type))errors.push({card:c.card_id,error:n.type});if(n.type==='heading'&&![2,3].includes(n.depth))errors.push({card:c.card_id,error:'heading-depth'});for(const x of n.children??[])walk(x);};walk(tree);
  for(const n of tree.children){if(n.type==='heading')tags=n.children.every(x=>x.type==='text')&&n.children.map(x=>x.value).join('').trim()==='检索标签';if(tags&&n.type==='list'&&!n.ordered)for(const item of n.children){const p=item.children[0];if(item.children.length===1&&p.type==='paragraph'&&p.children.every(x=>x.type==='text')&&/^([^｜\n]{1,20})｜([^\n]+)$/u.test(p.children.map(x=>x.value).join('').trim()))groups++;}}
  if(!groups)errors.push({card:c.card_id,error:'missing-grouped-tags'});
 }
 report.push({workId:job.work_id,title:job.title,filename,sha256:createHash('sha256').update(await readFile(filename)).digest('hex'),packageId:result.package_id,count:result.cards.length,volumes:result.volumes.length,warnings,errors,input:job.input,inputSha256:job.inputSha256,workspace:job.workspace,categories:result.cards.reduce((o,c)=>(o[c.category]=(o[c.category]??0)+1,o),{}),scope:'仅格式、标签、协议及同版导入安全；不审内容语义'});
}
await writeFile(join(audit,'format-review.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(({title,count,sha256,errors,warnings})=>({title,count,sha256,errors,warnings})),null,2));







