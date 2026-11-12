import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

await mkdir('.local', { recursive: true });
const folder = await mkdtemp(resolve('.local/workspace-ui-'));
const profile = join(folder, 'profile');
const installed = process.argv[2];
const app = await _electron.launch({
  executablePath: resolve(installed ?? 'node_modules/electron/dist/electron.exe'),
  ...(installed ? {} : { args: ['.'] }),
  env: { ...process.env, NOVEL_STUDIO_DATA_DIR: profile, NOVEL_STUDIO_NO_MODEL: '1', NOVEL_STUDIO_TEST_HIDDEN: '1' }
});
const report = { checks: [] };
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  const go = name => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();
  const section = name => page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name, exact: true }).click();
  await go('参考库');
  await page.getByRole('button', { name: '有哪些装逼（打脸）的情节？', exact: true }).click();
  assert.equal(await page.locator('#library-query').inputValue(), '有哪些装逼（打脸）的情节？');
  assert.equal(await page.locator('.exchange').count(), 0);
  await page.getByRole('checkbox', { name: '外部 AI 辅助' }).check();
  await page.getByText('问题和候选卡摘录将发送到所配服务。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '接口设置', exact: true }).click();
  const retrieval = page.getByRole('region', { name: 'AI 辅助检索', exact: true });
  await retrieval.getByRole('heading', { name: 'AI 辅助检索', exact: true }).waitFor();
  await retrieval.getByLabel('Chat Completions 地址').fill('https://api.example.test/v1/chat/completions');
  await retrieval.getByLabel('模型名称').fill('retrieval-draft-unsaved');
  await section('AI 扩写');
  assert.equal(await page.getByRole('region', { name: 'AI 扩写', exact: true }).getByLabel('模型名称').inputValue(), '');
  await section('AI 辅助检索');
  assert.equal(await retrieval.getByLabel('模型名称').inputValue(), 'retrieval-draft-unsaved');
  report.checks.push('检索示例只填入草稿、模式告知、直达检索配置、分组切换保留未保存内容、扩写独立');
  for (const width of [1460, 900]) {
    await page.setViewportSize({ width, height: 930 });
    for (const name of ['外观与阅读', '写作偏好', 'AI 辅助检索', 'AI 扩写', '本机资料']) {
      await section(name);
      assert.equal(await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name, exact: true }).getAttribute('aria-current'), 'page');
      assert.ok(await page.locator('.settings-panel').evaluate(p => p.scrollWidth <= p.clientWidth + 1));
      await page.screenshot({ path: join(folder, `settings-${name}-${width}.png`) });
    }
  }
  await go('参考库');
  await page.getByRole('checkbox', { name: '外部 AI 辅助' }).uncheck();
  assert.equal(await page.locator('#library-query').inputValue(), '有哪些装逼（打脸）的情节？');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, fileURLToPath(new URL('./fixtures/xiyou/result.zip', import.meta.url)));
  await page.getByRole('button', { name: '导入标准结果包' }).click();
  await page.getByRole('button', { name: '已查看诊断，确认入库' }).click();
  await page.getByText('已入库。', { exact: false }).waitFor();
  if (!await page.locator('#library-query').isVisible()) await page.getByRole('button', { name: '检索', exact: true }).first().click();
  await page.locator('#library-query').fill('水帘洞');
  await page.locator('#library-query').press('Enter');
  const card = page.getByRole('region', { name: '参考库检索' }).locator('.knowledge-card').first();
  await card.waitFor();
  await page.screenshot({ path: join(folder, 'search-results-900.png') });
  await card.locator('.evidence-link').first().click();
  await page.locator('[data-highlighted=yes]').first().waitFor();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '书架', exact: true }).click();
  await page.getByRole('heading', { name: '参考书架', exact: true }).waitFor();
  await page.screenshot({ path: join(folder, 'bookshelf-900.png') });
  report.checks.push('1460／900 五个设置分组无横向溢出、检索草稿保留、标准导入、真实检索、证据返回及书架');
  report.passed = true;
} finally {
  await writeFile(join(folder, 'report.json'), JSON.stringify(report, null, 2));
  await app.close();
  console.log(folder, report);
}
