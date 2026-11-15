import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { _electron } from 'playwright';
import { normalizeExpansionConfig } from '../app/main/expansion-provider.mjs';

const { values, positionals } = parseArgs({
  options: { installed: { type: 'string' }, 'real-endpoint': { type: 'string' }, model: { type: 'string' }, 'real-only': { type: 'boolean' } },
  allowPositionals: true
});
assert.ok(positionals.length <= 1 && !(values.installed && positionals.length), 'Specify the installed executable once.');
assert.equal(Boolean(values['real-endpoint']), Boolean(values.model), 'Use --real-endpoint and --model together.');
const real = values['real-endpoint'] ? normalizeExpansionConfig({ endpoint: values['real-endpoint'], model: values.model }) : null;
assert.ok(!values['real-only'] || real, '--real-only requires a local model endpoint.');
if (real) assert.ok(['127.0.0.1', '[::1]'].includes(new URL(real.endpoint).hostname), 'The QA model must use a numeric loopback address.');

const installed = values.installed ?? positionals[0];
const executable = resolve(installed ?? 'node_modules/electron/dist/electron.exe');
await mkdir('.local', { recursive: true });
const root = await mkdtemp(resolve('.local/expansion-qa-'));
const profile = join(root, 'profile');
const report = { status: 'failed', installed: Boolean(installed), checks: [] };
const errors = [];
const requests = [];
const sample = {
  work: '青岚学院验收作品', chapter: '第一章',
  before: '青砖回廊里，她转过身。', prompt: '补写女主的学院制服，保留银线和校徽。', after: '窗铃响了一下。',
  output: '她的墨蓝制服缀着两道银线。\n领口别着月桂校徽。',
  outline: '在回廊里初次展示校徽。', character: '女主穿墨蓝学院制服。', setting: '银线只用于学院制服的领口。'
};
const secrets = ['其他作品未公开资料一号', '同书其他章节二号', '已删除本书资料三号', '参考卡正文四号'];
const draft = `${sample.before}（${sample.prompt}）${sample.after}`;
const replaced = `${sample.before}${sample.output}${sample.after}`;
const mockModel = 'novel-qa-local';
const fakeKey = 'qa-only-test-key-never-used-with-real-model';
let holdResponse = false;
let responseStatus = 200;
let responseText = sample.output;
const server = createServer(async (incoming, outgoing) => {
  const chunks = [];
  try {
    for await (const chunk of incoming) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    const request = { body, path: incoming.url, authorization: incoming.headers.authorization, aborted: false };
    requests.push(request);
    outgoing.once('close', () => { request.aborted = !outgoing.writableEnded; });
    outgoing.setHeader('content-type', 'application/json');
    if (holdResponse) {
      outgoing.write('{');
      return;
    }
    if (responseStatus !== 200) {
      outgoing.writeHead(responseStatus).end('synthetic provider error');
      return;
    }
    const content = body.max_tokens === 48 ? '连接正常。' : responseText;
    outgoing.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
  } catch {
    if (!outgoing.destroyed) outgoing.writeHead(400).end();
  }
});
await new Promise((done, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', done);
});
const mockEndpoint = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
let app;
let page;

function record(name, details = {}) {
  report.checks.push({ name, ...details });
  console.log('PASS', name, JSON.stringify(details));
}

async function eventually(read, condition, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await read();
    if (condition(value)) return value;
    await delay(40);
  } while (Date.now() < deadline);
  assert.fail(label);
}

async function launch() {
  app = await _electron.launch({
    executablePath: executable, args: installed ? [] : ['.'], timeout: 25000,
    env: { ...process.env, NOVEL_STUDIO_TEST_HIDDEN: '1', NOVEL_STUDIO_NO_MODEL: '1', NOVEL_STUDIO_DATA_DIR: profile }
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
}

const editor = () => page.locator('.editor-manuscript .cm-content');
const bookshelf = () => page.getByRole('region', { name: '我的作品' });
async function reopenWorkAfterRestart(title) {
  const workBtn = bookshelf().locator('.original-shelf-grid[aria-busy="false"]').getByRole('button', { name: title, exact: true });
  await Promise.race([editor().waitFor(), workBtn.waitFor()]);
  if (await workBtn.isVisible().catch(() => false)) {
    await workBtn.click();
    await editor().waitFor();
  }
}
const expand = () => page.getByRole('button', { name: 'AI 扩写', exact: true });
const dialog = () => page.getByRole('dialog', { name: 'AI 扩写', exact: true });
const inlinePreview = () => page.locator('.expansion-inline-preview');
const preferences = () => page.getByRole('region', { name: 'AI 扩写', exact: true });
const savedFile = () => readFile(join(profile, 'expansion.json'), 'utf8');

async function goto(name) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();
  if (name === '资料与设置') await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: 'AI 扩写', exact: true }).click();
}

async function ipc(method, args = {}) {
  const result = await page.evaluate(({ method, args }) => window.studio.invoke(method, args), { method, args });
  assert.equal(result.ok, true, `IPC ${method} failed with ${result.error?.code}`);
  return result.value;
}

function db(read) {
  const connection = new DatabaseSync(join(profile, 'library.sqlite'), { readOnly: true });
  try { return read(connection); } finally { connection.close(); }
}

async function expectSaved(chapterId, text) {
  await eventually(() => db(connection => connection.prepare('SELECT body FROM original_docs WHERE id=?').get(chapterId)?.body),
    body => body === text, 'The active chapter did not autosave the expected text.');
}

function editorState(target = editor()) {
  return target.evaluate(content => {
    const view = content.cmTile.root.view;
    const { from, to } = view.state.selection.main;
    return { text: view.state.doc.toString(), selected: view.state.sliceDoc(from, to), readOnly: view.state.readOnly };
  });
}

async function selectPrompt(includeBrackets) {
  await editor().focus();
  await page.keyboard.press('Control+Home');
  const leading = sample.before.length + (includeBrackets ? 0 : 1);
  const size = sample.prompt.length + (includeBrackets ? 2 : 0);
  for (let i = 0; i < leading; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < size; i++) await page.keyboard.press('Shift+ArrowRight');
  const expected = includeBrackets ? `（${sample.prompt}）` : sample.prompt;
  assert.equal((await editorState()).selected, expected);
  await expand().click();
  await dialog().getByText(sample.prompt, { exact: true }).waitFor();
}

async function createFixtures() {
  await bookshelf().getByRole('button', { name: '新建作品', exact: true }).click();
  await page.locator('#writing-title').fill(sample.work);
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await editor().waitFor();
  const { works } = await ipc('writing.list');
  const workId = works.find(work => work.title === sample.work).id;
  const { docs } = await ipc('writing.list', { workId });
  const chapterId = docs.find(doc => doc.kind === 'chapter' && doc.title === sample.chapter).id;
  await ipc('writing.createDoc', { workId, kind: 'outline', title: '学院大纲', text: sample.outline });
  await ipc('writing.createDoc', { workId, kind: 'character', title: '女主', text: sample.character });
  await ipc('writing.createDoc', { workId, kind: 'setting', title: '校服设定', text: sample.setting });
  await page.getByRole('button', { name: '新建章节', exact: true }).click();
  await page.locator('#writing-title').fill('隔离检查章');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('heading', { name: '隔离检查章', exact: true }).waitFor();
  await editor().focus();
  await page.keyboard.insertText(secrets[1]);
  await page.getByRole('button', { name: '上一章', exact: true }).click();
  await page.getByRole('heading', { name: sample.chapter, exact: true }).waitFor();
  const deleted = await ipc('writing.createDoc', { workId, kind: 'setting', title: '删除检查', text: secrets[2] });
  await ipc('writing.trash', { id: deleted.id });
  const other = await ipc('writing.createWork', { title: '隔离检查作品' });
  await ipc('writing.createDoc', { workId: other.id, kind: 'outline', title: '其他大纲', text: secrets[0] });
  const connection = new DatabaseSync(join(profile, 'library.sqlite'));
  try {
    connection.prepare('INSERT INTO reference_works(work_id,title) VALUES(?,?)').run('qa-reference', '隔离检查参考作品');
    connection.prepare(`INSERT INTO reference_cards(work_id,card_id,category,title,content,claim_type,aliases,related_card_ids,search_text)
      VALUES('qa-reference','qa-reference-card','setting','隔离检查参考卡',?,'fact','[]','[]',?)`).run(secrets[3], secrets[3]);
  } finally { connection.close(); }
  await editor().focus();
  assert.equal(await expand().isDisabled(), true);
  await page.keyboard.insertText(draft);
  await expectSaved(chapterId, draft);
  return chapterId;
}

async function saveSettings(endpoint, model, key = '') {
  await goto('资料与设置');
  const panel = preferences();
  await panel.getByLabel('Chat Completions 地址').fill(endpoint);
  await panel.getByLabel('模型名称').fill(model);
  const keyInput = panel.getByLabel('API Key（可选）');
  const withKey = Boolean(key) && await keyInput.isEnabled();
  if (withKey) await keyInput.fill(key);
  await panel.getByRole('button', { name: '保存配置' }).click();
  await panel.getByText('AI 扩写配置已保存。', { exact: true }).waitFor();
  return withKey;
}

async function generatePreview(expected) {
  await dialog().getByRole('button', { name: '生成预览' }).click();
  const preview = inlinePreview().locator('[data-expansion-preview-text]');
  await preview.waitFor({ timeout: real ? 170000 : 10000 });
  await dialog().waitFor({ state: 'hidden' });
  const state = await editorState(preview.locator('.cm-content'));
  assert.equal(state.readOnly, true);
  assert.equal(await editor().isVisible(), false);
  const lines = await preview.locator('.cm-line').allTextContents();
  assert.equal(lines.join('\n'), state.text);
  assert.ok(state.text.startsWith(sample.before));
  assert.ok(state.text.endsWith(sample.after));
  const text = state.text.slice(sample.before.length, -sample.after.length);
  const highlights = preview.locator('.expansion-preview-insert');
  assert.equal(await highlights.first().isVisible(), true);
  assert.equal((await highlights.allTextContents()).join(''), text.replaceAll('\n', ''));
  if (expected !== undefined) assert.equal(text, expected);
  assert.ok(text.trim());
  return text;
}

function assertScope(request, withMaterials, withKey) {
  assert.equal(request.path, '/v1/chat/completions');
  assert.equal(request.authorization, withKey ? `Bearer ${fakeKey}` : undefined);
  assert.equal(request.body.model, mockModel);
  assert.deepEqual(request.body.messages.map(({ role }) => role), ['system', 'user']);
  const context = JSON.parse(request.body.messages[1].content);
  assert.deepEqual(context, {
    task: sample.prompt, workTitle: sample.work, chapterTitle: sample.chapter,
    chapter: { before: sample.before, after: sample.after, earlierTextOmitted: false, laterTextOmitted: false },
    ...(withMaterials ? { materials: [
      { type: '大纲', title: '学院大纲', text: sample.outline },
      { type: '角色', title: '女主', text: sample.character },
      { type: '设定', title: '校服设定', text: sample.setting }
    ] } : {})
  });
  const wire = JSON.stringify(request.body);
  for (const marker of secrets) assert.equal(wire.includes(marker), false);
}

async function apply() {
  await inlinePreview().getByRole('button', { name: '保留这段', exact: true }).click();
  await inlinePreview().waitFor({ state: 'hidden' });
  await editor().waitFor();
}

async function checkMock(chapterId) {
  assert.equal(requests.length, 0);
  const withKey = await saveSettings(mockEndpoint, mockModel, fakeKey);
  assert.equal(requests.length, 0);
  const persisted = await savedFile();
  assert.equal(persisted.includes(fakeKey), false);
  const settings = JSON.parse(persisted);
  const stored = settings.profiles.find(profile => profile.id === settings.activeId);
  assert.equal(stored.endpoint, mockEndpoint);
  assert.equal(Boolean(stored.protectedKey), withKey);
  await preferences().getByRole('button', { name: '测试连接' }).click();
  await preferences().getByText('连接成功，模型已返回测试内容。', { exact: true }).waitFor();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body, {
    model: mockModel, max_tokens: 48, stream: false,
    messages: [{ role: 'system', content: '这是一个不含用户数据的连接测试，请只输出简短中文。' },
      { role: 'user', content: '请回答：连接正常。' }]
  });
  record('保存模型设置与仅含固定测试句的连接请求', { protectedKey: withKey });

  await goto('原创写作');
  const persistedChapter = () => db(connection => ({
    ...connection.prepare('SELECT body,revision FROM original_docs WHERE id=?').get(chapterId),
    staged: connection.prepare('SELECT body FROM original_drafts WHERE doc_id=?').get(chapterId)?.body
  }));
  const original = persistedChapter();
  await selectPrompt(true);
  await dialog().getByRole('checkbox', { name: '同时读取本作品的大纲、角色和设定' }).check();
  assert.equal(requests.length, 1);
  await generatePreview(sample.output);
  assert.equal(requests.length, 2);
  assertScope(requests[1], true, withKey);
  assert.equal((await editorState()).text, draft);
  await delay(950);
  assert.deepEqual(persistedChapter(), original);
  record('两段扩写在原位置高亮，上下文连读，等待自动保存后原稿和修订号仍一致');

  await apply();
  assert.equal((await editorState()).text, replaced);
  await expectSaved(chapterId, replaced);
  await editor().press('Control+z');
  assert.equal((await editorState()).text, draft);
  await expectSaved(chapterId, draft);
  record('应用只替换括号提示，并可撤销及自动保存');

  await selectPrompt(false);
  assert.equal(await dialog().getByRole('checkbox').isChecked(), false);
  await generatePreview(sample.output);
  assert.equal(requests.length, 3);
  assertScope(requests[2], false, withKey);
  await inlinePreview().getByRole('button', { name: '恢复原文', exact: true }).click();
  await inlinePreview().waitFor({ state: 'hidden' });
  await editor().waitFor();
  assert.deepEqual(await editorState(), { text: draft, selected: sample.prompt, readOnly: false });
  await expectSaved(chapterId, draft);
  record('选中括号内部也可扩写，资料默认不发送且丢弃预览保留原稿');

  holdResponse = true;
  await selectPrompt(true);
  await dialog().getByRole('button', { name: '生成预览' }).click();
  await eventually(() => requests.length, count => count === 4, 'The request did not start.');
  assertScope(requests[3], false, withKey);
  await dialog().getByRole('button', { name: '停止生成' }).click();
  await dialog().getByText('已停止生成。', { exact: true }).waitFor();
  await eventually(() => requests[3].aborted, Boolean, 'Stopping generation did not close the HTTP response.');
  assert.equal(await inlinePreview().count(), 0);
  await dialog().getByRole('button', { name: '取消', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  assert.equal((await editorState()).text, draft);
  await expectSaved(chapterId, draft);
  record('停止生成取消实际网络请求并保留正文');

  holdResponse = false;
  await page.getByRole('button', { name: '专注', exact: true }).click();
  await selectPrompt(true);
  const sendMaterials = dialog().getByRole('checkbox', { name: '同时读取本作品的大纲、角色和设定' });
  await sendMaterials.check();
  await generatePreview(sample.output);
  await inlinePreview().getByRole('button', { name: '重新生成', exact: true }).click();
  await dialog().waitFor();
  await inlinePreview().waitFor({ state: 'hidden' });
  assert.equal(await sendMaterials.isChecked(), true);
  const alternative = '墨蓝制服上的银线勾出月桂校徽。';
  responseText = alternative;
  await generatePreview(alternative);
  responseText = sample.output;
  assertScope(requests[4], true, withKey);
  assertScope(requests[5], true, withKey);
  assert.equal((await editorState()).text, draft);
  await expectSaved(chapterId, draft);
  record('重新生成沿用资料开关，在原位展示新候选，原稿不变');

  await page.keyboard.press('Escape');
  await inlinePreview().waitFor({ state: 'hidden' });
  await editor().waitFor();
  assert.equal((await editorState()).text, draft);
  await page.getByRole('button', { name: /^退出专注/ }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '专注', exact: true }).waitFor();
  record('专注模式首次 Esc 恢复原文，第二次 Esc 退出专注');

  await selectPrompt(true);
  await generatePreview(sample.output);
  await page.getByRole('button', { name: '下一章', exact: true }).click();
  await inlinePreview().waitFor({ state: 'hidden' });
  await eventually(editorState, state => state.text === secrets[1], 'Chapter switch did not load the next chapter.');
  await page.getByRole('button', { name: '上一章', exact: true }).click();
  await eventually(editorState, state => state.text === draft, 'Chapter switch did not restore the original draft.');
  await expectSaved(chapterId, draft);
  record('未采纳时切换章节，原章和下一章均保留各自正文');

  await selectPrompt(true);
  await generatePreview(sample.output);
  const closed = page.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
  await closed;
  await app.close();
  app = null;
  await launch();
  await reopenWorkAfterRestart(sample.work);
  assert.equal(await inlinePreview().count(), 0);
  assert.equal((await editorState()).text, draft);
  await expectSaved(chapterId, draft);
  record('未采纳时关闭应用，重启后恢复原稿');

  await selectPrompt(true);
  await generatePreview(sample.output);
  const authoringRequests = requests.length;
  assert.equal(authoringRequests, 9);
  await apply();
  await expectSaved(chapterId, replaced);
  await app.close();
  app = null;
  await launch();
  await reopenWorkAfterRestart(sample.work);
  assert.equal((await editorState()).text, replaced);
  await goto('资料与设置');
  const panel = preferences();
  await panel.getByLabel('Chat Completions 地址').waitFor();
  assert.equal(await panel.getByLabel('Chat Completions 地址').inputValue(), mockEndpoint);
  assert.equal(await panel.getByLabel('模型名称').inputValue(), mockModel);
  assert.equal(await panel.getByLabel('API Key（可选）').inputValue(), '');
  assert.equal((await ipc('expand.config.get')).hasKey, withKey);
  assert.equal(requests.length, authoringRequests);
  record('重启保留正文和扩写配置，且启动不发送请求');

  const primary = await ipc('expand.config.get');
  const alternate = await ipc('expand.config.save', { newProfile: true, name: '另一模型', endpoint: mockEndpoint,
    model: 'novel-qa-alternate', ...(withKey ? { reuseKeyFrom: primary.activeId } : {}) });
  assert.notEqual(alternate.activeId, primary.activeId);
  assert.equal(alternate.profiles.length, 2);
  assert.equal(alternate.hasKey, withKey);
  assert.equal(JSON.stringify(alternate).includes('protectedKey'), false);
  await ipc('expand.config.test');
  assert.equal(requests[authoringRequests].body.model, 'novel-qa-alternate');
  assert.equal(requests[authoringRequests].authorization, withKey ? `Bearer ${fakeKey}` : undefined);
  await ipc('expand.config.select', { profileId: primary.activeId });
  await ipc('expand.config.test');
  assert.equal(requests[authoringRequests + 1].body.model, mockModel);
  await ipc('expand.config.remove', { profileId: alternate.activeId });
  const restored = await ipc('expand.config.get');
  assert.equal(restored.activeId, primary.activeId);
  assert.equal(restored.hasKey, withKey);
  record('保存并切换两套模型，同地址沿用加密 Key，测试请求使用当前模型');

  responseStatus = 401;
  await panel.getByRole('button', { name: '测试连接' }).click();
  await panel.getByText('扩写服务拒绝访问。请检查 API 密钥和模型权限。', { exact: true }).waitFor();
  if (withKey) await panel.getByText('当前配置仍保留已保存的 API Key。', { exact: true }).waitFor();
  assert.equal(await panel.getByLabel('API Key（可选）').inputValue(), '');
  assert.equal((await ipc('expand.config.get')).hasKey, withKey);
  assert.equal(requests[authoringRequests + 2].authorization, withKey ? `Bearer ${fakeKey}` : undefined);
  responseStatus = 200;
  record('服务拒绝后保留已存密钥，输入框继续用于输入新 Key');
}

try {
  await launch();
  const chapterId = await createFixtures();
  if (!values['real-only']) await checkMock(chapterId);
  if (real) {
    const mockRequests = requests.length;
    await saveSettings(real.endpoint, real.model);
    assert.equal((await ipc('expand.config.get')).hasKey, false);
    await goto('原创写作');
    await editor().focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText(draft);
    await selectPrompt(true);
    await dialog().getByRole('checkbox', { name: '同时读取本作品的大纲、角色和设定' }).check();
    const text = await generatePreview();
    report.realPreview = text;
    assert.match(text, /[\p{Script=Han}]/u);
    assert.match(text, /墨蓝|深蓝|藏蓝|靛蓝/u);
    assert.match(text, /银线|银色.{0,6}(?:线|纹)/u);
    assert.match(text, /校徽|学院徽章/u);
    assert.ok(!text.includes(sample.before), 'The model preview repeats the preceding sentence.');
    assert.doesNotMatch(text, /窗铃|铃铛|铃声/u, 'The model preview advances into the following event.');
    assert.equal((await editorState()).text, draft);
    await apply();
    await expectSaved(chapterId, `${sample.before}${text}${sample.after}`);
    assert.equal(requests.length, mockRequests);
    record('本机真实模型按设定补写中文，预览和应用通过', { model: real.model, characters: text.length, preview: text });
  }
  assert.deepEqual(errors, []);
  report.status = 'passed';
} finally {
  await app?.close().catch(() => {});
  await new Promise(done => {
    server.close(done);
    server.closeAllConnections();
  });
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Expansion QA evidence:', root);
}
