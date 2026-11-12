import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../app/main/store.mjs';
import {ReferenceService,ImportService} from '../app/main/reference.mjs';
import {BackupService} from '../app/main/backup.mjs';
import {readResultPackage} from '../app/main/protocol.mjs';
assert.ok(process.argv[2],'需指定验收回执目录');
const audit=resolve(process.argv[2]);
const queue=JSON.parse(await readFile('拆书工作区/派工队列.json','utf8')); 
const data='C:/Users/78828/AppData/Local/Novel Studio';
const books=JSON.parse(await readFile(join(audit,'format-review.json'),'utf8'));
const packages=[];
for(const b of books){
 assert.equal(createHash('sha256').update(await readFile(b.filename)).digest('hex'),b.sha256);
 assert.deepEqual(b.errors,[]); packages.push({...b,result:(await readResultPackage(b.filename)).result});
}
const plain=x=>JSON.parse(JSON.stringify(x));
function snapshot(db){
 const names=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND (name LIKE 'original_%' OR name IN ('reference_volumes','reference_blocks','reference_revisions','reference_structures','reference_assets')) ORDER BY name").all();
 return Object.fromEntries(names.map(({name})=>{const h=createHash('sha256');let n=0;for(const row of db.prepare(`SELECT * FROM "${name}" ORDER BY ${name==='reference_structures'?'volume_id,revision_id,structure_id':'rowid'}`).iterate()){h.update(JSON.stringify(row));n++;}return[name,{count:n,sha256:h.digest('hex')}];}));
}
function state(db){return plain(db.prepare('SELECT work_id,deleted FROM reference_works ORDER BY work_id').all());}
function outside(db){
 const ids=JSON.stringify(packages.map(p=>p.workId));
 const cards=db.prepare('SELECT * FROM reference_cards WHERE work_id NOT IN (SELECT value FROM json_each(?)) ORDER BY id').all(ids);
 const evidence=db.prepare('SELECT e.* FROM reference_evidence e JOIN reference_cards c ON c.id=e.card_row WHERE c.work_id NOT IN (SELECT value FROM json_each(?)) ORDER BY e.card_row,e.position').all(ids);
 return createHash('sha256').update(JSON.stringify({cards,evidence})).digest('hex');
}
async function preflight(store){
 const ref=new ReferenceService(store);
 for(const p of packages){
  assert.ok(store.db.prepare('SELECT * FROM reference_works WHERE work_id=?').get(p.workId));
  const current=store.db.prepare('SELECT card_id FROM reference_cards WHERE work_id=?').all(p.workId);
  if(current.length){
   const job=queue.jobs.find(j=>j.work_id===p.workId);assert.ok(job?.baselinePackage,'现卡需有已接收基线，不覆盖未知手改');
   assert.equal(createHash('sha256').update(await readFile(job.baselinePackage)).digest('hex'),job.baselineSha256);
   const old=(await readResultPackage(job.baselinePackage)).result;
   for(const row of current){
    const before=old.cards.find(c=>c.card_id===row.card_id);assert.ok(before);assert.ok(p.result.cards.some(c=>c.card_id===row.card_id),'新版漏掉已接收卡片');
    const actual=ref.getCard({workId:p.workId,cardId:row.card_id});assert.equal(actual.revision,job.cardRevisions?.[row.card_id],'拒绝覆盖接收后手改');
    for(const k of ['title','content','category','claim_type','aliases','related_card_ids'])assert.deepEqual(plain(actual[k]??[]),before[k]??[]);
    assert.deepEqual(actual.evidence.map(({volume_id,revision_id,start,end})=>({volume_id,revision_id,start,end})),before.evidence);
   }
  }
  for(const v of p.result.volumes){
   const rows=store.db.prepare('SELECT kind,text,asset_sha256,note_target FROM reference_blocks WHERE volume_id=? AND revision_id=? ORDER BY ordinal').all(v.volume_id,v.revision_id);
   assert.deepEqual(plain(rows),v.normalized_payload.blocks,'Body version mismatch');
  }
 }
}
async function run(store){
 await preflight(store);const out=[];const imports=new ImportService(new ReferenceService(store));
 for(const p of packages){
  const review=await imports.inspect(p.filename);assert.equal(review.status,'review_ready');
  const outcome=imports.commit({batchId:review.id,resolutions:Object.fromEntries(review.conflicts.map(c=>[c.current.card_id,{mode:'accept'}]))});
  assert.equal(outcome.stats.revisionsAdded,0);
  assert.equal((await imports.inspect(p.filename)).status,'duplicate');
  for(const c of p.result.cards){const actual=new ReferenceService(store).getCard({workId:p.workId,cardId:c.card_id});assert.equal(actual.content,c.content);assert.equal(actual.title,c.title);assert.equal(actual.evidence.length,c.evidence.length);}
  out.push({title:p.title,workId:p.workId,packageId:p.packageId,sha256:p.sha256,...outcome,duplicate:'duplicate',cardRevisions:Object.fromEntries(p.result.cards.map(c=>[c.card_id,new ReferenceService(store).getCard({workId:p.workId,cardId:c.card_id}).revision]))});
 }
 assert.equal(store.db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.equal(store.db.prepare('PRAGMA foreign_key_check').get(),undefined);return out;
}
if(process.argv.includes('--check-baseline')){
 const filename=process.argv[process.argv.indexOf('--check-baseline')+1];assert.ok(filename);
 const db=new DatabaseSync(filename,{readOnly:true});try{await preflight({db});console.log('接收基线及修订号预检通过');}finally{db.close();}
 process.exit(0);
}
const report={scope:'按用户要求仅验格式与标签；检查导入兼容、正文身份及数据安全，不复审内容',at:new Date().toISOString()};let store;
try{
 const processes=execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-Process 'Novel Studio' -ErrorAction SilentlyContinue).Count"],{encoding:'utf8'}).trim();assert.equal(processes,'0','Close formal app normally before importing');
 store=new Store(join(data,'library.sqlite'));await preflight(store);
 report.outsideBefore=outside(store.db);report.before=snapshot(store.db);report.workState=state(store.db);report.backup=await new BackupService(store).export(join(audit,'before-import.zip'));
 const rehearsal=join(audit,'rehearsal');await mkdir(rehearsal);
 execFileSync('python',['-B','-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; open(sys.argv[2],"xb").write(z.read("library.sqlite"))',report.backup.filename,join(rehearsal,'library.sqlite')]);
 const isolated=new Store(join(rehearsal,'library.sqlite'));
 try{assert.deepEqual(snapshot(isolated.db),report.before);report.rehearsal=await run(isolated);assert.deepEqual(snapshot(isolated.db),report.before);assert.deepEqual(state(isolated.db),report.workState);}finally{isolated.close();}
 assert.deepEqual(snapshot(store.db),report.before);report.formal=await run(store);
 report.after=snapshot(store.db);assert.deepEqual(report.after,report.before);assert.deepEqual(state(store.db),report.workState);
 report.counts=Object.fromEntries(['reference_works','reference_volumes','reference_cards'].map(t=>[t,store.db.prepare(`SELECT count(*) n FROM ${t}`).get().n]));
 assert.equal(outside(store.db),report.outsideBefore);report.originalAndBodiesUnchanged=true;
 console.log(JSON.stringify({backup:report.backup,formal:report.formal,counts:report.counts},null,2));
}catch(e){report.error=String(e);throw e;}finally{store?.close();await writeFile(join(audit,'import-report.json'),JSON.stringify(report,null,2));}
