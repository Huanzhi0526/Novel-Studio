import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { _electron } from 'playwright';

const [executable, version] = process.argv.slice(2);
if (!executable || !version) throw new Error('Usage: node scripts/qa-installed-smoke.mjs <installed exe> <version>');
await mkdir('.local', { recursive: true });
const profile = await mkdtemp(resolve('.local/installed-smoke-'));
const app = await _electron.launch({
  executablePath: resolve(executable),
  env: { ...process.env, NOVEL_STUDIO_TEST_HIDDEN: '1', NOVEL_STUDIO_NO_MODEL: '1', NOVEL_STUDIO_DATA_DIR: profile }
});
try {
  const page = await app.firstWindow();
  await page.getByRole('region', { name: '我的作品' }).waitFor();
  const info = await page.evaluate(() => window.studio.invoke('app.info'));
  assert.equal(info.ok, true);
  assert.equal(info.value.version, version);
  await page.getByRole('button', { name: '资料与设置', exact: true }).click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: 'AI 扩写', exact: true }).click();
  await page.getByRole('heading', { name: 'AI 扩写', exact: true }).waitFor();
  const settings = await page.evaluate(() => window.studio.invoke('expand.config.get'));
  assert.equal(settings.ok, true);
  assert.equal(settings.value.endpoint, '');
  console.log(`Installed ${version} launched with an isolated profile, writing shelf and settings are available.`);
} finally {
  await app.close();
}
