import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron } from 'playwright';

const installed = process.argv[2] ? resolve(process.argv[2]) : null;
const executable = installed ?? resolve('node_modules/electron/dist/electron.exe');
await mkdir('.local', { recursive: true });
const root = await mkdtemp(resolve('.local/writing-workflow-'));
const profile = join(root, 'profile');
const pageErrors = [];
const report = { installed: Boolean(installed), executable, root, checks: [], screenshots: [] };

const firstTitle = '第一章';
const workTitle = '工作流验收';
const secondVolume = '潮汐卷';
const secondTitle = '灯塔手记';
const outlineTitle = '海岸主线';
const outlineText = '先写海岸，再写渡船。';
const searchTerm = '雪雾灯塔';
const markText = '银色钥匙';
const longBody = Array.from({ length: 160 }, (_, index) => `第${index + 1}段，远处的海风穿过长廊。`).join('\n');
const secondBody = `${markText}藏在门后。\n黄昏前，${searchTerm}亮起。`;
let app;
let page;

function record(name, details = {}) {
  report.checks.push({ name, ...details });
  console.log('PASS', name, JSON.stringify(details));
}

async function launch() {
  app = await _electron.launch({
    executablePath: executable, args: installed ? [] : ['.'], timeout: 20000,
    env: { ...process.env, NOVEL_STUDIO_TEST_HIDDEN: '1', NOVEL_STUDIO_NO_MODEL: '1', NOVEL_STUDIO_DATA_DIR: profile }
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false);
  });
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
}

const editor = () => page.locator('.cm-content');
const rail = () => page.getByRole('complementary', { name: '卷章', exact: true });
const bookshelf = () => page.getByRole('region', { name: '我的作品' });
const heading = name => page.getByRole('heading', { name, exact: true }).and(page.locator('.document-title'));
const chapter = name => rail().getByRole('button', { name, exact: true });

async function openWork(title) {
  await bookshelf().getByRole('button', { name: title, exact: true }).click();
  await bookshelf().waitFor({ state: 'hidden' });
}

async function createWork(title) {
  await bookshelf().getByRole('button', { name: '新建作品', exact: true }).click();
  await fillTitle(title);
  await heading(firstTitle).waitFor();
}

async function returnToBookshelf() {
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await bookshelf().waitFor();
  await rail().waitFor({ state: 'hidden' });
}

function dbRow(sql, ...params) {
  const db = new DatabaseSync(join(profile, 'library.sqlite'), { readOnly: true });
  try { return db.prepare(sql).get(...params); } finally { db.close(); }
}

async function eventually(read, check, description) {
  const deadline = Date.now() + 8000;
  let actual;
  do {
    actual = await read();
    if (check(actual)) return actual;
    await delay(40);
  } while (Date.now() < deadline);
  assert.fail(`${description}。实际值 ${JSON.stringify(actual)}`);
}

async function fillTitle(title) {
  const dialog = page.getByRole('dialog');
  await dialog.locator('#writing-title').fill(title);
  await dialog.getByRole('button', { name: '确定', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}

async function replaceDraft(text) {
  await editor().focus();
  await editor().press('Control+a');
  await page.keyboard.insertText(text);
}

async function expectSaved(title, text) {
  await eventually(() => dbRow('SELECT body = ? AS saved FROM original_docs WHERE title = ?', text, title)?.saved,
    saved => saved === 1, `没有将${title}正文保存到 SQLite`);
}

async function readEditor(includeBody = false) {
  return editor().evaluate((content, includeBody) => {
    // Inspect the installed CodeMirror view without changing the selection or scrolling it.
    const view = content.cmTile?.root?.view;
    if (!view) return null;
    const { anchor, head, from, to } = view.state.selection.main;
    return {
      anchor, head, selected: view.state.sliceDoc(from, to), scrollTop: view.scrollDOM.scrollTop,
      length: view.state.doc.length, ...(includeBody ? { text: view.state.doc.toString() } : {})
    };
  }, includeBody);
}

async function expectPosition(expected, description) {
  return eventually(readEditor, actual => actual?.length === expected.length && actual.anchor === expected.anchor &&
    actual.head === expected.head && Math.abs(actual.scrollTop - expected.scrollTop) <= 24, description);
}

async function expectFocus(locator, description) {
  await eventually(() => locator.evaluate(element => element === document.activeElement), focused => focused, description);
}

async function holdNextSave(id) {
  await app.evaluate(({ ipcMain }, id) => {
    const invoke = ipcMain._invokeHandlers.get('novel:invoke');
    const gate = { armed: true, release: null };
    globalThis.writingWorkflowGate = gate;
    ipcMain.removeHandler('novel:invoke');
    ipcMain.handle('novel:invoke', async (event, method, args) => {
      if (gate.armed && method === 'writing.save' && args.id === id) {
        gate.armed = false;
        await new Promise(resolve => { gate.release = resolve; });
        gate.release = null;
      }
      return invoke(event, method, args);
    });
  }, id);
}

async function releaseSave() {
  await app?.evaluate(() => globalThis.writingWorkflowGate?.release?.());
}

async function capture(name) {
  const path = join(root, `${name}.png`);
  try {
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.showInactive();
      try {
        const currentFrame = async () => {
          // A newly shown window can briefly reuse a frame from before the panel updated.
          await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
          await new Promise(resolve => setTimeout(resolve, 120));
          window.webContents.invalidate();
          return window.webContents.capturePage(undefined, { stayAwake: true });
        };
        const image = await Promise.race([
          currentFrame(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('capture timeout')), 4000))
        ]);
        return image.toPNG().toString('base64');
      } finally { window.hide(); }
    });
    await writeFile(path, Buffer.from(png, 'base64'));
    report.screenshots.push(path);
  } catch (error) {
    (report.screenshotErrors ??= []).push(`${name}: ${error.message}`);
  }
}

try {
  await launch();
  const info = await page.evaluate(() => window.studio.invoke('app.info'));
  assert.equal(info.ok, true);
  report.version = info.value.version;
  report.electron = info.value.electron;

  const tools = () => page.getByRole('group', { name: '写作资料速查' });
  const outline = () => tools().getByRole('button', { name: '大纲', exact: true });
  const reference = tools().getByRole('button', { name: '参考', exact: true });
  const referencePane = page.getByRole('region', { name: '参考检索侧栏', exact: true });
  const referenceQuery = referencePane.getByRole('textbox', { name: '检索问题', exact: true });
  await bookshelf().waitFor();
  await rail().waitFor({ state: 'hidden' });
  const navigation = page.getByRole('navigation', { name: '主导航' });
  await navigation.getByRole('button', { name: '参考库', exact: true }).press('Enter');
  await page.getByRole('region', { name: '参考库检索' }).getByRole('textbox', { name: '检索问题' }).waitFor();
  await navigation.getByRole('button', { name: '原创写作', exact: true }).press('Enter');
  await bookshelf().waitFor();
  record('启动进入原创书架，未打开作品时可从主导航进入参考检索');

  await createWork(workTitle);
  await replaceDraft(longBody);
  await expectSaved(firstTitle, longBody);

  const directory = rail().getByRole('region', { name: '卷章目录' });
  const createChapter = directory.getByRole('button', { name: '新建章节', exact: true });
  await createChapter.press('Enter');
  const chapterDialog = page.getByRole('dialog', { name: '新建章节', exact: true });
  const chapterName = chapterDialog.locator('#writing-title');
  const chapterSubmit = chapterDialog.getByRole('button', { name: '确定', exact: true });
  await expectFocus(chapterName, '键盘打开新建章节后未聚焦名称输入框');
  await chapterName.fill('这章应当取消');
  await page.keyboard.press('Shift+Tab');
  await expectFocus(chapterSubmit, '新建章节对话框 Shift+Tab 没有从首项循环到尾项');
  await page.keyboard.press('Tab');
  await expectFocus(chapterName, '新建章节对话框 Tab 没有从尾项循环到首项');
  await page.keyboard.press('Escape');
  await chapterDialog.waitFor({ state: 'hidden' });
  await expectFocus(createChapter, '取消新建章节后未将焦点归还入口');
  assert.equal(dbRow('SELECT count(*) AS n FROM original_docs').n, 1);
  record('新建章节弹窗支持 Enter、首尾 Tab 循环和 Esc 取消后返回入口焦点');

  await directory.getByRole('button', { name: '新建分卷', exact: true }).click();
  await fillTitle(secondVolume);
  await rail().getByRole('button', { name: `在${secondVolume}中新建章节`, exact: true }).click();
  await fillTitle(secondTitle);
  await heading(secondTitle).waitFor();
  await replaceDraft(secondBody);
  await expectSaved(secondTitle, secondBody);

  await outline().click();
  await page.getByRole('button', { name: '新建大纲', exact: true }).click();
  await fillTitle(outlineTitle);
  await heading(outlineTitle).waitFor();
  await replaceDraft(outlineText);
  await expectSaved(outlineTitle, outlineText);

  assert.deepEqual(await directory.locator('.doc-title').allTextContents(), [firstTitle, secondTitle]);
  assert.equal(await rail().getByRole('button', { name: '新建大纲', exact: true }).count(), 0);
  await chapter(firstTitle).click();
  await heading(firstTitle).waitFor();
  if ((await outline().getAttribute('aria-pressed')) !== 'true') await outline().click();
  const outlinePane = page.getByRole('region', { name: '大纲速查', exact: true });
  await outlinePane.getByRole('searchbox', { name: '筛选大纲标题' }).fill('海岸');
  await outlinePane.getByRole('button', { name: outlineTitle, exact: true }).click();
  await outlinePane.getByText(outlineText, { exact: true }).waitFor();
  await heading(firstTitle).waitFor();
  assert.equal((await readEditor(true)).text, longBody);
  await capture('outline-preview');
  await outline().click();
  await outlinePane.waitFor({ state: 'hidden' });
  record('右侧新建并速查大纲，预览期间主编辑器保留当前章节及正文');

  await outline().press('Enter');
  await expectFocus(outlinePane.getByRole('searchbox', { name: '筛选大纲标题' }), '键盘开启大纲速查后焦点未进入抽屉');
  await page.keyboard.press('Escape');
  await outlinePane.waitFor({ state: 'hidden' });
  await expectFocus(outline(), '关闭大纲速查后未将焦点归还大纲入口');
  record('大纲侧轨键盘开启时聚焦抽屉，Esc 关闭并归还入口焦点');

  await reference.press('Enter');
  await expectFocus(referenceQuery, '键盘开启写作侧栏后未聚焦检索输入框');
  await referenceQuery.fill('保留这条未提交的问题');
  assert.equal(await reference.getAttribute('aria-pressed'), 'true');
  await outline().click();
  await referencePane.waitFor({ state: 'hidden' });
  await outlinePane.waitFor();
  await reference.click();
  await outlinePane.waitFor({ state: 'hidden' });
  assert.equal(await referenceQuery.inputValue(), '保留这条未提交的问题');
  await referencePane.getByRole('button', { name: '收起参考检索', exact: true }).click();
  await referencePane.waitFor({ state: 'hidden' });
  assert.equal(await reference.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.getByRole('button', { name: '参考侧栏', exact: true }).count(), 0);
  record('资料与参考共享右侧抽屉，切换工具后保留参考查询草稿');

  const compare = tools().getByRole('button', { name: '对照', exact: true });
  await compare.click();
  const comparePane = page.getByRole('region', { name: '章节对照', exact: true });
  await comparePane.getByRole('button', { name: new RegExp(secondTitle) }).click();
  const compareText = comparePane.getByLabel('条目正文', { exact: true });
  await compareText.waitFor();
  assert.equal(await compareText.textContent(), secondBody);
  await heading(firstTitle).waitFor();
  assert.equal(await chapter(firstTitle).getAttribute('aria-current'), 'true');
  assert.equal((await readEditor(true)).text, longBody);
  await capture('chapter-comparison');
  await compare.click();
  await comparePane.waitFor({ state: 'hidden' });
  record('右侧章节对照显示另一章真实正文，左侧选中和主编辑器保留当前章');

  const firstFold = rail().locator('.volume-row button[aria-expanded]').filter({ hasText: '第一卷' });
  await firstFold.click();
  assert.equal(await firstFold.getAttribute('aria-expanded'), 'false');
  await chapter(firstTitle).waitFor({ state: 'hidden' });
  await chapter(secondTitle).waitFor();
  const directoryQuery = rail().getByLabel('搜索卷章', { exact: true });
  await directoryQuery.fill(secondVolume);
  await chapter(secondTitle).waitFor();
  await firstFold.waitFor({ state: 'hidden' });
  await directoryQuery.fill(secondTitle);
  await chapter(secondTitle).waitFor();
  await chapter(firstTitle).waitFor({ state: 'hidden' });
  await directoryQuery.fill('目录不存在的标题');
  await chapter(secondTitle).waitFor({ state: 'hidden' });
  await directoryQuery.fill('');
  assert.equal(await firstFold.getAttribute('aria-expanded'), 'false');
  await firstFold.click();
  await chapter(firstTitle).waitFor();
  record('分卷可折叠，卷名与章名均能筛选目录，清空筛选保留折叠状态');

  await editor().press('Control+End');
  for (let index = 0; index < 12; index++) await editor().press('ArrowUp');
  const nearEnd = await eventually(readEditor, state => state?.scrollTop > 900, '长文未滚动到远离开头的位置');
  await page.locator('.cm-scroller').evaluate(scroller => { scroller.scrollTop -= 160; });
  const beforeSwitch = await eventually(readEditor, state => state?.scrollTop <= nearEnd.scrollTop - 140,
    '长文的滚动位置没有与光标独立变化');
  assert.ok(beforeSwitch.anchor > 0 && beforeSwitch.anchor < longBody.length);
  await page.getByRole('button', { name: '下一章', exact: true }).click();
  await heading(secondTitle).waitFor();
  await page.getByRole('button', { name: '上一章', exact: true }).click();
  await heading(firstTitle).waitFor();
  const afterSwitch = await expectPosition(beforeSwitch, '切章回来时未恢复同章光标和滚动位置');
  record('上一章、下一章跨卷导航，160 段中文正文切章来回保留光标和滚动', { beforeSwitch, afterSwitch });

  await app.close();
  app = null;
  await launch();
  await bookshelf().waitFor();
  await heading(firstTitle).waitFor({ state: 'hidden' });
  await openWork(workTitle);
  await heading(firstTitle).waitFor();
  const afterRestart = await expectPosition(beforeSwitch, '正常重启后未恢复上次章节的光标和滚动位置');
  assert.equal((await readEditor(true)).text, longBody);
  record('重启先显示书架，点选作品后恢复上次章节、光标、滚动和正文', { afterRestart });

  await page.getByRole('button', { name: '搜索全书正文', exact: true }).click();
  const searchPane = page.getByRole('complementary', { name: '全书正文搜索', exact: true });
  const searchQuery = searchPane.getByLabel('正文关键词', { exact: true });
  const search = searchPane.getByRole('button', { name: '搜索', exact: true });
  await searchQuery.fill('先写海岸');
  await search.click();
  await searchPane.getByText('没有找到匹配的章节。', { exact: true }).waitFor();
  assert.equal(await searchPane.locator('.body-search-result').count(), 0);
  await searchQuery.fill(searchTerm);
  await search.click();
  const searchResult = searchPane.locator('.body-search-result').filter({ hasText: secondTitle });
  await searchResult.waitFor();
  assert.match(await searchResult.innerText(), new RegExp(searchTerm));
  assert.match(await searchResult.innerText(), new RegExp(secondVolume));
  assert.equal(await searchPane.locator('.body-search-result').count(), 1);
  await capture('manuscript-search');
  await searchResult.click();
  await heading(secondTitle).waitFor();
  const match = await eventually(readEditor, state => state?.selected === searchTerm, '未选中搜索结果对应的实际正文');
  assert.equal(Math.min(match.anchor, match.head), secondBody.indexOf(searchTerm));
  record('全书正文搜索排除大纲，返回另一卷章的真实摘录，跳转后选中命中文字');

  await page.getByRole('button', { name: '标记', exact: true }).click();
  const markPanel = page.getByRole('complementary', { name: '原创标记', exact: true });
  await editor().press('Control+Home');
  for (let index = 0; index < markText.length; index++) await editor().press('Shift+ArrowRight');
  await markPanel.getByRole('button', { name: '标记所选文字', exact: true }).click();
  const mark = markPanel.locator('.mark-jump').filter({ hasText: markText });
  await mark.waitFor();
  const row = dbRow('SELECT id, revision FROM original_docs WHERE title = ?', secondTitle);
  await holdNextSave(row.id);
  const prefix = '雨夜手记：';
  await editor().press('Control+Home');
  await page.keyboard.insertText(prefix);
  await eventually(() => app.evaluate(() => Boolean(globalThis.writingWorkflowGate.release)), pending => pending,
    '未拦截暂存后的首次自动保存');
  await mark.click();
  assert.equal(dbRow('SELECT revision FROM original_docs WHERE id = ?', row.id).revision, row.revision);
  assert.equal(dbRow('SELECT start FROM original_marks WHERE doc_id = ?', row.id).start, 0);
  await releaseSave();
  const moved = await eventually(readEditor, state => state?.selected === markText, '标记跳转没有按点击时的最新编辑定位');
  assert.equal(Math.min(moved.anchor, moved.head), prefix.length);
  await expectSaved(secondTitle, prefix + secondBody);
  assert.equal(dbRow('SELECT start FROM original_marks WHERE doc_id = ?', row.id).start, prefix.length);
  record('自动保存挂起时点击标记，放行后跳至最新正文的正确位置，SQLite 坐标一致');

  const unformatted = `${prefix}${secondBody}\t  \n\n\n\n尾段  \t`;
  const formatted = `${prefix}${secondBody}\n\n尾段`;
  await editor().press('Control+End');
  await page.keyboard.insertText('\t  \n\n\n\n尾段  \t');
  await page.getByLabel('更多编辑操作', { exact: true }).click();
  await page.getByRole('button', { name: '一键整理', exact: true }).click();
  await eventually(() => readEditor(true), state => state?.text === formatted, '一键整理后的正文不符合预期');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await eventually(() => readEditor(true), state => state?.text === unformatted, '撤销未恢复整理前的正文');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await eventually(() => readEditor(true), state => state?.text === formatted, '重做未恢复整理后的正文');
  await expectSaved(secondTitle, formatted);
  record('一键整理行尾空白和连续空行，撤销、重做和最终自动保存一致');

  const latestDraft = `${formatted}\n书架切换验收稿。`;
  await editor().press('Control+End');
  await page.keyboard.insertText('\n书架切换验收稿。');
  await returnToBookshelf();
  await expectSaved(secondTitle, latestDraft);
  await openWork(workTitle);
  await heading(secondTitle).waitFor();
  assert.equal((await readEditor(true)).text, latestDraft);
  assert.equal(await rail().locator('.book-cover').count(), 0);
  assert.equal(await rail().getByRole('button', { name: '新建作品', exact: true }).count(), 0);
  const otherWork = '第二部验收作品';
  await returnToBookshelf();
  await createWork(otherWork);
  await replaceDraft('第二部独立草稿。');
  await returnToBookshelf();
  await capture('bookshelf');
  await openWork(workTitle);
  await heading(secondTitle).waitFor();
  assert.equal((await readEditor(true)).text, latestDraft);
  await returnToBookshelf();
  await openWork(otherWork);
  await heading(firstTitle).waitFor();
  assert.equal((await readEditor(true)).text, '第二部独立草稿。');
  record('返回书架先保存，重开同书和切换两部作品均恢复各自草稿，写作左栏只列卷章');

  assert.equal(await page.locator('.writing-error').count(), 0);
  assert.deepEqual(pageErrors, []);
} catch (error) {
  report.failure = String(error.stack ?? error);
  if (page && !page.isClosed()) {
    await writeFile(join(root, 'failure-body.txt'), await page.locator('body').innerText({ timeout: 2000 }).catch(() => ''));
    await capture('failure');
  }
  throw error;
} finally {
  await releaseSave().catch(() => {});
  await app?.close().catch(() => {});
  await writeFile(join(root, 'report.json'), JSON.stringify({ ...report, pageErrors }, null, 2));
  console.log('Writing workflow QA evidence:', root);
}
