import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

const before = process.argv.includes('--before');
const installed = process.argv.slice(2).find(arg => arg !== '--before');
await mkdir('.local', { recursive: true });
const folder = await mkdtemp(resolve('.local/card-markdown-qa-'));
const app = await _electron.launch({
  executablePath: resolve(installed ?? 'node_modules/electron/dist/electron.exe'),
  ...(installed ? {} : { args: ['.'] }),
  env: { ...process.env, NOVEL_STUDIO_DATA_DIR: join(folder, 'profile'), NOVEL_STUDIO_NO_MODEL: '1', NOVEL_STUDIO_TEST_HIDDEN: '1' }
});
const rich = `水簾洞是猴群发现并进入的洞府。本段为公版样本的格式验收，标签仅作显示测试。

## 检索标签
- 身份｜洞府、猴群居所
- 关系｜猴群共同居住
- 代价｜须穿越瀑布、不代表没有风险
- 情节机制｜主动探查、发现新空间
- 场景｜瀑布后方、洞府内部
- 自定义分组｜保留原词、不得猜测属性

## 关键情节
猴王**主动穿过瀑布**，发现洞府，再将信息带回猴群。[1]

### 进入条件
1. 穿过瀑布。
2. 确认洞内可供居住。

> 水簾洞的原文以证据入口为准。[1]

## 普通列表
- 身份｜这一行不是检索标签，不应变成彩色标签。

检索标签｜旧式标签、纯文本兼容

## 不受支持的格式
[外部链接](https://example.invalid/markdown-probe)

![图片](https://example.invalid/markdown-image)

<script>window.markdownExecuted = true</script>

<img src="https://example.invalid/html-image" onerror="window.markdownExecuted=true">
`;
const report = {};
try {
  const page = await app.firstWindow();
  const failures = [];
  page.on('pageerror', error => failures.push(String(error)));
  const requests = [];
  page.on('request', request => { if (request.url().includes('example.invalid')) requests.push(request.url()); });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await page.setViewportSize({ width: 1460, height: 1000 });
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
  const open = async () => {
    await result.getByRole('button', { name: '水簾洞', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '编辑', exact: true }).waitFor();
    return page.getByRole('dialog');
  };
  let dialog = await open();
  const cardBefore = await page.evaluate(async () => {
    const works = (await window.studio.invoke('reference.list')).value.works;
    const cards = (await window.studio.invoke('reference.listCards', { workId: works[0].work_id })).value.cards;
    return cards.find(card => card.title === '水簾洞');
  });
  assert.equal(await dialog.locator(before ? '.knowledge-card p' : '.card-content p').count(), 1);
  await dialog.getByRole('button', { name: '编辑', exact: true }).click();
  await dialog.getByLabel('内容', { exact: true }).fill(rich);
  await dialog.getByRole('button', { name: '保存知识卡', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  dialog = await open();
  if (before) {
    assert.match(await dialog.locator('.knowledge-card').innerText(), /\*\*主动穿过瀑布\*\*/);
    assert.match(await dialog.locator('.knowledge-card').innerText(), /## 检索标签/);
    assert.equal(await dialog.locator('.card-tag').count(), 0);
    await page.screenshot({ path: join(folder, 'before.png') });
    report.plainTextRenderingReproduced = true;
  } else {
    const body = dialog.locator('.card-content');
    assert.equal(await body.locator('h2').count(), 4);
    assert.equal(await body.locator('h3').count(), 1);
    assert.equal(await body.locator('strong').textContent(), '主动穿过瀑布');
    assert.equal(await body.locator('ol > li').count(), 2);
    assert.equal(await body.locator('blockquote').count(), 1);
    assert.match(await body.innerText(), /\[1\]/);
    assert.equal(await body.locator('.card-tag-group').count(), 7);
    assert.equal(await body.locator('.card-tag-group[data-tone=identity] .card-tag').count(), 2);
    assert.equal(await body.locator('.card-tag-group[data-tone=neutral]').count(), 2);
    const colors = await body.locator('.card-tag-group').evaluateAll(groups => groups.map(group => ({
      tone: group.dataset.tone,
      color: getComputedStyle(group.querySelector('.card-tag')).color
    })));
    assert.notEqual(colors.find(x => x.tone === 'identity').color, colors.find(x => x.tone === 'cost').color);
    assert.equal(await body.locator('a,img,script,iframe,style').count(), 0);
    assert.equal(await page.evaluate(() => window.markdownExecuted), undefined);
    assert.deepEqual(requests, []);
    assert.match(await body.innerText(), /<script>/);
    const categoryColors = await dialog.locator('.knowledge-card').evaluate(card => {
      const original = card.dataset.category;
      const colors = {};
      for (const category of ['character', 'setting', 'power_system', 'organization', 'event', 'storyline', 'location', 'item', 'technique']) {
        card.dataset.category = category;
        colors[category] = getComputedStyle(card.querySelector('.card-kicker > .pill')).backgroundColor;
      }
      card.dataset.category = original;
      return colors;
    });
    assert.equal(new Set(Object.values(categoryColors)).size, 9);
    await page.screenshot({ path: join(folder, 'read-wide.png') });
    await dialog.locator('.evidence-link').first().waitFor({ state: 'visible' });
    await dialog.locator('.evidence-link').first().click();
    await page.locator('[data-highlighted=yes]').first().waitFor();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '编辑', exact: true }).click();
    assert.equal(await dialog.getByLabel('内容', { exact: true }).inputValue(), rich);
    await dialog.getByLabel('内容', { exact: true }).fill(rich + '取消修改');
    await dialog.getByRole('button', { name: '取消编辑', exact: true }).click();
    const cardAfter = (await page.evaluate(async args => window.studio.invoke('reference.getCard', args), {
      workId: cardBefore.work_id, cardId: cardBefore.card_id
    })).value;
    assert.equal(cardAfter.content, rich);
    assert.deepEqual(cardAfter.evidence, cardBefore.evidence);
    assert.equal(cardAfter.revision, cardBefore.revision + 1);
    await page.setViewportSize({ width: 900, height: 760 });
    await page.screenshot({ path: join(folder, 'read-narrow.png') });
    assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    assert.ok(await dialog.locator('.card-content').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '清空', exact: true }).click();
    await query.fill('水帘洞');
    await query.press('Enter');
    const updated = page.getByRole('region', { name: '参考库检索' }).locator('.knowledge-card').filter({ has: page.getByRole('button', { name: '水簾洞', exact: true }) });
    await updated.locator('strong').waitFor({ state: 'attached' });
    assert.equal(await updated.locator('strong').count(), 1);
    assert.equal(await updated.locator('h2').count(), 4);
    await updated.locator('.card-content-clipped').waitFor({ state: 'attached' });
    assert.ok(await updated.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await page.screenshot({ path: join(folder, 'search-narrow.png') });
    assert.deepEqual(failures, []);
    Object.assign(report, { passed: true, formatting: true, tags: colors, categories: categoryColors,
      noExecutableMarkup: true, rawMarkdownPreserved: true, evidencePreserved: true, narrowLayout: true });
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
