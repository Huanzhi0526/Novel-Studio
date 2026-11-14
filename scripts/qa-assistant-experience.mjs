import { _electron } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Store } from '../app/main/store.mjs';
import { WritingService } from '../app/main/writing.mjs';
import { AssistantService } from '../app/main/assistant.mjs';

const root = resolve('.local/assistant-027/experience-' + Date.now());
await mkdir(root, { recursive: true });
const profile = join(root, 'profile');
const store = new Store(join(profile, 'library.sqlite'));
const writing = new WritingService(store);
const workId = writing.createWork({ title: '纸桥与远行（界面验收）' }).id;
const service = new AssistantService(writing, null, profile);
const e = service.entry(workId);
e.messages = [
  { role: 'user', text: '这里想给男主设置一个困境，同时推进他和女主的关系。请给我几个有因果联系的方案。' },
  { role: 'assistant', text: '## 先把两条成长线放进同一个选择\n\n这场任务的核心可以是：**他必须学会信任她，才能完成原本打算独自完成的任务。** 好感的变化来自行动，而不是任务结算后的奖励。\n\n### 方案一：有代价的合作\n\n- **任务压力**：纸桥正在坍塌，两人必须在天黑前完成修复。\n- **人物选择**：男主放弃独占成果，让女主判断关键的承重点。\n- **关系推进**：她第一次发现，自己的判断被认真对待。\n\n> 先铺垫一次他的误判，让这次信任成为有分量的改变。\n\n### 方案二：彼此看见的弱点\n\n男主熟悉操作，女主熟悉结构。一次尝试失败后，他们交换各自隐瞒的困难，重新分工。\n\n下一步可以讨论：哪一种更贴合本书的主旨，以及需要提前埋下什么伏笔。' }
];
service.saveHistory(e);
service.close();
store.close();

const env = { ...process.env, NOVEL_STUDIO_DATA_DIR: profile, NOVEL_STUDIO_TEST_HIDDEN: '1', NOVEL_STUDIO_NO_MODEL: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  executablePath: resolve(process.argv[2] ?? 'node_modules/electron/dist/electron.exe'),
  args: process.argv[2] ? [] : [resolve('.')],
  env
});
const errors = [];

async function capture(name) {
  const bytes = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.showInactive();
    try {
      await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await new Promise(resolve => setTimeout(resolve, 150));
      window.webContents.invalidate();
      const image = await window.webContents.capturePage(undefined, { stayAwake: true });
      return image.toPNG().toString('base64');
    } finally {
      window.hide();
    }
  });
  await writeFile(join(root, name), Buffer.from(bytes, 'base64'));
}

try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: '创作助手', exact: true }).click();
  const main = page.getByRole('region', { name: '创作助手' }).filter({ visible: true });
  await main.getByLabel('助手作品').selectOption(workId);
  await main.getByText('先把两条成长线放进同一个选择', { exact: true }).waitFor();
  await main.getByLabel('助手问题').fill('继续完善第二种方案。');
  await main.locator('.assistant-scroll').evaluate(el => { el.scrollTop = 0; });
  await capture('full.png');

  await page.getByRole('button', { name: '原创写作', exact: true }).click();
  await page.getByRole('button', { name: '纸桥与远行（界面验收）', exact: true }).click();
  await page.getByRole('group', { name: '写作资料速查' }).getByRole('button', { name: '助手', exact: true }).click();
  const side = page.locator('.assistant-compact');
  await side.getByLabel('助手问题').waitFor();
  assert.equal(await side.getByLabel('助手问题').inputValue(), '继续完善第二种方案。');
  await side.getByText('Enter 发送 · Shift+Enter 换行', { exact: true }).waitFor();
  assert.equal(await side.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await side.locator('.assistant-scroll').evaluate(el => { el.scrollTop = 0; });
  await capture('sidebar.png');

  await side.getByLabel('助手问题').fill('侧栏中继续讨论，草稿应该保留。');
  await side.getByRole('button', { name: '关闭助手侧栏' }).click();
  await page.getByRole('button', { name: '创作助手', exact: true }).click();
  assert.equal(await main.getByLabel('助手问题').inputValue(), '侧栏中继续讨论，草稿应该保留。');
  await main.getByText('Enter 发送 · Shift+Enter 换行', { exact: true }).waitFor();
  await page.setViewportSize({ width: 980, height: 760 });
  await capture('narrow.png');

  // B2: 验证 Shift+Enter 换行、IME 组字保护、忙碌期输入与 Enter 抑制、草稿保留与失败同步
  await app.evaluate(({ ipcMain }) => {
    const listeners = ipcMain._invokeHandlers;
    const orig = listeners.get('novel:invoke');
    globalThis.__qaOrigInvoke = orig;
    globalThis.__qaAssistantMock = { sendCalls: 0, mode: 'delay', busy: false, extraMessages: [], lastError: null };
    listeners.set('novel:invoke', async (event, method, args) => {
      const m = globalThis.__qaAssistantMock;
      if (method === 'assistant.get') {
        const res = await orig(event, method, args);
        if (!res?.ok) return res;
        return {
          ok: true,
          value: {
            ...res.value,
            busy: m.busy,
            activity: m.busy ? '正在整理模拟建议' : undefined,
            lastError: m.lastError,
            messages: [...res.value.messages, ...m.extraMessages]
          }
        };
      }
      if (method === 'assistant.send') {
        m.sendCalls++;
        m.busy = true;
        m.lastError = null;
        await new Promise(resolve => setTimeout(resolve, 900));
        m.busy = false;
        if (m.mode === 'fail') {
          const err = { code: 'MOCK_ASSISTANT_FAIL', message: '模拟助手错误：请保留草稿' };
          m.lastError = err;
          return { ok: false, error: err };
        }
        m.extraMessages.push({ role: 'user', text: args.text }, { role: 'assistant', text: `模拟助手回复 #${m.sendCalls}` });
        const res = await orig(event, 'assistant.get', { workId: args.workId });
        return {
          ok: true,
          value: { ...res.value, busy: false, lastError: null, messages: [...res.value.messages, ...m.extraMessages] }
        };
      }
      return orig(event, method, args);
    });
  });

  try {
    const box = main.getByLabel('助手问题');
    const getSendCalls = () => app.evaluate(() => globalThis.__qaAssistantMock.sendCalls);

    // 1. Shift+Enter 换行不发送
    await box.fill('第一行');
    await box.press('Shift+Enter');
    await box.type('第二行');
    assert.equal(await box.inputValue(), '第一行\n第二行');
    assert.equal(await getSendCalls(), 0);

    // 2. IME 组字（isComposing / keyCode 229）按 Enter 不发送
    await box.evaluate(el => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
      const ev229 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      Object.defineProperty(ev229, 'keyCode', { value: 229 });
      el.dispatchEvent(ev229);
    });
    assert.equal(await getSendCalls(), 0);
    assert.equal(await box.inputValue(), '第一行\n第二行');

    // 3. Enter 发送 -> 忙碌时输入框可继续打字、Enter 不换行不重发、完成后保留新草稿
    await box.fill('第一轮测试问题');
    await box.press('Enter');
    await main.getByRole('button', { name: '停止', exact: true }).waitFor();
    assert.equal(await getSendCalls(), 1);
    assert.equal(await box.isDisabled(), false);

    await box.fill('忙碌时继续构思');
    await box.press('Enter');
    assert.equal(await box.inputValue(), '忙碌时继续构思');
    assert.equal(await getSendCalls(), 1);
    await box.press('Shift+Enter');
    assert.equal(await box.inputValue(), '忙碌时继续构思\n');

    await main.getByText('模拟助手回复 #1', { exact: true }).waitFor();
    await main.getByRole('button', { name: '发送', exact: true }).waitFor();
    assert.equal(await box.inputValue(), '忙碌时继续构思\n');

    // 4. 忙碌期间未改写草稿时，成功后清空草稿
    await box.fill('第二轮会清空的问题');
    await box.press('Enter');
    await main.getByText('模拟助手回复 #2', { exact: true }).waitFor();
    await main.getByRole('button', { name: '发送', exact: true }).waitFor();
    assert.equal(await box.inputValue(), '');

    // 5. 失败时保留草稿并同步 lastError
    await app.evaluate(() => { globalThis.__qaAssistantMock.mode = 'fail'; });
    await box.fill('失败后应保留的草稿');
    await box.press('Enter');
    await main.getByText(/本轮未完成：模拟助手错误/).waitFor();
    await main.getByRole('button', { name: '发送', exact: true }).waitFor();
    assert.equal(await box.inputValue(), '失败后应保留的草稿');
  } finally {
    await app.evaluate(({ ipcMain }) => {
      if (globalThis.__qaOrigInvoke) ipcMain._invokeHandlers.set('novel:invoke', globalThis.__qaOrigInvoke);
    }).catch(() => {});
  }

  // B9: 验证记忆抽屉面板、未保存提示、ConfirmDialog 交互与模型未刷新提示
  await main.getByRole('button', { name: '更多助手操作', exact: true }).click();
  await main.getByRole('menuitem', { name: '模型与记忆', exact: true }).click();
  const memPanel = main.getByRole('region', { name: '模型与本书记忆', exact: true });
  await memPanel.waitFor();
  assert.match(await memPanel.getByLabel('助手模型').locator('option').first().textContent(), /^当前：.+（刷新列表确认）$/);
  const memInput = memPanel.getByLabel('本书助手记忆');
  const originalMem = await memInput.inputValue();
  await memInput.fill(originalMem + '\n- 临时未保存条目');
  await memPanel.getByText('未保存的修改', { exact: true }).waitFor();

  await memPanel.getByRole('button', { name: '载入最新记忆', exact: true }).click();
  let confirmDlg = page.locator('dialog.confirm-dialog[open]');
  await confirmDlg.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '取消');
  await page.keyboard.press('Escape');
  await confirmDlg.waitFor({ state: 'hidden' });
  assert.match(await memInput.inputValue(), /临时未保存条目/);

  await memPanel.getByRole('button', { name: '关闭记忆面板', exact: true }).click();
  confirmDlg = page.locator('dialog.confirm-dialog[open]');
  await confirmDlg.waitFor();
  await confirmDlg.getByRole('button', { name: '取消', exact: true }).click();
  await confirmDlg.waitFor({ state: 'hidden' });
  await memPanel.waitFor();

  await memPanel.getByRole('button', { name: '保存记忆', exact: true }).click();
  await memPanel.getByText('未保存的修改', { exact: true }).waitFor({ state: 'hidden' });
  await memPanel.getByRole('button', { name: '关闭记忆面板', exact: true }).click();
  await memPanel.waitFor({ state: 'hidden' });

  await main.getByRole('button', { name: '更多助手操作', exact: true }).click();
  await main.getByRole('menuitem', { name: '重新开始讨论', exact: true }).click();
  confirmDlg = page.locator('dialog.confirm-dialog[open]');
  await confirmDlg.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '取消');
  await confirmDlg.getByRole('button', { name: '取消', exact: true }).click();
  await confirmDlg.waitFor({ state: 'hidden' });
  await main.getByText('先把两条成长线放进同一个选择', { exact: true }).waitFor();

  assert.deepEqual(errors, []);
  await writeFile(join(root, 'report.json'), JSON.stringify({ passed: true, sharedDraft: true, b2Verified: true, b9Verified: true, pageErrors: errors }, null, 2));
  console.log(root);
} finally {
  await app.close();
}
