import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { _electron } from 'playwright';

const [executableArg, outputArg, ...flags] = process.argv.slice(2);
const executable = resolve(executableArg ?? 'node_modules/electron/dist/electron.exe');
const output = resolve(outputArg ?? '.local/agy-model-release-021/ui');
const profile = join(output, 'profile');
await mkdir(profile, { recursive: true });
const packaged = Boolean(executableArg);
const env = { ...process.env, LOCALAPPDATA: 'C:/Users/78828/AppData/Local',
  NOVEL_STUDIO_DATA_DIR: profile, NOVEL_STUDIO_KB_V2: '1', NOVEL_STUDIO_NO_MODEL: '1', NOVEL_STUDIO_TEST_HIDDEN: '1' };
const report = { realTest: flags.includes('--real-test'), profile };
let app;
async function launch() {
  app = await _electron.launch({ executablePath: executable, args: packaged ? [] : ['.'], env });
  const page = await app.firstWindow();
  page.setDefaultTimeout(45000);
  await page.getByRole('button', { name: '资料与设置', exact: true }).click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: 'AI 辅助检索', exact: true }).click();
  await page.getByRole('heading', { name: '检索模型来源', exact: true }).waitFor();
  return page;
}
const invoke = (page, method, args = {}) => page.evaluate(async ({ method, args }) => {
  const result = await window.studio.invoke(method, args);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}, { method, args });
try {
  let page = await launch();
  console.log('settings opened');
  await invoke(page, 'retrieval.config.save', { newProfile: true, name: '合成API配置',
    endpoint: 'http://127.0.0.1:1/chat/completions', model: 'synthetic', apiKey: 'qa-synthetic-only' });
  const apiPath = join(profile, 'retrieval-api.json');
  const before = await readFile(apiPath);
  await page.getByRole('region', { name: '检索模型来源', exact: true }).getByLabel('模型来源', { exact: true }).selectOption('agy');
  await page.getByRole('button', { name: '刷新反重力模型', exact: true }).click();
  await page.getByText(/已刷新 \d+ 个 Gemini 模型选项/).waitFor();
  const catalogue = await invoke(page, 'retrieval.provider.get');
  report.catalogue = catalogue.models;
  console.log('catalogue refreshed: ' + catalogue.models.length);
  for (const family of ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-4-carbon', 'gemini-4-hydrogen']) {
    assert.ok(catalogue.models.some(model => model.family === family), family);
  }
  await page.getByRole('region', { name: '检索模型来源', exact: true }).getByLabel('反重力模型', { exact: true }).selectOption('gemini-4-carbon');
  await page.getByRole('region', { name: '检索模型来源', exact: true }).getByLabel('思考强度', { exact: true }).selectOption('gemini-4-carbon-high');
  await page.getByRole('button', { name: '保存模型来源', exact: true }).click();
  await page.getByText('检索模型来源已保存，现有 API 配置保持不变。').waitFor();
  assert.equal((await invoke(page, 'retrieval.provider.get')).modelId, 'gemini-4-carbon-high');
  assert.deepEqual(await readFile(apiPath), before);
  console.log('manual Carbon/high saved, API bytes unchanged');
  await app.close(); app = null;
  page = await launch();
  const persisted = await invoke(page, 'retrieval.provider.get');
  assert.equal(persisted.source, 'agy');
  assert.equal(persisted.modelId, 'gemini-4-carbon-high');
  assert.equal(await page.getByRole('region', { name: '检索模型来源', exact: true }).getByLabel('模型来源', { exact: true }).inputValue(), 'agy');
  await page.getByRole('button', { name: '刷新反重力模型', exact: true }).click();
  await page.getByText(/已刷新 \d+ 个 Gemini 模型选项/).waitFor();
  assert.equal(await page.getByRole('region', { name: '检索模型来源', exact: true }).getByLabel('反重力模型', { exact: true }).inputValue(), 'gemini-4-carbon');
  assert.equal(await page.getByRole('region', { name: '检索模型来源', exact: true }).getByLabel('思考强度', { exact: true }).inputValue(), 'gemini-4-carbon-high');
  await page.getByRole('region', { name: '检索模型来源', exact: true }).getByLabel('反重力模型', { exact: true }).selectOption('gemini-3.8-flash');
  await page.getByRole('button', { name: '保存模型来源', exact: true }).click();
  await page.getByText('检索模型来源已保存，现有 API 配置保持不变。').waitFor();
  if (report.realTest) {
    // Only the fixed connection-test JSON prompt is sent; no originals or reference excerpts.
    await page.getByRole('button', { name: '测试反重力连接', exact: true }).click();
    const outcome = flags.includes('--allow-capacity')
      ? page.getByText(/连接成功：gemini-3.8-flash-low。|反重力 gemini-3.8-flash-low 服务端容量不足/).first()
      : page.getByText('连接成功：gemini-3.8-flash-low。', { exact: true });
    await outcome.waitFor({ timeout: 120000 });
    report.fixedPromptConnection = (await outcome.innerText()).includes('503') ? 'capacity correctly reported' : 'passed';
    console.log('real fixed-prompt Flash connection passed');
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await page.screenshot({ path: join(output, 'account-model-settings.png') });
  await page.getByRole('region', { name: '检索模型来源', exact: true }).getByLabel('模型来源', { exact: true }).selectOption('api');
  await page.getByRole('button', { name: '保存模型来源', exact: true }).click();
  await page.getByRole('heading', { name: 'AI 辅助检索', exact: true }).waitFor();
  const config = await invoke(page, 'retrieval.config.get');
  assert.equal(config.model, 'synthetic');
  assert.equal(config.hasKey, true);
  assert.deepEqual(await readFile(apiPath), before);
  report.apiConfigPreserved = true;
  report.passed = true;
} finally {
  if (app) await app.close();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.passed, models: report.catalogue?.length,
  persistedCarbonHigh: true, apiConfigPreserved: report.apiConfigPreserved, fixedPromptConnection: report.fixedPromptConnection }));
