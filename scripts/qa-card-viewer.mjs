import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

const before = process.argv.includes('--before');
const installed = process.argv.slice(2).find(arg => arg !== '--before');
await mkdir('.local', { recursive: true });
const folder = await mkdtemp(resolve('.local/card-viewer-qa-'));
const profile = join(folder, 'profile');
const app = await _electron.launch({
  executablePath: resolve(installed ?? 'node_modules/electron/dist/electron.exe'),
  ...(installed ? {} : { args: ['.'] }),
  env: { ...process.env, NOVEL_STUDIO_DATA_DIR: profile, NOVEL_STUDIO_NO_MODEL: '1', NOVEL_STUDIO_TEST_HIDDEN: '1' }
});
const report = {};
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '参考库', exact: true }).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, fileURLToPath(new URL('./fixtures/xiyou/result.zip', import.meta.url)));
  await page.getByRole('button', { name: '导入标准结果包' }).click();
  await page.getByRole('button', { name: '已查看诊断，确认入库' }).click();
  await page.getByText('已入库。', { exact: false }).waitFor();
  const query = page.locator('#library-query');
  if (!await query.isVisible()) await page.getByRole('button', { name: '检索', exact: true }).first().click();
  await query.fill('水帘洞');
  await query.press('Enter');
  const result = page.getByRole('region', { name: '参考库检索' }).locator('.knowledge-card').first();
  await result.getByRole('button', { name: '水簾洞', exact: true }).click();
  let dialog = page.getByRole('dialog');
  if (before) {
    await dialog.locator('textarea').waitFor();
    assert.equal(await dialog.locator('textarea').inputValue(), await dialog.locator('.knowledge-card p').textContent());
    report.duplicateConfirmed = true;
    await page.screenshot({ path: join(folder, 'before.png') });
  } else {
    await dialog.getByRole('button', { name: '编辑', exact: true }).waitFor();
    assert.equal(await dialog.locator('textarea,input,select').count(), 0);
    assert.equal(await dialog.locator('.knowledge-card p').count(), 1);
    await dialog.locator('.evidence-link').first().waitFor({ state: 'visible' });
    assert.equal(await dialog.locator('.evidence-link').first().isVisible(), true);
    await page.screenshot({ path: join(folder, 'read-wide.png') });
    await dialog.locator('.evidence-link').first().click();
    await page.locator('[data-highlighted=yes]').first().waitFor();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    dialog = page.getByRole('dialog');
    const original = await dialog.locator('.knowledge-card p').textContent();
    await dialog.getByRole('button', { name: '编辑', exact: true }).click();
    assert.equal(await dialog.locator('.knowledge-card').count(), 0);
    await dialog.getByLabel('内容', { exact: true }).fill(original + '取消探针');
    await dialog.getByRole('button', { name: '取消编辑', exact: true }).click();
    assert.equal(await dialog.locator('.knowledge-card p').textContent(), original);
    await dialog.getByRole('button', { name: '编辑', exact: true }).click();
    await page.screenshot({ path: join(folder, 'edit-wide.png') });
    await dialog.getByLabel('内容', { exact: true }).fill(original + '\n保存探针');
    await dialog.getByRole('button', { name: '保存知识卡', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await result.getByRole('button', { name: '水簾洞', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '编辑', exact: true }).waitFor();
    assert.match(await dialog.locator('.knowledge-card p').textContent(), /保存探针/);
    assert.equal(await dialog.locator('textarea,input,select').count(), 0);
    await page.setViewportSize({ width: 900, height: 700 });
    await page.screenshot({ path: join(folder, 'read-narrow.png') });
    assert.ok(await dialog.evaluate(p => p.scrollWidth <= p.clientWidth + 1));
    report.passed = true;
    report.evidence = true;
    report.cancelAndSave = true;
  }
} catch (error) {
  report.error = String(error);
  const page = app.windows()[0];
  if (page) {
    await writeFile(join(folder, 'failure.txt'), await page.locator('body').innerText());
    await page.screenshot({ path: join(folder, 'failure.png') }).catch(() => {});
  }
  throw error;
} finally {
  await writeFile(join(folder, 'report.json'), JSON.stringify(report, null, 2));
  await app.close();
  console.log(folder, report);
}
