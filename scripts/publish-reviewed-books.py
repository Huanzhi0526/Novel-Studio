from pathlib import Path
import json,hashlib,zipfile,shutil,sys
from datetime import datetime,timezone,timedelta
r=Path.cwd();audit=Path(sys.argv[1]).resolve();assert audit.is_relative_to(r/'.local');base=r/'拆书工作区'
report=json.loads((audit/'import-report.json').read_text(encoding='utf8'))
assert report.get('originalAndBodiesUnchanged') and not report.get('error')
review=json.loads((audit/'format-review.json').read_text(encoding='utf8'));assert all(b.get('deliveryStage')!='partial' for b in review),'不接收阶段交付'
queue_path=base/'派工队列.json';q=json.loads(queue_path.read_text(encoding='utf8'))
now=datetime.now(timezone(timedelta(hours=8))).isoformat(timespec='seconds')
dispatch=base/'Novel Studio 拆书派工';index=dispatch/'原文目录.md';index_text=index.read_text(encoding='utf-8-sig')
base_note='用户指定简验：受限Markdown及分组检索标签通过；协议及同版正文身份一致，隔离与正式导入通过。不审内容真实性、全文覆盖、证据或标签语义。'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,text):
 if p.exists():
  backup=audit/'publish-before'/p.relative_to(r);backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,backup)
 p.write_text(text,encoding='utf8')
for b,imported in zip(review,report['formal'],strict=True):
 job=next(j for j in q['jobs'] if j['work_id']==b['workId']);work=Path(b['workspace'])
 partial=b.get('deliveryStage')=='partial'
 note=base_note+(' Agent自报原派工尚未完成，本次为阶段入库，继续原任务，不标记整书完工。' if partial else '')
 label='已拆／阶段简验通过／阶段入库·继续施工' if partial else '已拆／已验收（格式标签简验）／已正式导入'
 accepted=audit/'accepted-packages'/b['workId']/'result.zip';accepted.parent.mkdir(parents=True,exist_ok=True)
 if not accepted.exists():shutil.copy2(b['filename'],accepted)
 assert sha(accepted)==b['sha256']
 with zipfile.ZipFile(accepted) as z:baseline=json.loads(z.read('result.json'))
 revisions=imported.get('cardRevisions')
 if revisions is None:
  assert imported['stats']['cardsUpdated']==0 and imported['stats']['cardsAdded']==len(baseline['cards'])
  revisions={c['card_id']:1 for c in baseline['cards']}
 job.update(baselinePackage=str(accepted),baselineSha256=b['sha256'],cardRevisions=revisions)
 if partial:
  local=work/'输入/已接收阶段'/('result-'+b['sha256'][:12]+'.zip');local.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(accepted,local)
  job['resume']=True
  prompt=Path(job['prompt']);text=prompt.read_text(encoding='utf8')
  text+=f'\n接收方已按仅格式/标签及导入安全接收本阶段卡片，未对内容作质量返工要求。你在进度.json里明确登记的原派工尚有剩余，请继续原任务至完成。已入库基线在 {local.relative_to(work).as_posix()}，原卡card_id必须沿用，保留所有已接收卡；必要内容修订及新卡另行交新package_id，正文版本不得改动。不要为回应接收而重做已完成成果，也不要把未完成范围假写为completed。\n'
  save(prompt,text)
 assert sha(Path(b['filename']))==b['sha256'];assert sha(Path(b['input']))==b['inputSha256']
 record=dict(result=Path(b['filename']).relative_to(work).as_posix(),sha256=b['sha256'],packageId=b['packageId'],status='已验收',checkedAt=now,reviewScope='仅格式和标签及导入安全',deliveryStage='partial' if partial else 'complete',source=[dict(file=b['input'],sha256=b['inputSha256'],scope=f"本次同版正文全部{b['volumes']}卷")],note=note,formalImport=dict(at=now,stats=imported['stats'],report=str(audit/'import-report.json')))
 marker=work/'验收状态.json';data=json.loads(marker.read_text(encoding='utf-8-sig')) if marker.exists() else {'work':b['title'],'packages':[]}
 if not any(p.get('sha256')==b['sha256'] and p.get('status')=='已验收' and p.get('formalImport',{}).get('report')==str(audit/'import-report.json') for p in data['packages']):data['packages'].append(record)
 save(marker,json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 save(work/'施工输出/交付/接收方格式验收与导入.md',f"# 接收方简验与正式导入\n\n{note}\n\n- 时间：{now}\n- 卡数：{b['count']}，适用类别格式与分组标签通过\n- 包ID：`{b['packageId']}`\n- ZIP SHA-256：`{b['sha256']}`\n- 新增正文版本：0\n- 重导：duplicate\n- 回执：`{audit/'import-report.json'}`\n- 备份：`{report['backup']['filename']}`\n")
 raw=Path(b['input']);save(raw.with_name(raw.name+'.派工状态.md'),f"# {b['title']}\n\n**{label}**\n\n{note}\n\n- 原文SHA-256：`{b['inputSha256']}`\n- 交付SHA-256：`{b['sha256']}`\n- 范围：{b['volumes']}卷\n- {now}\n")
 with zipfile.ZipFile(raw) as z:inp=json.loads(z.read('result.json'))
 for shared in (dispatch/'原文/已入库同版正文').glob('*.zip'):
  with zipfile.ZipFile(shared) as z:other=json.loads(z.read('result.json'))
  if other['work']['work_id']!=b['workId']:continue
  assert sorted((v['volume_id'],v['revision_id']) for v in other['volumes'])==sorted((v['volume_id'],v['revision_id']) for v in inp['volumes'])
  save(shared.with_name(shared.name+'.派工状态.md'),f"# {b['title']}\n\n**{label}**\n\n实际施工输入为 `{raw}`，与本文件的作品、卷、正文版本身份一致。\n\n- 本文件 SHA-256：`{sha(shared)}`\n- 结果 SHA-256：`{b['sha256']}`\n- {note}\n- {now}\n")
  relative=shared.relative_to(dispatch).as_posix();lines=index_text.splitlines()
  for i,line in enumerate(lines):
   if f'(<{relative}>)' in line:lines[i]=line.split(f'(<{relative}>)')[0]+f'(<{relative}>) · **{label}** · {b["volumes"]} 卷'
  index_text='\n'.join(lines)+'\n'
  break
 job.update(state='retry' if partial else 'completed',stageAcceptedAt=now,reviewScope=note,reviewSha256=b['sha256'],cards=b['count'],importReport=str(audit/'import-report.json'),lastIssue=None)
 if not partial:job['completedAt']=now
 if not partial and b['workId'] not in q['completedWorkIds']:q['completedWorkIds'].append(b['workId'])
save(index,index_text)
q['lastCycleAt']=now;q['automationPaused']=q.get('automationPaused',False)
save(queue_path,json.dumps(q,ensure_ascii=False,indent=2))
print(f'本批{len(review)}部{sum(b["count"] for b in review)}卡已同步；累计{sum(j["state"]=="completed" for j in q["jobs"])}部完成。')



