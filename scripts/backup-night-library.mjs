import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Store} from '../app/main/store.mjs';
import {BackupService} from '../app/main/backup.mjs';
const root=resolve(import.meta.dirname,'..'),audit=resolve(process.argv[2]??'.local/overnight-dispatch/final');
assert.ok(relative(root,audit)&&!relative(root,audit).startsWith('..'));
const apps=execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-Process 'Novel Studio' -ErrorAction SilentlyContinue).Count"],{encoding:'utf8'}).trim();
assert.equal(apps,'0','先正常关闭正式应用，不强退');await mkdir(audit,{recursive:true});
const store=new Store('C:/Users/78828/AppData/Local/Novel Studio/library.sqlite');
try{
 assert.equal(store.db.prepare('PRAGMA quick_check').get().quick_check,'ok');
 const backup=await new BackupService(store).export(join(audit,'final-library.zip'));
 const receipt={...backup,databaseSha256:backup.sha256,sha256:createHash('sha256').update(await readFile(backup.filename)).digest('hex'),at:new Date().toISOString(),cards:store.db.prepare('SELECT count(*) n FROM reference_cards').get().n};
 await writeFile(join(audit,'final-backup.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{store.close();}
