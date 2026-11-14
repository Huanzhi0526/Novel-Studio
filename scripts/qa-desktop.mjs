import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron } from 'playwright';
import yazl from 'yazl';

const installed = process.argv[2] ? resolve(process.argv[2]) : null;
const executable = installed ?? resolve('node_modules/electron/dist/electron.exe');
await mkdir('.local', { recursive: true });
const root = await mkdtemp(resolve('.local/desktop-qa-'));
const dataDir = join(root, 'profile');
const backupPath = join(root, 'backup.zip');
const exportPath = join(root, 'chapter.txt');
const importPath = join(root, 'sample.txt');
const samplePath = join(root, 'result.zip');
await writeFile(importPath, '测试导入正文\r\n卷末。');
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const sample = JSON.parse(await readFile(new URL('../拆书规范包/examples/result.json', import.meta.url), 'utf8'));
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z2kAAAAASUVORK5CYII=', 'base64');
const [volume] = sample.volumes;
const proseBlock = text => ({ kind: 'text', text, asset_sha256: null, note_target: null });
const laterChapter = '第二章 港口';
volume.normalized_payload.blocks.push(
  { kind: 'image', text: '样例插图', asset_sha256: hash(image), note_target: null },
  { kind: 'note', text: '样例注释', asset_sha256: null, note_target: 'p000002' },
  ...Array.from({ length: 114 }, () => proseBlock('码头外的潮水还没退。')),
  proseBlock(laterChapter),
  proseBlock('第七艘渔船停在港口。'),
  proseBlock('p000123')
);
volume.revision_id = hash(JSON.stringify(volume.normalized_payload));
sample.structures[0].revision_id = volume.revision_id;
sample.structures[0].end = 'p000120';
sample.structures.push({
  ...sample.structures[0],
  structure_id: 'cd402c67-8cc3-566a-8dc0-9a97d938aa3d',
  type: 'chapter', title: laterChapter, start: 'p000121', end: 'p000123'
});
sample.cards[0].evidence[0].revision_id = volume.revision_id;
sample.report.processed_ranges[0].revision_id = volume.revision_id;
sample.resources.push({ path: 'assets/probe.png', sha256: hash(image), purpose: 'image' });
const zip = new yazl.ZipFile();
zip.addBuffer(Buffer.from(JSON.stringify(sample)), 'result.json');
zip.addBuffer(image, 'assets/probe.png');
zip.end();
await pipeline(zip.outputStream, createWriteStream(samplePath));

let app;
let page;
const failures = [];
const report = { installed: Boolean(installed), root, checks: [] };
const record = (name, extra = {}) => {
  report.checks.push({ name, ...extra });
  console.log('PASS', name, JSON.stringify(extra));
};

async function launch() {
  const start = performance.now();
  app = await _electron.launch({
    executablePath: executable, args: installed ? [] : ['.'], timeout: 20000,
    env: { ...process.env, NOVEL_STUDIO_TEST_HIDDEN: '1', NOVEL_STUDIO_NO_MODEL: '1', NOVEL_STUDIO_DATA_DIR: dataDir }
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => failures.push(error.message));
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async (_parent, options) => ({
      canceled: false,
      filePaths: [options.filters[0].name === '工作台备份' ? paths.backupPath :
        options.filters[0].extensions.includes('txt') ? paths.importPath : paths.samplePath]
    });
    dialog.showSaveDialog = async (_parent, options) => ({
      canceled: false, filePath: options.filters[0].extensions.includes('txt') ? paths.exportPath : paths.backupPath
    });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, { samplePath, backupPath, exportPath, importPath });
  return Math.round(performance.now() - start);
}

function dbValue(sql) {
  const db = new DatabaseSync(join(dataDir, 'library.sqlite'), { readOnly: true });
  try { return db.prepare(sql).get(); }
  finally { db.close(); }
}

async function eventually(read, expected, timeout = 7000) {
  const deadline = Date.now() + timeout;
  let actual;
  while (Date.now() < deadline) {
    actual = read();
    if (actual === expected) return;
    await delay(50);
  }
  assert.equal(actual, expected);
}

async function tab(name) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();
}

function sideTool(name) {
  return page.getByRole('group', { name: '写作资料速查' }).getByRole('button', { name, exact: true });
}

async function openFirstChapter() {
  await tab('原创写作');
  const firstHeading = page.getByRole('heading', { name: '第一章', exact: true });
  const workButton = page.getByRole('region', { name: '我的作品' })
    .locator('.original-shelf-grid[aria-busy="false"]')
    .getByRole('button', { name: '中文写作验收', exact: true });
  await Promise.race([firstHeading.waitFor(), workButton.waitFor()]);
  if (await workButton.isVisible().catch(() => false)) {
    await workButton.click();
    await firstHeading.waitFor();
  }
  await page.locator('.cm-content').waitFor();
}

try {
  record('隔离资料目录启动真实 Electron 窗口', { coldMs: await launch(), electron: '43.2.0' });
  await page.getByRole('region', { name: '我的作品' }).getByRole('button', { name: '新建作品', exact: true }).click();
  await page.locator('#writing-title').fill('中文写作验收');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  const editor = page.locator('.cm-content');
  await editor.click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: '秘密门', selectionStart: 3, selectionEnd: 3 });
  await cdp.send('Input.insertText', { text: '秘密门' });
  await page.keyboard.insertText('🙂绛星原稿隔离探针');
  const original = '秘密门🙂绛星原稿隔离探针';
  await eventually(() => dbValue("SELECT body FROM original_docs WHERE kind='chapter'")?.body, original);
  record('CodeMirror 中文组合输入、补充平面字符及自动保存');
  const focus = page.getByRole('button', { name: '专注', exact: true });
  await focus.click();
  await page.getByRole('button', { name: '退出专注', exact: true }).click();
  await focus.click();
  await editor.press('Escape');
  await focus.waitFor();
  assert.equal(await editor.innerText(), original);
  record('专注模式可分别用按钮和 Esc 退出，正文保留');

  await tab('资料与设置');
  await page.getByRole('button', { name: '松绿', exact: true }).click();
  await tab('原创写作');
  await page.getByRole('button', { name: '写作设置', exact: true }).click();
  const preferences = page.getByRole('complementary', { name: '写作设置', exact: true });
  await preferences.getByRole('button', { name: '夜写', exact: true }).click();
  await preferences.getByRole('button', { name: '方格', exact: true }).click();
  await preferences.getByRole('button', { name: '宋体', exact: true }).click();
  await preferences.getByRole('checkbox', { name: '段首缩进两字' }).check();
  await preferences.getByRole('slider', { name: '写作字号' }).fill('20');
  const actualStyle = await page.locator('.cm-line').first().evaluate(line => ({
    background: getComputedStyle(line.parentElement).backgroundImage,
    fontSize: getComputedStyle(line).fontSize,
    fontFamily: getComputedStyle(line).fontFamily,
    lineHeight: getComputedStyle(line).lineHeight,
    indent: getComputedStyle(line).textIndent
  }));
  assert.match(actualStyle.background, /linear-gradient.*linear-gradient/);
  assert.equal(actualStyle.fontSize, '20px');
  assert.match(actualStyle.fontFamily, /SimSun/i);
  assert.equal(actualStyle.lineHeight, '39px');
  assert.equal(actualStyle.indent, '40px');
  assert.equal(await page.locator('.studio').getAttribute('data-theme'), 'jade');
  assert.equal(dbValue("SELECT body FROM original_docs WHERE kind='chapter'").body, original);
  await preferences.getByRole('button', { name: '关闭侧栏', exact: true }).click();
  record('主题与真实 CodeMirror 稿纸、字体、字号和缩进生效，存储正文一致');

  for (const [section, title, body] of [
    ['大纲', '海岸主线', '先写海岸再写渡船。'],
    ['角色', '林遥', '在码头长大。'],
    ['设定', '港口规矩', '雾天不得出海。']
  ]) {
    await sideTool(section).click();
    await page.getByRole('button', { name: `新建${section}`, exact: true }).click();
    await page.locator('#writing-title').fill(title);
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
    await editor.click();
    await page.keyboard.insertText(body);
  }
  const writingRail = page.locator('.writing-rail');
  assert.deepEqual(await writingRail.locator('.doc-title').allTextContents(), ['第一章']);
  assert.equal(await writingRail.getByRole('navigation', { name: '作品内容' }).count(), 0);
  for (const name of ['大纲', '角色', '设定', '新建大纲', '新建角色', '新建设定']) {
    assert.equal(await writingRail.getByRole('button', { name, exact: true }).count(), 0);
  }
  await page.locator('.doc-title').filter({ hasText: '第一章' }).click();
  if ((await sideTool('大纲').getAttribute('aria-pressed')) !== 'true') await sideTool('大纲').click();
  const outline = page.getByRole('complementary', { name: '大纲速查', exact: true });
  await outline.getByRole('button', { name: '海岸主线', exact: true }).click();
  await outline.getByText('先写海岸再写渡船。', { exact: true }).waitFor();
  assert.equal(await page.locator('.document-title').innerText(), '第一章');
  assert.equal(await editor.innerText(), original);
  await sideTool('角色').click();
  await outline.waitFor({ state: 'hidden' });
  const characters = page.getByRole('complementary', { name: '角色速查', exact: true });
  await characters.getByRole('button', { name: '林遥', exact: true }).click();
  await characters.getByText('在码头长大。', { exact: true }).waitFor();
  await characters.getByLabel('更多林遥操作', { exact: true }).click();
  await characters.getByRole('button', { name: '重命名', exact: true }).click();
  await page.locator('#writing-title').fill('林遥·船长');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await characters.getByRole('button', { name: '林遥·船长', exact: true }).click();
  await characters.getByLabel('更多林遥·船长操作', { exact: true }).click();
  await characters.getByRole('button', { name: '回收', exact: true }).click();
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await characters.getByRole('button', { name: '林遥·船长', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await writingRail.getByText('林遥·船长', { exact: true }).count(), 0);
  await characters.locator('summary').filter({ hasText: '回收站' }).click();
  await characters.getByRole('button', { name: '恢复', exact: true }).click();
  await characters.getByRole('button', { name: '林遥·船长', exact: true }).click();
  await characters.getByText('在码头长大。', { exact: true }).waitFor();
  await characters.getByRole('button', { name: '打开编辑', exact: true }).click();
  await page.locator('.document-title').filter({ hasText: '林遥·船长' }).waitFor();
  assert.equal(await editor.innerText(), '在码头长大。');
  await writingRail.getByRole('button', { name: '第一章', exact: true }).click();
  await page.locator('.document-title').filter({ hasText: '第一章' }).waitFor();
  if ((await sideTool('角色').getAttribute('aria-pressed')) === 'true') await sideTool('角色').click();
  record('左侧只显示卷章，右侧创建、预览、重命名、回收、恢复和编辑资料');

  await page.getByRole('button', { name: '标记', exact: true }).click();
  await editor.press('Control+Home');
  for (let count = 0; count < 3; count++) await editor.press('Shift+ArrowRight');
  await page.getByRole('button', { name: '标记所选文字' }).click();
  await page.locator('.mark-jump').filter({ hasText: '秘密门' }).waitFor();
  await editor.press('Control+Home');
  await page.keyboard.insertText('雨夜');
  await eventually(() => dbValue('SELECT start FROM original_marks')?.start, 2);
  await editor.press('Control+Home');
  await editor.press('ArrowRight');
  await editor.press('ArrowRight');
  await editor.press('Delete');
  await page.locator('.mark-list .invalid').waitFor();
  assert.equal(dbValue('SELECT invalid FROM original_marks').invalid, 1);
  await page.getByTitle('更多编辑操作').click();
  await page.getByRole('button', { name: '导出本章', exact: true }).click();
  await eventually(() => dbValue("SELECT body FROM original_docs WHERE kind='chapter'").body, '雨夜密门🙂绛星原稿隔离探针');
  await delay(300);
  assert.equal(await readFile(exportPath, 'utf8'), '雨夜密门🙂绛星原稿隔离探针');
  record('标记范围随插入移动，删字后标失效，TXT 导出一致');
  await page.getByTitle('更多作品操作').click();
  await page.getByRole('button', { name: '导入 TXT', exact: true }).click();
  await page.locator('.doc-title').filter({ hasText: 'sample' }).waitFor();
  const importedRow = page.locator('.doc-title').filter({ hasText: 'sample' }).locator('..');
  await importedRow.getByTitle('更多sample操作').click();
  await importedRow.getByTitle('回收', { exact: true }).click();
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await page.locator('summary').filter({ hasText: '回收站' }).click();
  await page.locator('.trash-list').getByRole('button', { name: '恢复', exact: true }).click();
  await page.locator('.doc-title').filter({ hasText: 'sample' }).waitFor();
  record('TXT 导入、回收和恢复');
  await page.locator('.doc-title').filter({ hasText: '第一章' }).click();

  await tab('参考库');
  await page.getByRole('button', { name: '导入标准结果包' }).click();
  await page.getByRole('button', { name: '已查看诊断，确认入库' }).click();
  await page.getByText('已入库。', { exact: false }).waitFor();
  await page.getByRole('button', { name: '导入标准结果包' }).click();
  await page.getByText('该结果包已经导入。', { exact: false }).waitFor();
  await page.getByRole('dialog', { name: '审核标准结果包' }).getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(dbValue('SELECT count(*) AS n FROM reference_cards').n, 1);
  record('真实桌面导入审核与重复包幂等');

  await tab('原创写作');
  assert.match(await editor.innerText(), /雨夜密门/);
  assert.equal(await page.getByRole('button', { name: '参考侧栏', exact: true }).count(), 0);
  await sideTool('大纲').click();
  await outline.waitFor();
  await sideTool('参考').click();
  await outline.waitFor({ state: 'hidden' });
  assert.equal(await sideTool('大纲').getAttribute('aria-pressed'), 'false');
  assert.equal(await sideTool('参考').getAttribute('aria-pressed'), 'true');
  const query = page.locator('#sidebar-query');
  await query.fill('燈塔');
  await query.press('Enter');
  const sidebar = page.getByRole('region', { name: '参考检索侧栏' });
  await sidebar.getByRole('button', { name: '灯塔以记忆作为代价' }).waitFor();
  await editor.press('Control+Home');
  await editor.press('Shift+ArrowRight');
  const writingSelection = () => editor.evaluate(node => {
    const { anchor, head } = node.cmTile.root.view.state.selection.main;
    return { anchor, head };
  });
  const selectionBeforeReading = await writingSelection();
  const evidenceLink = sidebar.locator('.evidence-link').first();
  await evidenceLink.click();
  const reader = page.locator('.reader-workspace');
  await reader.locator('[data-highlighted=yes]').first().waitFor();
  assert.equal(await reader.getAttribute('aria-label'), '原文阅读');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await editor.isVisible(), false);
  assert.doesNotMatch(await reader.innerText(), /\bp\d{5,}\b|\b[a-f0-9]{12,}\b/i);
  assert.equal(await reader.locator('[data-highlighted=yes]').count(), 3);
  await reader.locator('img').waitFor({ state: 'attached' });
  const imageReady = await reader.locator('img').evaluate(async node => {
    await node.decode();
    return node.naturalWidth;
  });
  assert.equal(imageReady, 1);
  await reader.getByRole('button', { name: '查看注释', exact: true }).click();
  await reader.getByText('样例注释', { exact: true }).waitFor();
  await reader.getByRole('button', { name: '返回正文', exact: true }).click();
  const readingSettings = reader.getByRole('button', { name: '阅读设置', exact: true });
  await readingSettings.click();
  const versions = reader.getByRole('combobox', { name: '正文版本' });
  assert.match(await versions.innerText(), /当前版本/);
  assert.doesNotMatch(await versions.innerText(), /\b[a-f0-9]{12,}\b/i);
  await readingSettings.press('Escape');
  await versions.waitFor({ state: 'hidden' });
  const tocToggle = reader.getByRole('button', { name: '目录', exact: true });
  assert.equal(await tocToggle.getAttribute('aria-expanded'), 'false');
  await tocToggle.click();
  const toc = reader.getByRole('navigation', { name: '原文目录' });
  await toc.getByRole('button', { name: new RegExp(laterChapter) }).click();
  await reader.getByText('第七艘渔船停在港口。', { exact: true }).waitFor();
  assert.equal(await reader.locator('#block-p000123').count(), 1);
  assert.doesNotMatch(await reader.innerText(), /\bp000123\b/);
  assert.equal(await reader.locator('[data-highlighted=yes]').count(), 0);
  await reader.getByRole('button', { name: '回到证据', exact: true }).click();
  await reader.locator('[data-highlighted=yes]').first().waitFor();
  await reader.getByRole('button', { name: '返回', exact: true }).click();
  await reader.waitFor({ state: 'hidden' });
  await evidenceLink.waitFor();
  assert.equal(await editor.isVisible(), true);
  assert.equal(await page.locator('.document-title').innerText(), '第一章');
  assert.match(await editor.innerText(), /雨夜密门/);
  assert.deepEqual(await writingSelection(), selectionBeforeReading);
  record('独立原文阅读页默认隐藏技术编号，插图和注释可查看，跨页目录与证据定位可返回原写作选区');
  await sideTool('大纲').click();
  await sidebar.waitFor({ state: 'hidden' });
  await outline.waitFor();
  await sideTool('参考').click();
  await outline.waitFor({ state: 'hidden' });
  await sidebar.getByText('燈塔', { exact: true }).waitFor();
  await sidebar.getByRole('button', { name: '收起参考检索', exact: true }).click();
  await sidebar.waitFor({ state: 'hidden' });
  assert.equal(await sideTool('参考').getAttribute('aria-pressed'), 'false');
  await sideTool('参考').click();
  await sidebar.getByText('燈塔', { exact: true }).waitFor();
  await query.fill('绛星原稿隔离探针');
  await query.press('Enter');
  await sidebar.getByText('没有找到匹配的参考条目。', { exact: true }).waitFor();
  record('参考工具与资料互斥、切换与收起保留会话、真实命中、原创隔离、版本证据、图片和注释');

  await tab('资料与设置');
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '本机资料', exact: true }).click();
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  await page.getByText('备份已保存至', { exact: false }).waitFor();
  await tab('原创写作');
  await editor.press('Control+End');
  await page.keyboard.insertText('备份之后的修改');
  const post = '雨夜密门🙂绛星原稿隔离探针备份之后的修改';
  await eventually(() => dbValue("SELECT body FROM original_docs WHERE title='第一章'")?.body, post);
  await tab('资料与设置');
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '本机资料', exact: true }).click();
  await page.getByRole('button', { name: '恢复备份', exact: true }).click();
  await page.getByText('恢复完成。', { exact: false }).waitFor();
  assert.equal(dbValue("SELECT body FROM original_docs WHERE title='第一章'").body, '雨夜密门🙂绛星原稿隔离探针');
  assert.equal(dbValue('SELECT count(*) AS n FROM reference_cards').n, 1);
  assert.equal(dbValue('SELECT invalid FROM original_marks').invalid, 1);
  record('桌面备份恢复实际替换独立资料并保留原快照');

  await openFirstChapter();
  const injector = new DatabaseSync(join(dataDir, 'library.sqlite'));
  try {
    injector.exec("CREATE TRIGGER qa_save_fail BEFORE UPDATE ON original_docs BEGIN SELECT RAISE(ABORT,'qa disk write failure'); END");
    await editor.press('Control+End');
    await page.keyboard.insertText('崩溃前暂存');
    await page.getByText('保存失败', { exact: true }).first().waitFor();
    assert.match(dbValue('SELECT body FROM original_drafts').body, /崩溃前暂存/);
    assert.doesNotMatch(dbValue("SELECT body FROM original_docs WHERE title='第一章'").body, /崩溃前暂存/);
    const exited = once(app.process(), 'exit');
    execFileSync('taskkill.exe', ['/PID', String(app.process().pid), '/T', '/F'], { windowsHide: true });
    await exited;
    app = null;
    injector.exec('DROP TRIGGER qa_save_fail');
  } finally { injector.close(); }
  let restartMs;
  for (let attempt = 0; attempt < 5; attempt++) {
    await delay(500);
    try {
      restartMs = await launch();
      break;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  await openFirstChapter();
  await page.getByText('已恢复草稿', { exact: true }).waitFor();
  assert.match(await page.locator('.cm-content').innerText(), /崩溃前暂存/);
  assert.equal(await page.locator('.studio').getAttribute('data-theme'), 'jade');
  assert.equal(await page.locator('.workspace-main[data-writing-paper]').getAttribute('data-writing-paper'), 'dark');
  assert.equal(await page.locator('.workspace-main[data-writing-paper]').getAttribute('data-writing-ruling'), 'grid');
  record('主题和稿纸偏好随应用重启恢复');
  record('SQLite 保存故障后进程强退，重启恢复暂存正文', { restartMs });
  assert.deepEqual(failures, []);
} catch (error) {
  report.failure = String(error.stack ?? error);
  if (page && !page.isClosed()) {
    await writeFile(join(root, 'failure-body.txt'), await page.locator('body').innerText().catch(() => ''));
  }
  throw error;
} finally {
  await writeFile(join(root, 'report.json'), JSON.stringify({ ...report, pageErrors: failures }, null, 2));
  console.log('Desktop QA evidence:', root);
  await app?.close().catch(() => {});
}
