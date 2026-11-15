import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { _electron } from 'playwright';
import { Store } from '../app/main/store.mjs';
import { WritingService } from '../app/main/writing.mjs';
import { AssistantService } from '../app/main/assistant.mjs';

await mkdir('.local/ux-readability-0210', { recursive: true });
const root = await mkdtemp(resolve('.local/ux-readability-0210/qa-'));
const profile = join(root, 'profile');
const store = new Store(join(profile, 'library.sqlite'));
const writing = new WritingService(store);
const workId = writing.createWork({ title: '纸桥（阅读验收）' }).id;
const service = new AssistantService(writing, null, profile);
const entry = service.entry(workId);
const prose = '明确这阶段的人物目标、选择代价与关系变化，先铺垫原因，再让转折来自人物行动。'.repeat(4);
const table = '| 阶段 | 章节范围 | 剧情与情绪 | | :--- | :--- | :--- | ' + [1, 2, 3, 4].map(i => `| **第${i}幕** | 第${i}～${i + 2}章 | **目标**：${prose}<br>**转折**：共同修桥，保留证据。 |`).join(' ');
entry.messages = [{ role: 'user', text: '请给出四幕方案，并附简短比较。' }, { role: 'assistant', text: '## 四幕节奏建议\n\n' + table + '\n\n## 简短对比\n\n| 方案 | 侧重 |\n| --- | --- |\n| 甲 | 合作 |\n| 乙 | 信任 |' }];
service.saveHistory(entry);
const historyFile = entry.history;
const historyBefore = await readFile(historyFile, 'utf8');
service.close(); store.close();
const cards = Array.from({ length: 12 }, (_, index) => ({
  work_id: 'qa-reference', card_id: `card-${index}`, title: `合成参考 ${index + 1}：有代价的合作`,
  work_title: '合成参考作品', category: 'event', claim_type: 'fact', revision: 1,
  content: `## 事件\n${prose.repeat(8)}\n\n## 原文边界\n完整内容末尾 ${index + 1}`,
  creative_takeaway: index % 2 ? '让两个人的目标发生冲突，再通过有代价的分工推进信任。' : '',
  evidence: [{ volume_id: 'v1', revision_id: 'r1', start: 'p000001', end: 'p000001', volume_title: '第一卷' }]
}));
const app = await _electron.launch({
  executablePath: resolve(process.argv[2] ?? 'node_modules/electron/dist/electron.exe'),
  args: process.argv[2] ? [] : [resolve('.')],
  env: { ...process.env, NOVEL_STUDIO_DATA_DIR: profile, NOVEL_STUDIO_TEST_HIDDEN: '1', NOVEL_STUDIO_NO_MODEL: '1' }
});
const errors = [], requests = [];
try {
  await app.evaluate(({ BrowserWindow, ipcMain }, cards) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.setBackgroundThrottling(false); window.showInactive();
    const listeners = ipcMain._invokeHandlers;
    const original = listeners.get('novel:invoke');
    listeners.set('novel:invoke', async (event, method, args) => {
      if (method === 'search.query') return { ok: true, value: { hits: cards, cursor: null } };
      if (method === 'reference.getCard' && args.workId === 'qa-reference') return { ok: true, value: cards.find(card => card.card_id === args.cardId) };
      const result = await original(event, method, args);
      if (method === 'assistant.get' && result.ok) result.value.sources = { hits: cards };
      return result;
    });
  }, cards);
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.setViewportSize({ width: 1460, height: 1000 });
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '创作助手', exact: true }).click();
  const main = page.getByRole('region', { name: '创作助手' }).filter({ visible: true });
  await main.getByLabel('助手作品').selectOption(workId);
  await main.locator('.assistant-table-record').first().waitFor();
  assert.equal(await main.locator('.assistant-table-record').count(), 4);
  assert.equal(await main.locator('.assistant-table-scroll table').count(), 1);
  assert.equal(await main.locator('.assistant-table-record').first().locator('br').count(), 1);
  assert.equal(await main.locator('.assistant-composer small').count(), 0);
  assert.equal(await main.locator('.assistant-scroll').evaluate(el => getComputedStyle(el, '::-webkit-scrollbar').width), '6px');
  async function capture(name) {
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]; window.showInactive();
      await new Promise(r => setTimeout(r, 150));
      return (await window.webContents.capturePage()).toPNG().toString('base64');
    });
    await writeFile(join(root, name), Buffer.from(png, 'base64'));
  }
  await main.locator('.assistant-scroll').evaluate(el => { el.scrollTop = 0; });
  await capture('assistant-prose.png');
  await main.locator('.assistant-references > summary').click();
  await main.locator('.assistant-references').scrollIntoViewIfNeeded();
  assert.equal(await main.locator('.card-preview').count(), 12);
  const gridWidth = await main.locator('.result-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.ok(gridWidth >= 2);
  assert.ok((await main.locator('.card-preview').first().boundingBox()).height < 310);
  await main.locator('.card-preview').first().getByRole('button', { name: '展开全文 →' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByText('完整内容末尾 1', { exact: true }).waitFor();
  await modal.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '参考库', exact: true }).click();
  const conversation = page.getByRole('region', { name: '参考库检索' });
  await conversation.getByLabel('检索问题').fill('有代价的合作');
  await conversation.getByRole('button', { name: '检索', exact: true }).click();
  await conversation.locator('.card-preview').first().waitFor();
  assert.equal(await conversation.locator('.card-preview').count(), 12);
  await capture('reference-grid.png');
  for (const width of [980, 900]) {
    await page.setViewportSize({ width, height: 760 });
    assert.ok(await conversation.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert.ok((await conversation.locator('.card-preview-text').first().textContent()).length <= 161);
  }
  await page.getByRole('button', { name: '资料与设置', exact: true }).click();
  await page.getByRole('group', { name: '界面明暗' }).getByRole('button', { name: '深色', exact: true }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '创作助手', exact: true }).click();
  await main.locator('.assistant-scroll').evaluate(el => { el.scrollTop = 0; });
  await capture('dark-narrow.png');
  assert.ok(await main.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.equal(await readFile(historyFile, 'utf8'), historyBefore);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  await writeFile(join(root, 'report.json'), JSON.stringify({ passed: true, recordCount: 4, shortTable: true, previewCount: 12, gridColumns: gridWidth, scrollbarWidth: 6, historyUnchanged: true, requests, errors }, null, 2));
  console.log(root);
} finally { await app.close(); }
