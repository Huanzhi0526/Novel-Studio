import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

await mkdir('.local', { recursive: true });
const folder = await mkdtemp(resolve('.local/retrieval-qa-'));
const profile = join(folder, 'profile');
const calls = [];
let invalid = false;
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  calls.push(body);
  const user = JSON.parse(body.messages[1].content.startsWith('{') ? body.messages[1].content : '{}');
  const text = invalid ? '{"matches":[9999]}' : user.candidates
    ? JSON.stringify({ matches: [user.candidates.find(c => c.title.includes('水簾洞'))?.id ?? 1] })
    : user.question ? '{"queries":["水帘洞"]}' : '连接正常';
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: text } }] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const executable = resolve(process.argv[2] ?? 'node_modules/electron/dist/electron.exe');
const app = await _electron.launch({
  executablePath: executable, ...(process.argv[2] ? {} : { args: ['.'] }),
  env: { ...process.env, NOVEL_STUDIO_DATA_DIR: profile, NOVEL_STUDIO_NO_MODEL: '1', NOVEL_STUDIO_TEST_HIDDEN: '1' }
});
const report = {};
try {
  const page = await app.firstWindow();
  const invoke = (method, args = {}) => page.evaluate(async ({ method, args }) => {
    const r = await window.studio.invoke(method, args);
    if (!r.ok) throw Error(JSON.stringify(r.error));
    return r.value;
  }, { method, args });
  report.info = await invoke('app.info');
  assert.equal(report.info.dataDir, profile);
  await page.getByRole('button', { name: '资料与设置', exact: true }).click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: 'AI 辅助检索', exact: true }).click();
  const settings = page.getByRole('region', { name: 'AI 辅助检索', exact: true });
  await settings.getByLabel('Chat Completions 地址').fill(`http://127.0.0.1:${server.address().port}/chat/completions`);
  await settings.getByLabel('模型名称').fill('qa-model');
  await settings.getByLabel('API Key（可选）').fill('qa-private-key');
  await settings.getByRole('button', { name: '保存配置', exact: true }).click();
  await settings.getByText('AI 辅助检索配置已保存。', { exact: true }).waitFor();
  assert.equal(await settings.getByLabel('API Key（可选）').inputValue(), '');
  const stored = await readFile(join(profile, 'retrieval-api.json'), 'utf8');
  assert.ok(!stored.includes('qa-private-key'));
  assert.equal((await invoke('expand.config.get')).profiles.length, 0);
  await settings.getByRole('button', { name: '测试连接', exact: true }).click();
  await settings.getByText('连接成功，模型已返回测试内容。', { exact: true }).waitFor();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '参考库', exact: true }).click();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, fileURLToPath(new URL('./fixtures/xiyou/result.zip', import.meta.url)));
  await page.getByRole('button', { name: '导入标准结果包' }).click();
  await page.getByRole('button', { name: '已查看诊断，确认入库' }).click();
  await page.getByText('已入库。', { exact: false }).waitFor();
  const query = page.locator('#library-query');
  if (!await query.isVisible()) await page.getByRole('button', { name: '检索', exact: true }).first().click();
  await page.getByRole('checkbox', { name: '外部 AI 辅助' }).check();
  await query.fill('瀑布后面的住处在哪里');
  await query.press('Enter');
  await page.getByText('已通过外部 AI 拆解问题并筛选候选卡。', { exact: true }).waitFor({ timeout: 30000 });
  const card = page.locator('.knowledge-card').filter({ hasText: '水簾洞' }).first();
  await card.locator('.evidence-more > summary').click();
  await card.locator('.evidence-link').first().click();
  await page.locator('[data-highlighted=yes]').first().waitFor();
  report.evidence = true;
  await page.getByRole('button', { name: '返回', exact: true }).click();
  invalid = true;
  const fallback = await invoke('search.query', { query: '水帘洞', useAi: true, requestId: crypto.randomUUID() });
  assert.equal(fallback.degraded, true);
  assert.match(fallback.reason, /外部 AI 辅助未完成/);
  const count = calls.length;
  await invoke('search.query', { query: '水帘洞', useAi: false, requestId: crypto.randomUUID() });
  assert.equal(calls.length, count);
  for (const call of calls) {
    const text = JSON.stringify(call.messages);
    assert.ok(!text.includes('original_docs') && !text.includes('normalized_payload'));
  }
  report.keyEncrypted = true;
  report.configIndependent = true;
  report.fallback = true;
  report.calls = calls.length;
  await page.getByRole('button', { name: '资料与设置', exact: true }).click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: 'AI 辅助检索', exact: true }).click();
  await settings.scrollIntoViewIfNeeded();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await page.screenshot({ path: join(folder, 'settings-wide.png') });
  await page.setViewportSize({ width: 900, height: 700 });
  await settings.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(folder, 'settings-narrow.png') });
  report.passed = true;
} finally {
  await writeFile(join(folder, 'report.json'), JSON.stringify(report, null, 2));
  await app.close();
  await new Promise(resolve => server.close(resolve));
  console.log(folder, report);
}
