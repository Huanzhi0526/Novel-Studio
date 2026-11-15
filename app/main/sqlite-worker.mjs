import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {WritingService} from './writing.mjs';
let db;
try {
  db=new DatabaseSync(workerData.filename,{readOnly:true});
  db.exec('PRAGMA trusted_schema=OFF');
  let result=true;
  if(workerData.method==='snapshot')db.prepare('VACUUM INTO ?').run(workerData.target);
  else if(workerData.method==='verify'){
    const signature=JSON.stringify(db.prepare('SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name').all());
    if(db.prepare('PRAGMA user_version').get().user_version!==workerData.version||signature!==workerData.signature)throw Object.assign(new Error('备份资料库版本或表结构与当前应用不兼容'),{code:'BACKUP_SCHEMA'});
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').get())throw Object.assign(new Error('备份资料库完整性校验未通过'),{code:'BACKUP_INTEGRITY'});
  }else if(workerData.method==='rows')result=db.prepare(workerData.sql).all(...workerData.params);
  else if(workerData.method==='writingSearch')result=new WritingService({db}).searchWork(workerData.args);
  else throw new Error('Unknown read operation');
  db.close();db=null;parentPort.postMessage({result});
}catch(error){db?.close();parentPort.postMessage({error:{code:error.code,message:error.message}});}
