import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node scripts/qa-installed-model.mjs <installed exe> <extracted model folder>');
const exe = resolve(process.argv[2]);
const model = resolve(process.argv[3]);
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(resolve('.local/installed-model-qa-'));
const profile = join(directory, 'profile');
await mkdir(profile);
await symlink(model, join(profile, 'model'), 'junction');
const app = await _electron.launch({
  executablePath: exe,
  env: { ...process.env, NOVEL_STUDIO_DATA_DIR: profile, NOVEL_STUDIO_TEST_HIDDEN: '1' }
});

try {
  const page = await app.firstWindow();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '参考库', exact: true }).click();
  const info = await page.evaluate(() => window.studio.invoke('app.info'));
  assert.equal(info.value.modelConfigured, true);
  await app.evaluate(({ dialog }, filename) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
  }, fileURLToPath(new URL('./fixtures/xiyou/result.zip', import.meta.url)));
  await page.getByRole('button', { name: '导入标准结果包' }).click();
  await page.getByRole('button', { name: '已查看诊断，确认入库' }).click();
  await page.getByText('已入库。', { exact: false }).waitFor();
  await page.getByRole('button', { name: '检索', exact: true }).click();
  const query = '瀑布後面的洞府叫什麼？';
  await page.locator('#library-query').fill(query);
  await page.locator('#library-query').press('Enter');
  const results = page.getByRole('region', { name: '参考库检索' });
  await results.locator('.knowledge-card').first().waitFor({ timeout: 30000 });
  const observed = await page.evaluate(async text => window.studio.invoke('search.query', {
    requestId: crypto.randomUUID(), query: text, limit: 5
  }), query);
  assert.equal(observed.ok, true);
  assert.equal(observed.value.degraded, false);
  assert.ok(observed.value.channels.semantic > 0);
  assert.ok(observed.value.hits.some(card => card.title.includes('水簾洞')));
  await results.locator('.evidence-link').first().click();
  await page.locator('[data-highlighted=yes]').first().waitFor();
  const report = {
    version: info.value.version, electron: info.value.electron, model: info.value.model,
    query, elapsedMs: observed.value.elapsed, channels: observed.value.channels,
    titles: observed.value.hits.map(card => card.title), evidenceOpened: true
  };
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(report);
  console.log(directory);
} finally {
  await app.close();
}
