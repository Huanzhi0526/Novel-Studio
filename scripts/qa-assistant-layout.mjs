import { _electron } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Store } from '../app/main/store.mjs';
import { WritingService } from '../app/main/writing.mjs';
import { AssistantService } from '../app/main/assistant.mjs';

const root = resolve('.local/ux-layout-029/qa-' + Date.now());
await mkdir(root, { recursive: true });
const profile = join(root, 'profile');
const store = new Store(join(profile, 'library.sqlite'));
const writing = new WritingService(store);
const workId = writing.createWork({ title: '纸桥与远行（界面验收）' }).id;
const service = new AssistantService(writing, null, profile);
const e = service.entry(workId);
e.messages = [
  { role: 'user', text: '这里想给男主设置一个困境，同时推进他和女主的关系。请给我几个有因果联系的方案。' },
  { role: 'assistant', text: '## 先把两条成长线放进同一个选择\n\n这场任务的核心可以是：**他必须学会信任她，才能完成原本打算独自完成的任务。** 好感的变化来自行动，而不是任务结算后的奖励。\n\n### 方案一：有代价的合作\n\n- **任务压力**：纸桥正在坍塌，两人必须在天黑前完成修复。\n- **人物选择**：男主放弃独占成果，让女主判断关键的承重点。\n- **关系推进**：她第一次发现，自己的判断被认真对待。\n\n> 先铺垫一次他的误判，让这次信任成为有分量的改变。\n\n### 方案二：彼此看见的弱点\n\n男主熟悉操作，女主熟悉结构。一次尝试失败后，他们交换各自隐瞒的困难，重新分工。\n\n下一步可以讨论：哪一种更贴合本书的主旨，以及需要提前埋下什么伏笔。' }
];
service.saveHistory(e);
service.close();
store.close();

const env = { ...process.env, NOVEL_STUDIO_DATA_DIR: profile, NOVEL_STUDIO_TEST_HIDDEN: '1', NOVEL_STUDIO_NO_MODEL: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  executablePath: resolve(process.argv[2] ?? 'node_modules/electron/dist/electron.exe'),
  args: process.argv[2] ? [] : [resolve('.')],
  env
});
const errors = [];
try {
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.webContents.setBackgroundThrottling(false); window.showInactive(); });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.getByRole('button', { name: '创作助手', exact: true }).click();
  const main = page.getByRole('region', { name: '创作助手' }).filter({ visible: true });
  await main.getByLabel('助手作品').selectOption(workId);
  await main.getByText('先把两条成长线放进同一个选择', { exact: true }).waitFor();
  const measurements = [];
  for (const width of [1800, 1200, 900]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await main.evaluate(el => {
      const scroll = el.querySelector('.assistant-scroll');
      const assistant = el.querySelector('.message-assistant').getBoundingClientRect();
      const user = el.querySelector('.message-user').getBoundingClientRect();
      const rect = scroll.getBoundingClientRect();
      return { available: scroll.clientWidth, width: assistant.width, left: assistant.left - rect.left,
        right: rect.right - assistant.right, userRight: user.right, assistantRight: assistant.right,
        overflow: el.scrollWidth - el.clientWidth };
    });
    assert.ok(box.width / box.available > .83, JSON.stringify(box));
    assert.ok(box.left < 55 && box.right < 70, JSON.stringify(box));
    assert.ok(Math.abs(box.userRight - box.assistantRight) < 2);
    assert.ok(box.overflow <= 1);
    measurements.push({ viewport: width, ...box });
    console.log("Chat width", width, box.width);
  }
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.getByRole('button', { name: '原创写作', exact: true }).click();
  await page.getByRole('button', { name: '纸桥与远行（界面验收）', exact: true }).click();
  const editor = page.locator('.cm-content[contenteditable=true]');
  await editor.fill('拖动边界时需要保护的合成正文。');
  await page.getByRole('group', { name: '写作资料速查' }).getByRole('button', { name: '助手', exact: true }).click();
  const side = page.locator('.assistant-compact');
  await side.getByLabel('助手问题').fill('拖动后保留的草稿。');
  const divider = page.getByRole('separator', { name: '调整右侧栏宽度' });
  const drawer = page.locator('.writing-drawer');
  const initial = (await drawer.boundingBox()).width;
  console.log("Sidebar initial", initial);
  async function drag(dx) {
    const box = await divider.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + 200, { steps: 8 });
    await page.mouse.up();
  }
  await drag(-240);
  const expanded = (await drawer.boundingBox()).width;
  assert.ok(Math.abs(expanded - initial - 240) <= 2, `${initial} => ${expanded}`);
  await drag(110);
  const saved = (await drawer.boundingBox()).width;
  console.log("Sidebar dragged", expanded, saved);
  assert.ok(Math.abs(saved - expanded + 110) <= 2);
  assert.equal(await side.getByLabel('助手问题').inputValue(), '拖动后保留的草稿。');
  assert.equal(await editor.innerText(), '拖动边界时需要保护的合成正文。');
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  assert.ok(Math.abs((await drawer.boundingBox()).width - saved - 10) <= 2);
  await page.keyboard.press('Home');
  assert.ok(Math.abs((await drawer.boundingBox()).width - 280) <= 2);
  await page.keyboard.press('End');
  assert.ok((await page.locator('.writing-main').boundingBox()).width >= 319, JSON.stringify(await page.locator('.writing-shell').evaluate(el => ({width:el.clientWidth,grid:getComputedStyle(el).gridTemplateColumns,children:[...el.children].map(x=>({cls:x.className,width:x.getBoundingClientRect().width})),limit:el.querySelector('[role=separator]')?.outerHTML}))));
  await drag(240);
  const persisted = Number(await divider.getAttribute('aria-valuenow'));
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('studio.writingSession.v1')).layout.drawerWidth), persisted);
  await page.setViewportSize({ width: 1200, height: 760 });
  await page.waitForTimeout(300);
  assert.ok((await page.locator('.writing-main').boundingBox()).width >= 319, JSON.stringify(await page.locator('.writing-shell').evaluate(el => ({width:el.clientWidth,grid:getComputedStyle(el).gridTemplateColumns,children:[...el.children].map(x=>({cls:x.className,width:x.getBoundingClientRect().width})),limit:el.querySelector('[role=separator]')?.outerHTML}))));
  await page.setViewportSize({ width: 900, height: 760 });
  await page.waitForTimeout(100);
  assert.ok(await side.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  // Return wide before capture and reload. Width constrained by a smaller window must not overwrite the preference.
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.waitForTimeout(100);
  assert.equal(Number(await divider.getAttribute('aria-valuenow')), persisted);
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.showInactive();
    try { await new Promise(r => setTimeout(r, 250)); return (await window.webContents.capturePage()).toPNG().toString('base64'); }
    finally { window.hide(); }
  });
  await writeFile(join(root, 'resized-sidebar.png'), Buffer.from(png, 'base64'));
  await page.reload();
  await page.locator('.cm-content[contenteditable=true]').waitFor();
  await page.getByRole('group', { name: '写作资料速查' }).getByRole('button', { name: '助手', exact: true }).click();
  await page.waitForTimeout(100);
  assert.equal(Number(await divider.getAttribute('aria-valuenow')), persisted);
  assert.equal(await editor.innerText(), '拖动边界时需要保护的合成正文。');
  await divider.dblclick();
  assert.equal(Number(await divider.getAttribute('aria-valuenow')), 364);
  await page.getByRole('button', { name: '创作助手', exact: true }).click();
  await main.getByText('先把两条成长线放进同一个选择', { exact: true }).waitFor();
  const fullPng = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.showInactive();
    try { await new Promise(r => setTimeout(r, 200)); return (await window.webContents.capturePage()).toPNG().toString('base64'); }
    finally { window.hide(); }
  });
  await writeFile(join(root, 'full-chat.png'), Buffer.from(fullPng, 'base64'));
  assert.deepEqual(errors, []);
  await writeFile(join(root, 'report.json'), JSON.stringify({ passed: true, measurements, initial, expanded, persisted, errors }, null, 2));
  console.log(root);
} finally { await app.close(); }
