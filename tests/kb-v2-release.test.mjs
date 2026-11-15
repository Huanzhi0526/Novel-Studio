import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Store } from '../app/main/store.mjs';
import { BackupService } from '../app/main/backup.mjs';
import { ReferenceStoreV2 } from '../app/kb-v2/store-v2.mjs';
import { RetrievalEngineV2 } from '../app/kb-v2/retrieval-v2.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-release-'));
  const writing = new Store(join(dir, 'library.sqlite'));
  const reference = new ReferenceStoreV2(join(dir, 'reference-v2.sqlite'));
  writing.db.prepare('INSERT INTO original_works VALUES(?,?,?)').run('own', 'before', 1);
  reference.db.prepare('INSERT INTO works(work_id,title) VALUES(?,?)').run('ref', 'reference-before');
  t.after(() => { writing.close(); reference.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, writing, reference, service: new BackupService(writing, reference) };
}

test('v2 backup restores both independent databases; old writing backups leave v2 intact', async t => {
  const { dir, writing, reference, service } = fixture(t);
  const archive = join(dir, 'both.zip');
  await service.export(archive);
  writing.db.exec("UPDATE original_works SET title='after'");
  reference.db.exec("UPDATE works SET title='reference-after'");
  const result = await service.restore(archive);
  assert.equal(result.referenceRestored, true);
  assert.equal(writing.db.prepare('SELECT title FROM original_works').get().title, 'before');
  assert.equal(reference.db.prepare('SELECT title FROM works').get().title, 'reference-before');
  const old = join(dir, 'legacy.zip');
  await new BackupService(writing).export(old);
  reference.db.exec("UPDATE works SET title='keep-v2'");
  assert.equal((await service.restore(old)).referenceRestored, false);
  assert.equal(reference.db.prepare('SELECT title FROM works').get().title, 'keep-v2');
});

test('v2 restore rolls both databases back when reopening the second database fails', async t => {
  const { dir, writing, reference, service } = fixture(t);
  const archive = join(dir, 'both.zip');
  await service.export(archive);
  writing.db.exec("UPDATE original_works SET title='preserve-writing'");
  reference.db.exec("UPDATE works SET title='preserve-reference'");
  const open = reference.open.bind(reference);
  let calls = 0;
  reference.open = () => { if (++calls === 1) throw new Error('injected reopen failure'); return open(); };
  await assert.rejects(service.restore(archive), /injected reopen/);
  assert.equal(writing.db.prepare('SELECT title FROM original_works').get().title, 'preserve-writing');
  assert.equal(reference.db.prepare('SELECT title FROM works').get().title, 'preserve-reference');
});

test('configured v2 API preserves retrieval output budgets and disableThinking', async () => {
  const engine = new RetrievalEngineV2({});
  let captured;
  engine.config = { complete: async (...args) => { captured = args; return 'ok'; } };
  const build = () => [];
  const signal = new AbortController().signal;
  const options = { maxTokens: 2800, disableThinking: true, timeoutMs: 90000 };
  assert.equal(await engine.setting('complete', build, signal, options), 'ok');
  assert.deepEqual(captured, [build, signal, options]);
});


test('second database replacement failure rolls back the first and preserves the pair',async t=>{
 const {renameSync}=await import('node:fs');
 const {dir,writing,reference}=fixture(t);
 const standard=new BackupService(writing,reference),archive=join(dir,'replace-fault.zip');await standard.export(archive);
 writing.db.exec("UPDATE original_works SET title='new manuscript'");reference.db.exec("UPDATE works SET title='new reference'");
 let calls=0;
 const faulty=new BackupService(writing,reference,{replace:(a,b)=>{if(++calls===2)throw Object.assign(new Error('injected second replacement busy'),{code:'EBUSY'});return renameSync(a,b);}});
 await assert.rejects(faulty.restore(archive),{code:'EBUSY'});
 assert.equal(writing.db.prepare('SELECT title FROM original_works').get().title,'new manuscript');assert.equal(reference.db.prepare('SELECT title FROM works').get().title,'new reference');
 assert.equal(writing.db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.equal(reference.db.prepare('PRAGMA quick_check').get().quick_check,'ok');
});


test('disk-full snapshot failure leaves live databases untouched',async t=>{
 const {sqliteTasks}=await import('../app/main/sqlite-tasks.mjs');
 const {dir,writing,reference,service}=fixture(t);const original=sqliteTasks.run;
 sqliteTasks.run=()=>Promise.reject(Object.assign(new Error('injected disk full'),{code:'ENOSPC'}));
 try{await assert.rejects(service.export(join(dir,'full.zip')),{code:'ENOSPC'});}finally{sqliteTasks.run=original;}
 assert.equal(writing.db.prepare('SELECT title FROM original_works').get().title,'before');assert.equal(reference.db.prepare('SELECT title FROM works').get().title,'reference-before');
});

test('rollback can rename verified snapshots when copying fails with disk full',async t=>{
 const {renameSync}=await import('node:fs');const {dir,writing,reference,service}=fixture(t);const archive=join(dir,'disk-full-rollback.zip');await service.export(archive);
 writing.db.exec("UPDATE original_works SET title='new manuscript'");reference.db.exec("UPDATE works SET title='new reference'");let calls=0;
 const faulty=new BackupService(writing,reference,{replace:(a,b)=>{if(++calls===2)throw Object.assign(new Error('second replacement busy'),{code:'EBUSY'});return renameSync(a,b);},copy:async()=>{throw Object.assign(new Error('injected disk full'),{code:'ENOSPC'});}});
 await assert.rejects(faulty.restore(archive),{code:'EBUSY'});assert.equal(writing.db.prepare('SELECT title FROM original_works').get().title,'new manuscript');assert.equal(reference.db.prepare('SELECT title FROM works').get().title,'new reference');
 assert.equal(writing.db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.equal(reference.db.prepare('PRAGMA quick_check').get().quick_check,'ok');
});
