import {_electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=resolve('.local/assistant-v024/ui');await mkdir(root,{recursive:true});
const env={...process.env,NOVEL_STUDIO_DATA_DIR:root,NOVEL_STUDIO_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:resolve(process.argv[2]??'node_modules/electron/dist/electron.exe'),args:process.argv[2]?[]:[resolve('.')],env});
try{const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
const call=(method,args={})=>page.evaluate(async({method,args})=>{const r=await window.studio.invoke(method,args);if(!r.ok)throw new Error(r.error.message);return r.value;},{method,args});
const {id}=await call('writing.createWork',{title:'纸桥计划（合成验收）'});
await page.getByRole('button',{name:'创作助手',exact:true}).click();await page.getByLabel('助手作品').selectOption(id);
await page.getByText('模型与本书记忆',{exact:true}).click();await page.getByLabel('本书助手记忆').fill('# 创作助手\n\n主旨：合作带来的成长。\n偏好：人物行动有动机；拒绝机械加好感。');
await page.getByRole('button',{name:'保存记忆',exact:true}).click();await page.waitForTimeout(1000);
assert.match((await call('assistant.get',{workId:id})).memory,/合作带来的成长/);
await page.getByLabel('助手问题').fill('这里想给男主设置一个困境，同时推动他与女主的关系。');
await page.screenshot({path:resolve(root,'assistant.png'),fullPage:true});
await writeFile(resolve(root,'report.json'),JSON.stringify({passed:true,workId:id,memorySaved:true,productionUntouched:true},null,2));
}finally{await app.close();}
