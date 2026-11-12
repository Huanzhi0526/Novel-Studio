import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { _electron } from 'playwright';

const profile = resolve('.local/kb-v2-mvp/data/app-profile');
const reportsDir = resolve('.local/kb-v2-mvp/reports');
await mkdir(reportsDir, { recursive: true });

const executable = resolve('node_modules/electron/dist/electron.exe');
// Simulate a bare external Windows PowerShell environment (no shell proxy vars, no ANTIGRAVITY_* vars)
const bareUserEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^(http_proxy|https_proxy|all_proxy|antigravity_|agy_)/i.test(k))
);
const app = await _electron.launch({
  executablePath: executable,
  args: ['.'],
  env: {
    ...bareUserEnv,
    NOVEL_STUDIO_DATA_DIR: profile,
    NOVEL_STUDIO_KB_V2: '1',
    NOVEL_STUDIO_TEST_HIDDEN: '1'
  }
});

const report = {};
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1360, height: 860 });

  const invoke = (method, args = {}) => page.evaluate(async ({ method, args }) => {
    const r = await window.studio.invoke(method, args);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.value;
  }, { method, args });

  report.info = await invoke('app.info');
  assert.equal(report.info.kbV2, true, 'kbV2 must be active');
  assert.equal(report.info.modelConfigured, true, 'Local Qwen3 embedding model must be detected');
  assert.equal(report.info.dataDir, profile);

  const refList = await invoke('reference.list');
  assert.equal(refList.works.length, 27, 'All 27 reference works should be listed');
  report.works = refList.works.map(w => ({ title: w.title, volumes: w.volumes.length }));

  // Navigate to Reference Library
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '参考库', exact: true }).click();
  await page.getByRole('heading', { name: '创作参考检索 (KB v2)' }).waitFor({ timeout: 10000 });

  const modeGroup = page.getByRole('group', { name: 'KB v2 检索模式' });
  await modeGroup.waitFor();
  assert.equal(await modeGroup.locator('button').count(), 3);

  // 1. Test Local Hybrid mode in UI (cold/warmup + warm late-volume query)
  await modeGroup.getByRole('button', { name: '本地混合', exact: true }).click();
  const queryBox = page.locator('#library-query');
  await queryBox.fill('制服与礼服穿搭细节');
  await queryBox.press('Enter');
  await page.getByText('本地三层混合检索', { exact: false }).waitFor({ timeout: 25000 });
  report.localCardCount = await page.locator('.knowledge-card').count();
  assert.ok(report.localCardCount >= 3, 'Local hybrid query should render multi-layer cards');
  report.infoAfterLocal = await invoke('app.info');

  const tWarmLocal = Date.now();
  const lateVolRes = await invoke('search.query', { requestId: 'qa-warm-late-vol', query: '白玉莉子与学生会潜入教堂', mode: 'local', limit: 8 });
  report.localWarmElapsedMs = Date.now() - tWarmLocal;
  report.lateVolHitCount = lateVolRes.hits.length;
  assert.ok(report.lateVolHitCount >= 2, 'Late-series volumes (Vol 5-8) should be indexed and searchable');

  // Clear and test AI Fast mode in UI
  const tFast = Date.now();
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await modeGroup.getByRole('button', { name: 'AI 快速', exact: true }).click();
  await queryBox.fill('有哪些约会情节？');
  await queryBox.press('Enter');
  await page.locator('.v2-synthesis').first().waitFor({ timeout: 90000 });
  report.fastElapsedMs = Date.now() - tFast;
  report.fastSynthesis = await page.locator('.v2-synthesis').first().innerText();
  report.fastCardCount = await page.locator('.knowledge-card').count();
  assert.ok(report.fastCardCount >= 2, 'AI Fast mode should return curated cards');

  // Clear and test AI Deep mode in UI as well
  const tDeep = Date.now();
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await modeGroup.getByRole('button', { name: 'AI 深度翻书', exact: true }).click();
  await queryBox.fill('有哪些能力或魔法的使用限制与代价？');
  await queryBox.press('Enter');
  await page.locator('.v2-synthesis').first().waitFor({ timeout: 120000 });
  report.deepElapsedMs = Date.now() - tDeep;
  report.deepSynthesis = await page.locator('.v2-synthesis').first().innerText();
  report.deepCardCount = await page.locator('.knowledge-card').count();
  assert.ok(report.deepCardCount >= 2, 'AI Deep mode should return verified cards');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await page.screenshot({ path: join(reportsDir, 'ui-search-v2.png') });

  // 2. Click [1] evidence link and verify Reader opens at highlighted paragraphs
  await page.locator('.knowledge-card .evidence-link').first().click();
  await page.locator('[data-highlighted=yes]').first().waitFor({ timeout: 15000 });
  report.highlightedParagraphs = await page.locator('[data-highlighted=yes]').count();
  assert.ok(report.highlightedParagraphs >= 1);
  await page.screenshot({ path: join(reportsDir, 'ui-reader-v2.png') });

  report.passed = true;
} finally {
  await app.close();
}

// Verify library.sqlite vs reference-v2.sqlite decoupling on disk
const libDb = new DatabaseSync(join(profile, 'library.sqlite'), { readOnly: true });
report.librarySqliteRefWorks = libDb.prepare('SELECT count(*) AS c FROM reference_works').get().c;
libDb.close();
assert.equal(report.librarySqliteRefWorks, 0, 'Original writing library.sqlite must hold zero reference books');

await writeFile(join(reportsDir, 'ui-smoke-v2.json'), JSON.stringify(report, null, 2));
console.log('UI Smoke V2 Passed:', JSON.stringify(report, null, 2));
