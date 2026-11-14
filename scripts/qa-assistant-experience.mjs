import {_electron} from 'playwright';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Store} from '../app/main/store.mjs';
import {WritingService} from '../app/main/writing.mjs';
import {AssistantService} from '../app/main/assistant.mjs';
const root=resolve('.local/assistant-027/experience-'+Date.now());await mkdir(root,{recursive:true});
const profile=join(root,'profile'),store=new Store(join(profile,'library.sqlite')),writing=new WritingService(store);
const workId=writing.createWork({title:'纸桥与远行（界面验收）'}).id;
const service=new AssistantService(writing,null,profile);const e=service.entry(workId);
e.messages=[{role:'user',text:'这里想给男主设置一个困境，同时推进他和女主的关系。请给我几个有因果联系的方案。'},{role:'assistant',text:'## 先把两条成长线放进同一个选择\n\n这场任务的核心可以是：**他必须学会信任她，才能完成原本打算独自完成的任务。** 好感的变化来自行动，而不是任务结算后的奖励。\n\n### 方案一：有代价的合作\n\n- **任务压力**：纸桥正在坍塌，两人必须在天黑前完成修复。\n- **人物选择**：男主放弃独占成果，让女主判断关键的承重点。\n- **关系推进**：她第一次发现，自己的判断被认真对待。\n\n> 先铺垫一次他的误判，让这次信任成为有分量的改变。\n\n### 方案二：彼此看见的弱点\n\n男主熟悉操作，女主熟悉结构。一次尝试失败后，他们交换各自隐瞒的困难，重新分工。\n\n下一步可以讨论：哪一种更贴合本书的主旨，以及需要提前埋下什么伏笔。'}];service.saveHistory(e);service.close();store.close();
const env={...process.env,NOVEL_STUDIO_DATA_DIR:profile,NOVEL_STUDIO_TEST_HIDDEN:'1',NOVEL_STUDIO_NO_MODEL:'1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:resolve(process.argv[2]??'node_modules/electron/dist/electron.exe'),args:process.argv[2]?[]:[resolve('.')],env});const errors=[];
async function capture(name){const bytes=await app.evaluate(async({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.showInactive();try{await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await new Promise(resolve=>setTimeout(resolve,150));window.webContents.invalidate();const image=await window.webContents.capturePage(undefined,{stayAwake:true});return image.toPNG().toString('base64');}finally{window.hide();}});await writeFile(join(root,name),Buffer.from(bytes,'base64'));}
try{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.getByRole('button',{name:'创作助手',exact:true}).click();const main=page.getByRole('region',{name:'创作助手'}).filter({visible:true});
await main.getByLabel('助手作品').selectOption(workId);await main.getByText('先把两条成长线放进同一个选择',{exact:true}).waitFor();
await main.getByLabel('助手问题').fill('继续完善第二种方案。');await main.locator('.assistant-scroll').evaluate(e=>{e.scrollTop=0;});await capture('full.png');
await page.getByRole('button',{name:'原创写作',exact:true}).click();await page.getByRole('button',{name:'纸桥与远行（界面验收）',exact:true}).click();
await page.getByRole('group',{name:'写作资料速查'}).getByRole('button',{name:'助手',exact:true}).click();
const side=page.locator('.assistant-compact');await side.getByLabel('助手问题').waitFor();assert.equal(await side.getByLabel('助手问题').inputValue(),'继续完善第二种方案。');await side.locator('.assistant-scroll').evaluate(e=>{e.scrollTop=0;});await capture('sidebar.png');
await side.getByLabel('助手问题').fill('侧栏中继续讨论，草稿应该保留。');await side.getByRole('button',{name:'关闭助手侧栏'}).click();await page.getByRole('button',{name:'创作助手',exact:true}).click();assert.equal(await main.getByLabel('助手问题').inputValue(),'侧栏中继续讨论，草稿应该保留。');
await page.setViewportSize({width:980,height:760});await capture('narrow.png');
assert.deepEqual(errors,[]);await writeFile(join(root,'report.json'),JSON.stringify({passed:true,sharedDraft:true,pageErrors:errors},null,2));console.log(root);
}finally{await app.close();}
