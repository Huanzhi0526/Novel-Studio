import assert from 'node:assert/strict';
import {_electron} from 'playwright';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {Store} from '../app/main/store.mjs';
import {WritingService} from '../app/main/writing.mjs';
import {AssistantService} from '../app/main/assistant.mjs';
const root=resolve('.local/ux-acceptance-'+Date.now());await mkdir(root,{recursive:true});const profile=join(root,'profile');
const store=new Store(join(profile,'library.sqlite')),writing=new WritingService(store),workId=writing.createWork({title:'独立合并验收'}).id;
const docId=writing.list({workId}).docs.find(d=>d.kind==='chapter').id;
const saved=writing.save({id:docId,expectedRevision:writing.doc(docId).revision,text:'甲乙丙丁戊己'});writing.addMark({id:docId,expectedRevision:saved.revision,start:2,end:4,type:'key',note:'验收'});
const other=writing.createWork({title:'另一部合成书'}).id,assistant=new AssistantService(writing,null,profile);
for(const [id,opening] of [[workId,'甲书专属开场'],[other,'乙书专属开场']]){const e=assistant.entry(id);e.messages=[{role:'user',text:opening},{role:'assistant',text:'共同结束语'}];assistant.saveHistory(e);}
assistant.close();store.close();
const env={...process.env,NOVEL_STUDIO_DATA_DIR:profile,NOVEL_STUDIO_NO_MODEL:'1',NOVEL_STUDIO_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('.')],env});
try{const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
const invoke=(method,args)=>page.evaluate(async({method,args})=>{const r=await window.studio.invoke(method,args);if(!r.ok)throw new Error(r.error.message);return r.value;},{method,args});
await page.getByRole('button',{name:'独立合并验收',exact:true}).click();await page.getByRole('button',{name:'标记',exact:true}).click();await page.getByRole('button',{name:'删除标记',exact:true}).click();
await page.locator('.editor-manuscript .cm-content').click();await page.keyboard.press('Control+Home');await page.keyboard.insertText('新增');
await page.locator('.mark-undo-banner').getByRole('button',{name:'撤销',exact:true}).click();await page.getByText('正文已经改变，未恢复旧位置的标记；请重新选择文字创建标记。',{exact:true}).waitFor();
const doc=await invoke('writing.open',{id:docId});assert.equal(doc.marks.length,0);assert.ok(doc.text.startsWith('新增'));
await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'创作助手',exact:true}).click();const region=page.getByRole('region',{name:'创作助手'}).filter({visible:true});await region.getByLabel('助手作品').selectOption(workId);await region.getByText('甲书专属开场',{exact:true}).waitFor();
await region.getByLabel('助手作品').selectOption(other);await region.getByText('乙书专属开场',{exact:true}).waitFor();assert.equal(await region.getByText('甲书专属开场',{exact:true}).count(),0);
await region.getByLabel('助手作品').selectOption(workId);await region.getByText('甲书专属开场',{exact:true}).waitFor();
await region.getByRole('button',{name:'更多助手操作'}).click();await page.getByRole('menuitem',{name:'模型与记忆',exact:true}).click();const memory=region.getByLabel('本书助手记忆');await memory.waitFor();
await app.evaluate(({ipcMain})=>{const orig=ipcMain._invokeHandlers.get('novel:invoke');let calls=0;ipcMain.removeHandler('novel:invoke');ipcMain.handle('novel:invoke',async(event,method,args)=>{const r=await orig(event,method,args);if(method!=='assistant.get')return r;calls++;if(calls===1)return new Promise(resolve=>{globalThis.__releaseOld=()=>resolve({...r,value:{...r.value,memory:'OLD_RESPONSE'}});});return {...r,value:{...r.value,memory:'NEW_RESPONSE'}};});});
await region.getByRole('button',{name:'载入最新记忆',exact:true}).click();await region.getByRole('button',{name:'载入最新记忆',exact:true}).click();await page.waitForTimeout(150);
assert.equal(await memory.inputValue(),'NEW_RESPONSE');await app.evaluate(()=>globalThis.__releaseOld());await page.waitForTimeout(150);assert.equal(await memory.inputValue(),'NEW_RESPONSE');
await page.evaluate(()=>{const prefs=JSON.parse(localStorage.getItem('studio.preferences.v1')??'{}');localStorage.setItem('studio.preferences.v1',JSON.stringify({...prefs,appearance:'dark'}));});
await page.reload();await page.locator('.studio[data-appearance="dark"]').waitFor();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'创作助手',exact:true}).click();
await page.getByLabel('助手作品').selectOption(workId);await page.getByText('甲书专属开场',{exact:true}).waitFor();
await page.setViewportSize({width:980,height:760});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
const png=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.showInactive();try{await w.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const image=await w.webContents.capturePage(undefined,{stayAwake:true});return image.toPNG().toString('base64');}finally{w.hide();}});
await writeFile(join(root,'dark-narrow.png'),Buffer.from(png,'base64'));
await writeFile(join(root,'report.json'),JSON.stringify({passed:true,staleRefreshDiscarded:true,changedTextUndoGuard:true,sameTailCrossBookMessages:true}));console.log(root);
}finally{await app.close();}

