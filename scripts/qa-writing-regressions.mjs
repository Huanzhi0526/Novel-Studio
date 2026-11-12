import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron } from 'playwright';

await mkdir('.local', { recursive: true });
const root = await mkdtemp(resolve('.local/writing-regressions-'));
const profile = join(root, 'profile');
const exportPath = join(root, 'chapter.txt');
const installed = process.argv[2];
const app = await _electron.launch({
  executablePath: resolve(installed ?? 'node_modules/electron/dist/electron.exe'),
  args: installed ? [] : ['.'],
  timeout: 20000,
  env: { ...process.env, NOVEL_STUDIO_TEST_HIDDEN: '1', NOVEL_STUDIO_NO_MODEL: '1', NOVEL_STUDIO_DATA_DIR: profile }
});

function dbRow(sql) {
  const db = new DatabaseSync(join(profile, 'library.sqlite'), { readOnly: true });
  try { return db.prepare(sql).get(); } finally { db.close(); }
}

async function eventually(read, expected) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const actual = await read();
    if (actual === expected) return;
    await delay(25);
  }
  assert.equal(await read(), expected);
}

function hold(method, id) {
  return app.evaluate((_, gate) => { globalThis.writingRegression.gate = gate; }, { method, id });
}

function waiting() {
  return eventually(() => app.evaluate(() => Boolean(globalThis.writingRegression.release)), true);
}

function release() {
  return app.evaluate(() => globalThis.writingRegression.release?.());
}

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(7000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  await app.evaluate(({ dialog, ipcMain }, output) => {
    const handle = ipcMain._invokeHandlers.get('novel:invoke');
    globalThis.writingRegression = { exports: 0 };
    dialog.showSaveDialog = async () => {
      globalThis.writingRegression.exports++;
      return { canceled: false, filePath: output };
    };
    dialog.showMessageBox = async () => ({ response: 1 });
    // Hold individual calls before the real handler to exercise IPC latency deterministically.
    ipcMain.removeHandler('novel:invoke');
    ipcMain.handle('novel:invoke', async (event, method, args) => {
      const qa = globalThis.writingRegression;
      if (qa.gate?.method === method && (!qa.gate.id || qa.gate.id === args.id)) {
        qa.gate = null;
        await new Promise(resolve => { qa.release = resolve; });
        qa.release = null;
      }
      return handle(event, method, args);
    });
  }, exportPath);

  await page.getByRole('region', { name: '我的作品' }).getByRole('button', { name: '新建作品', exact: true }).click();
  await page.locator('#writing-title').fill('写作回归作品');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  const editor = page.locator('.cm-content');
  await editor.focus();
  await page.keyboard.insertText('前言 甲 结尾');
  await page.getByRole('button', { name: '查找替换', exact: true }).click();
  const panel = page.locator('.cm-search');
  await panel.getByLabel('查找文字', { exact: true }).fill('甲');
  await panel.getByLabel('替换为', { exact: true }).fill('乙');
  assert.equal(await panel.count(), 1);
  assert.equal(await page.locator('.findbar').count(), 0);
  await editor.press('Control+Home');
  await editor.press('Shift+ArrowRight');
  await editor.press('Shift+ArrowRight');
  const replace = panel.getByRole('button', { name: '替换', exact: true });
  await replace.click();
  assert.equal(await editor.innerText(), '前言 甲 结尾');
  await replace.click();
  assert.equal(await editor.innerText(), '前言 乙 结尾');
  await panel.getByLabel('查找文字', { exact: true }).press('Escape');
  await panel.waitFor({ state: 'detached' });
  console.log('PASS 查找替换只有一套控件，仅替换实际匹配');

  await hold('writing.createDoc');
  await page.getByTitle('新章节').click();
  await page.locator('#writing-title').fill('第二章');
  await page.getByRole('button', { name: '确定', exact: true }).dblclick();
  await waiting();
  await release();
  await page.getByRole('heading', { name: '第二章', exact: true }).waitFor();
  assert.equal(dbRow("SELECT count(*) AS n FROM original_docs WHERE title='第二章'").n, 1);
  console.log('PASS 慢 IPC 下双击建章只生成一章');

  const firstChapter = page.getByRole('button', { name: '第一章', exact: true });
  const secondChapter = page.getByRole('button', { name: '第二章', exact: true });
  await firstChapter.click();
  await page.getByRole('heading', { name: '第一章', exact: true }).waitFor();
  await editor.press('Control+End');
  await page.keyboard.insertText('，切章前应保留');
  await hold('writing.open', dbRow("SELECT id FROM original_docs WHERE title='第二章'").id);
  await secondChapter.click();
  await waiting();
  assert.equal(await editor.getAttribute('contenteditable'), 'false');
  await page.keyboard.insertText('切换中禁止输入');
  assert.equal(await editor.innerText(), '前言 乙 结尾，切章前应保留');
  await release();
  await page.getByRole('heading', { name: '第二章', exact: true }).waitFor();
  assert.equal(dbRow("SELECT body FROM original_docs WHERE title='第一章'").body, '前言 乙 结尾，切章前应保留');
  await eventually(() => editor.getAttribute('contenteditable'), 'true');
  console.log('PASS 切章等待期间冻结旧编辑器，切换前的输入已保存');

  await firstChapter.click();
  await page.getByRole('heading', { name: '第一章', exact: true }).waitFor();
  const priorRevision = dbRow("SELECT revision FROM original_docs WHERE title='第一章'").revision;
  await hold('writing.save');
  await editor.press('Control+End');
  await page.keyboard.insertText('，暂存后整书导出');
  await page.getByTitle('更多作品操作').click();
  await waiting();
  const workId = dbRow('SELECT id FROM original_works').id;
  const direct = await page.evaluate(id => window.studio.invoke('writing.exportTxt', { workId: id }), workId);
  assert.equal(direct.ok, true);
  assert.equal(direct.value, true);
  assert.match(await readFile(exportPath, 'utf8'), /暂存后整书导出/);
  assert.equal(dbRow("SELECT revision FROM original_docs WHERE title='第一章'").revision, priorRevision);
  await page.getByRole('button', { name: '导出整书 TXT', exact: true }).click();
  assert.equal(await app.evaluate(() => globalThis.writingRegression.exports), 1);
  await release();
  await eventually(() => app.evaluate(() => globalThis.writingRegression.exports), 2);
  assert.equal(dbRow("SELECT revision FROM original_docs WHERE title='第一章'").revision, priorRevision + 1);
  assert.equal(await page.locator('.writing-error').count(), 0);
  assert.deepEqual(pageErrors, []);
  console.log('PASS 整书导出可读同版本暂存稿，后续正常保存无版本冲突');
} finally {
  console.log('Writing regression evidence:', root);
  await release().catch(() => {});
  await app.close().catch(() => {});
}
