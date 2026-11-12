import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { _electron } from 'playwright';

const [executable, profileArg, outputArg, ...flags] = process.argv.slice(2);
if (!executable || !profileArg || !outputArg) throw new Error('Usage: qa-installed-v2.mjs <exe> <isolated profile> <reports> [--ai]');
const profile = resolve(profileArg);
const output = resolve(outputArg);
const formal = resolve(process.env.USERPROFILE, 'AppData/Local/Novel Studio');
assert.notEqual(profile.toLowerCase(), formal.toLowerCase(), 'This test must use an isolated profile');
await mkdir(output, { recursive: true });
const env = { ...process.env, NOVEL_STUDIO_DATA_DIR: profile, NOVEL_STUDIO_TEST_HIDDEN: '1' };
for (const key of ['NOVEL_STUDIO_KB_V2', 'NOVEL_STUDIO_AGY_RETRIEVAL', 'NOVEL_STUDIO_NO_MODEL', 'NOVEL_STUDIO_NO_AGY_FALLBACK']) delete env[key];
const report = { aiRequested: flags.includes('--ai') };
const app = await _electron.launch({ executablePath: resolve(executable), env });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  const invoke = (method, args = {}) => page.evaluate(async ({ method, args }) => {
    const result = await window.studio.invoke(method, args);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.value;
  }, { method, args });
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  assert.equal(report.packaged, true);
  report.info = await invoke('app.info');
  assert.equal(report.info.version, '0.2.0');
  assert.equal(report.info.kbV2, true);
  const listing = await invoke('reference.list');
  assert.equal(listing.works.length, 27);
  report.works = listing.works.length;
  report.volumes = listing.works.reduce((n, w) => n + w.volumes.length, 0);
  assert.equal(report.volumes, 278);
  const writing = await invoke('writing.list');
  report.originalWorks = writing.works?.length ?? (Array.isArray(writing) ? writing.length : null);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '参考库', exact: true }).click();
  await page.getByRole('heading', { name: '创作参考检索 (KB v2)' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '导入标准结果包', exact: true }).count(), 0);
  assert.equal(await page.getByRole('group', { name: 'KB v2 检索模式' }).locator('button').count(), 3);
  const blocked = await page.evaluate(() => window.studio.invoke('import.commit', { batchId: 'test' }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'IMPORT_V2_UNSUPPORTED');
  await page.getByRole('group', { name: 'KB v2 检索模式' }).getByRole('button', { name: '本地混合', exact: true }).click();
  console.log('27-book UI and import guard passed');
  const query = page.locator('#library-query');
  await query.fill('制服与礼服穿搭细节');
  await query.press('Enter');
  await page.getByText('本地三层混合检索', { exact: false }).first().waitFor({ timeout: 90000 });
  report.localCardCount = await page.locator('.knowledge-card').count();
  assert.ok(report.localCardCount > 0);
  report.afterLocal = await invoke('app.info');
  assert.equal(report.afterLocal.embeddingMode, 'gpu');
  await page.screenshot({ path: join(output, 'local-search.png') });
  await page.locator('.knowledge-card .evidence-link').first().click();
  await page.locator('[data-highlighted=yes]').first().waitFor();
  report.highlightedParagraphs = await page.locator('[data-highlighted=yes]').count();
  console.log('Vulkan local search and evidence highlight passed');
  if (report.aiRequested) {
    const config = await invoke('retrieval.config.get');
    assert.equal(config.profiles.length, 0, 'AI fallback test requires an unconfigured isolated API profile');
    assert.equal(report.info.agyFallbackAvailable, true);
    for (const mode of ['fast', 'deep']) {
      const started = Date.now();
      const response = await invoke('search.query', { requestId: 'installed-v2-' + mode, query: mode === 'fast' ? '有哪些约会情节？' : '有哪些制服或礼服的具体描写？', mode, limit: 6 });
      report[mode] = { elapsedMs: Date.now() - started, degraded: response.degraded, hits: response.hits.length, reason: response.reason };
      assert.equal(response.degraded, false, JSON.stringify(report[mode]));
      assert.ok(response.hits.length > 0);
      console.log(mode + ' fallback passed');
    }
  }
  report.passed = true;
} finally {
  await app.close();
  await writeFile(join(output, 'installed-v2.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
