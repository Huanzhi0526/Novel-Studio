import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

const installed = process.argv[2] ? resolve(process.argv[2]) : null;
await mkdir('.local', { recursive: true });
const directory = await mkdtemp(resolve('.local/visual-qa-'));
const profile = join(directory, 'profile');
await mkdir(profile);
if (process.argv[3]) await symlink(resolve(process.argv[3]), join(profile, 'model'), 'junction');
const application = await _electron.launch({
  executablePath: installed ?? resolve('node_modules/electron/dist/electron.exe'),
  args: installed ? [] : ['.'],
  env: { ...process.env, NOVEL_STUDIO_DATA_DIR: profile, NOVEL_STUDIO_TEST_HIDDEN: '1' }
});

try {
  const page = await application.firstWindow();
  const tab = name => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();
  const sideTool = name => page.getByRole('group', { name: '写作资料速查' }).getByRole('button', { name, exact: true });
  const capture = async name => {
    const filename = join(directory, name + '.png');
    const captured = await application.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const currentFrame = async () => {
        await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        window.webContents.invalidate();
        return window.webContents.capturePage(undefined, { stayAwake: true });
      };
      const image = await Promise.race([
        currentFrame(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('capture timeout')), 4500))
      ]);
      return image.toPNG().toString('base64');
    });
    await writeFile(filename, Buffer.from(captured, 'base64'));
  };
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.setBackgroundThrottling(false);
    window.setSize(1420, 875);
    window.showInactive();
  });
  const bookshelf = page.getByRole('region', { name: '我的作品' });
  const newWork = bookshelf.getByRole('button', { name: '新建作品', exact: true });
  await newWork.waitFor();
  await capture('empty');
  await newWork.click();
  await page.locator('#writing-title').fill('潮汐过后');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.insertText([
    '信号灯在黎明前熄灭了。',
    '',
    '林遥从栈桥尽头走回来，把潮湿的手套搁在窗边。信纸还压在玻璃杯下，墨迹尚未干透。她走时这里空无一人，钥匙也一直在自己的口袋里。',
    '',
    '隔着雾，渔船正一艘一艘离开港口。她数到第七艘，听见楼梯上传来一声轻响。'
  ].join('\n'));
  await page.getByText('已保存', { exact: true }).first().waitFor();
  await capture('writing');
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  const currentWork = bookshelf.getByRole('button', { name: '潮汐过后', exact: true });
  await currentWork.waitFor();
  await capture('bookshelf');
  await currentWork.click();
  await tab('资料与设置');
  await page.getByRole('button', { name: '松绿', exact: true }).click();
  await tab('原创写作');
  await page.getByRole('button', { name: '写作设置', exact: true }).click();
  const preferences = page.getByRole('complementary', { name: '写作设置', exact: true });
  await preferences.getByRole('button', { name: '米纸', exact: true }).click();
  await preferences.getByRole('button', { name: '方格', exact: true }).click();
  await preferences.getByRole('button', { name: '宋体', exact: true }).click();
  await preferences.getByRole('checkbox', { name: '段首缩进两字' }).check();
  await capture('writing-preferences');
  await preferences.getByRole('button', { name: '关闭侧栏', exact: true }).click();
  await sideTool('大纲').click();
  await page.getByRole('button', { name: '新建大纲', exact: true }).click();
  await page.locator('#writing-title').fill('第一卷 · 归港');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('heading', { name: '第一卷 · 归港', exact: true, level: 1 }).waitFor();
  await editor.click();
  await page.keyboard.insertText('开篇：灯在黎明前熄灭。\n转折：信纸出现，林遥决定下到码头。');
  await page.locator('.doc-title').filter({ hasText: '第一章' }).click();
  if ((await sideTool('大纲').getAttribute('aria-pressed')) !== 'true') await sideTool('大纲').click();
  const outline = page.getByRole('complementary', { name: '大纲速查' });
  await outline.getByRole('button', { name: '第一卷 · 归港', exact: true }).click();
  await outline.getByText(/灯在黎明前熄灭/).waitFor();
  await capture('writing-outline');
  await outline.getByRole('button', { name: '关闭侧栏', exact: true }).click();
  await page.getByRole('button', { name: '专注', exact: true }).click();
  await page.getByRole('button', { name: '退出专注', exact: true }).waitFor();
  await capture('writing-focus');
  await page.getByRole('button', { name: '退出专注', exact: true }).click();
  await application.evaluate(({ dialog }, filename) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
  }, fileURLToPath(new URL('./fixtures/xiyou/result.zip', import.meta.url)));
  await tab('参考库');
  await page.getByRole('button', { name: '导入标准结果包' }).click();
  await page.getByRole('button', { name: '已查看诊断，确认入库' }).click();
  await page.getByText('已入库。', { exact: false }).waitFor();
  await page.getByRole('button', { name: '检索', exact: true }).click();
  const librarySearch = page.getByRole('region', { name: '参考库检索' });
  await librarySearch.getByRole('textbox', { name: '检索问题' }).fill('孫悟空為何要出海求師？');
  await librarySearch.getByRole('textbox', { name: '检索问题' }).press('Enter');
  await librarySearch.locator('.knowledge-card').first().waitFor({ timeout: 25000 });
  await capture('reference-search');
  await tab('原创写作');
  assert.match(await editor.innerText(), /信号灯在黎明前熄灭了/);
  await sideTool('参考').click();
  await page.locator('#sidebar-query').fill('孫悟空為何要出海求師？');
  await page.locator('#sidebar-query').press('Enter');
  await page.locator('.conversation-sidebar .knowledge-card').first().waitFor({ timeout: 25000 });
  assert.match(await editor.innerText(), /信号灯在黎明前熄灭了/);
  assert.equal(await page.locator('#sidebar-query').evaluate(node => node.getBoundingClientRect().bottom <= innerHeight), true);
  await capture('writing-search');
  await page.locator('.conversation-sidebar .evidence-link').first().click();
  const reader = page.locator('.reader-workspace');
  await reader.locator('[data-highlighted=yes]').first().waitFor();
  await capture('reader').catch(error => console.log('Reader screenshot unavailable:', error.message));
  await reader.getByRole('button', { name: '目录', exact: true }).click();
  await capture('reader-toc').catch(error => console.log('Reader directory screenshot unavailable:', error.message));
  await reader.getByRole('button', { name: '返回', exact: true }).click();
  await reader.waitFor({ state: 'hidden' });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 710));
  await page.waitForFunction(() => innerWidth < 1050);
  await capture('compact').catch(error => console.log('Compact screenshot unavailable:', error.message));
  console.log(directory);
} finally {
  await application.close();
}
