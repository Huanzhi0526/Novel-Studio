import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {_electron} from 'playwright';
import {Store} from '../app/main/store.mjs';
import {WritingService} from '../app/main/writing.mjs';
import {ReferenceStoreV2} from '../app/kb-v2/store-v2.mjs';
await mkdir('.local/stability-20261115',{recursive:true});const root=await mkdtemp(resolve('.local/stability-20261115/maintenance-')),profile=join(root,'profile'),archive=join(root,'both.zip');
const store=new Store(join(profile,'library.sqlite')),writing=new WritingService(store),workId=writing.createWork({title:'备份合成书'}).id,doc=writing.list({workId}).docs[0];writing.save({id:doc.id,expectedRevision:0,text:'备份时原稿',boundary:true});store.close();
const ref=new ReferenceStoreV2(join(profile,'reference-v2.sqlite'));ref.ingestExportedBook({work:{work_id:'synthetic',title:'备份合成参考'},resources:[],structures:[],volumes:[{volume_id:'v1',revision_id:'r1',title:'卷',normalized_payload:{blocks:[{kind:'text',text:'合作任务'}]}}]},null);ref.close();
const app=await _electron.launch({executablePath:resolve(process.argv[2]),env:{...process.env,NOVEL_STUDIO_DATA_DIR:profile,NOVEL_STUDIO_TEST_HIDDEN:'1',NOVEL_STUDIO_NO_MODEL:'1',NOVEL_STUDIO_NO_AGY_FALLBACK:'1'}});const report={root,checks:[],errors:[]};
try{
 const page=await app.firstWindow();await page.getByRole('navigation',{name:'主导航'}).waitFor();page.on('pageerror',e=>report.errors.push(e.message));
 await app.evaluate(({dialog},archive)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:archive});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[archive]});dialog.showMessageBox=async()=>({response:1});},archive);
 const invoke=(method,args={})=>page.evaluate(async({method,args})=>{const r=await window.studio.invoke(method,args);if(!r.ok)throw new Error(JSON.stringify(r.error));return r.value;},{method,args});
 const initial=await invoke('assistant.get',{workId});await invoke('assistant.memory',{workId,text:'# 合成记忆\n备份ZIP外保留'});
 const saved=await invoke('backup.export');assert.equal(saved.filename,archive);report.checks.push('dual-database export via registered handler');
 const opened=await invoke('writing.open',{id:doc.id});await invoke('writing.stage',{id:doc.id,expectedRevision:opened.revision,text:'恢复前较新合成稿',boundary:true});await invoke('writing.save',{id:doc.id,expectedRevision:opened.revision,text:'恢复前较新合成稿',boundary:true});await invoke('reference.setHidden',{workId:'synthetic',hidden:true});
 const restored=await invoke('backup.restore');assert.equal(restored.referenceRestored,true);assert.equal((await invoke('writing.preview',{id:doc.id})).text,'备份时原稿');assert.equal((await invoke('reference.list')).works[0].deleted,null);report.checks.push('restore replaces both databases and reopens handles');
 assert.match((await invoke('assistant.get',{workId})).memory,/备份ZIP外保留/);assert.equal((await readFile(join(initial.workspace,'AGENTS.md'),'utf8')).includes('备份ZIP外保留'),true);report.checks.push('assistant memory remains outside database ZIP');
 const search=await invoke('search.query',{query:'合作任务',mode:'local',requestId:crypto.randomUUID()});assert.equal(search.degraded,true);report.checks.push('fresh read-only search worker after restore');
 assert.equal(report.errors.length,0);report.passed=true;
}finally{await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));await app.close();console.log(root);}
