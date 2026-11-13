import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ExpansionService } from '../app/main/expansion.mjs';
import { Store } from '../app/main/store.mjs';
import { WritingService } from '../app/main/writing.mjs';

const endpoint = 'http://127.0.0.1:1234/v1/chat/completions';
const alternate = 'http://127.0.0.1:1235/v1/chat/completions';
const blank = { endpoint: '', model: '', hasKey: false, canStoreKey: true, thinking: false, activeId: null, profiles: [] };

function fixture(t) {
  const profile = mkdtempSync(join(tmpdir(), 'novel-expansion-'));
  const filename = join(profile, 'expansion.json');
  const store = new Store(join(profile, 'library.sqlite'));
  t.after(() => { store.close(); rmSync(profile, { recursive: true, force: true }); });
  const writing = new WritingService(store);
  const calls = [];
  const vaultCalls = { encrypt: 0, decrypt: 0 };
  const vault = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async key => { vaultCalls.encrypt++; return Buffer.from(key).reverse(); },
    decryptStringAsync: async bytes => { vaultCalls.decrypt++; return { result: Buffer.from(bytes).reverse().toString() }; }
  };
  const service = new ExpansionService(store, filename, vault, async request => {
    calls.push(request);
    return '衣袖上的银线在窗光里亮了一下。';
  });
  service.canStore = async () => true; // The OS vault is exercised separately in Electron.
  const workId = writing.createWork({ title: '星校之门' }).id;
  const doc = writing.list({ workId }).docs[0];
  const chapter = '许青进了教室。（补写许青的学院制服）门外响起铃声。';
  const from = chapter.indexOf('（'), to = chapter.indexOf('）') + 1;
  const input = { workId, docId: doc.id, chapterText: chapter, from, to };
  return { store, writing, service, calls, vault, vaultCalls, filename, workId, doc, chapter, input };
}

test('expansion sends the current live chapter and opt-in material only, without writing or indexing', async t => {
  const { store, writing, service, calls, workId, doc, input } = fixture(t);
  const profile = writing.createDoc({ workId, kind: 'character', title: '许青', text: '旧设定不要发' });
  writing.stage({ id: profile.id, expectedRevision: 0, text: '女一许青，制服别针是一枚银月。' });
  writing.createDoc({ workId, kind: 'outline', title: '第一幕', text: '教室铃声引出误会。' });
  const trash = writing.createDoc({ workId, kind: 'setting', title: '废稿', text: '回收站密记' });
  writing.trash({ id: trash.id });
  writing.createDoc({ workId, volumeId: doc.volume_id, kind: 'chapter', title: '后章', text: '其他章节密记' });
  const other = writing.createWork({ title: '另一本书' }).id;
  writing.createDoc({ workId: other, kind: 'character', title: '许青', text: '其他作品密记' });

  await assert.rejects(service.generate(input), { code: 'EXPAND_NOT_CONFIGURED' });
  assert.equal(calls.length, 0);
  await service.configSave({ endpoint, model: 'qwen' });
  await service.configTest();
  assert.match(calls[0].messages[1].content, /连接正常/);
  assert.doesNotMatch(JSON.stringify(calls[0].messages), /星校之门|许青/);

  assert.equal((await service.generate(input)).text, '衣袖上的银线在窗光里亮了一下。');
  const noMaterials = JSON.parse(calls[1].messages[1].content);
  assert.equal(noMaterials.workTitle, '星校之门');
  assert.equal(noMaterials.task, '补写许青的学院制服');
  assert.deepEqual(noMaterials.chapter, {
    before: '许青进了教室。', after: '门外响起铃声。', earlierTextOmitted: false, laterTextOmitted: false
  });
  assert.equal(Object.hasOwn(noMaterials, 'materials'), false);
  await service.generate({ ...input, useMaterials: true });
  const withMaterials = JSON.parse(calls[2].messages[1].content);
  assert.deepEqual(withMaterials.materials, [
    { type: '大纲', title: '第一幕', text: '教室铃声引出误会。' },
    { type: '角色', title: '许青', text: '女一许青，制服别针是一枚银月。' }
  ]);
  assert.doesNotMatch(calls[2].messages[1].content, /密记|旧设定/);
  assert.equal(writing.preview({ id: doc.id }).text, '');
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM reference_cards').get().n, 0);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM reference_vectors').get().n, 0);
});

test('expansion bounds long chapters at the selection and rejects other or malformed selections before transport', async t => {
  const { writing, service, calls, input } = fixture(t);
  await service.configSave({ endpoint, model: 'local' });
  const first = '不可见章节开头' + '🌙夜'.repeat(3700) + '选区之前';
  const last = '选区之后' + '夜🌙'.repeat(3200) + '不可见章节结尾';
  const target = '（补写这里）';
  await service.generate({ ...input, chapterText: first + target + last, from: first.length, to: first.length + target.length });
  const { chapter } = JSON.parse(calls[0].messages[1].content);
  assert.equal(chapter.earlierTextOmitted && chapter.laterTextOmitted, true);
  assert.ok(chapter.before.endsWith('选区之前') && chapter.after.startsWith('选区之后'));
  assert.ok(chapter.before.length + chapter.after.length <= 5200);
  assert.ok(chapter.before.isWellFormed() && chapter.after.isWellFormed());
  assert.doesNotMatch(chapter.before + chapter.after, /不可见章节/);
  await assert.rejects(service.generate({ ...input, from: input.from + 1 }), { code: 'EXPAND_SELECTION' });
  await assert.rejects(service.generate({ ...input, workId: writing.createWork({ title: '其他书' }).id }), { code: 'EXPAND_CHAPTER' });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(service.generate(input, { signal: controller.signal }), { code: 'EXPAND_CANCELLED' });
  assert.equal(calls.length, 1);
});

test('API key summaries never expose the key, and an address change drops the previous key', async t => {
  const { service, filename, calls, input } = fixture(t);
  const apiKey = 'fake-key-for-vault-test';
  const result = await service.configSave({ endpoint, model: 'model-one', apiKey });
  assert.deepEqual(result, {
    endpoint, model: 'model-one', hasKey: true, canStoreKey: true, thinking: false, activeId: result.activeId,
    profiles: [{ id: result.activeId, name: 'model-one', endpoint, model: 'model-one', hasKey: true, thinking: false }]
  });
  assert.ok(result.activeId);
  assert.doesNotMatch(readFileSync(filename, 'utf8'), /fake-key-for-vault-test/);
  assert.equal((await service.configSave({ endpoint, model: 'model-two' })).hasKey, true);
  await service.generate(input);
  assert.equal(calls[0].apiKey, apiKey);
  const original = readFileSync(filename, 'utf8');
  const tampered = JSON.parse(original);
  tampered.profiles[0].endpoint = alternate;
  writeFileSync(filename, JSON.stringify(tampered));
  await assert.rejects(service.generate(input), { code: 'EXPAND_KEY_READ' });
  writeFileSync(filename, original);
  assert.equal((await service.configSave({ endpoint: alternate, model: 'model-two' })).hasKey, false);
  await service.generate(input);
  assert.equal(calls[1].apiKey, '');
  await service.configSave({ endpoint: alternate, model: 'model-two', apiKey });
  assert.equal((await service.configSave({ endpoint: alternate, model: 'model-two', removeKey: true })).hasKey, false);
  assert.deepEqual(await service.configSave({ endpoint: '', model: '' }), blank);
  await assert.rejects(service.configTest(), { code: 'EXPAND_NOT_CONFIGURED' });
  assert.equal(calls.length, 2);
});

test('legacy settings keep their sealed key and active ID until the first atomic v2 write', async t => {
  const { service, filename, calls, vault, vaultCalls, input } = fixture(t);
  const apiKey = 'original-0.1.6-test-key';
  const protectedKey = (await vault.encryptStringAsync(JSON.stringify({ endpoint, apiKey }))).toString('base64');
  const legacy = JSON.stringify({ version: 1, endpoint, model: 'old-model', protectedKey }) + '\n';
  writeFileSync(filename, legacy);
  const original = await service.configGet();
  assert.equal(original.model, 'old-model');
  assert.equal(original.thinking, false);
  assert.deepEqual(original.profiles, [{ id: original.activeId, name: 'old-model', endpoint, model: 'old-model', hasKey: true, thinking: false }]);
  assert.equal((await service.configGet()).activeId, original.activeId);
  assert.equal(readFileSync(filename, 'utf8'), legacy);
  assert.equal(vaultCalls.decrypt, 0);

  const added = await service.configSave({ endpoint: alternate, model: 'second', newProfile: true });
  assert.equal(added.profiles[0].id, original.activeId);
  assert.equal(added.model, 'second');
  const saved = JSON.parse(readFileSync(filename, 'utf8'));
  assert.equal(saved.version, 2);
  assert.equal(saved.profiles[0].protectedKey, protectedKey);
  assert.equal(saved.profiles[1].protectedKey, '');
  assert.equal(vaultCalls.decrypt, 0);
  assert.equal(vaultCalls.encrypt, 1);
  await service.configSelect({ profileId: original.activeId });
  await service.generate(input);
  assert.deepEqual(calls[0].config, { endpoint, model: 'old-model' });
  assert.equal(calls[0].apiKey, apiKey);
});

test('key reuse requires an explicit same-address copy into a new profile', async t => {
  const { service, filename, calls, vaultCalls, input } = fixture(t);
  const apiKey = 'original-key';
  const source = await service.configSave({ endpoint, model: 'source', name: '主模型', apiKey });
  const sourceId = source.activeId;
  const renamed = await service.configSave({ profileId: sourceId, endpoint, model: 'source', name: '' });
  assert.equal(renamed.profiles[0].name, 'source');
  const original = readFileSync(filename, 'utf8');
  const create = { endpoint, model: 'second', newProfile: true, reuseKeyFrom: sourceId };
  for (const values of [
    { ...create, endpoint: alternate },
    { ...create, endpoint: endpoint.replace('/v1/', '/different-path/') },
    { ...create, apiKey: 'replacement-key' },
    { ...create, removeKey: true },
    { ...create, newProfile: false },
    { ...create, reuseKeyFrom: 'missing' }
  ]) {
    await assert.rejects(service.configSave(values), { code: 'EXPAND_KEY_REUSE' });
    assert.equal(readFileSync(filename, 'utf8'), original);
  }
  const duplicate = await service.configSave({ ...create, endpoint: ` ${endpoint.replace('http:', 'HTTP:')} ` });
  assert.equal(duplicate.hasKey, true);
  assert.equal(duplicate.model, 'second');
  assert.notEqual(duplicate.activeId, sourceId);
  const profiles = JSON.parse(readFileSync(filename, 'utf8')).profiles;
  assert.equal(profiles[0].protectedKey, profiles[1].protectedKey);
  assert.equal(vaultCalls.encrypt, 1);
  assert.equal(vaultCalls.decrypt, 0);

  await service.configSave({ profileId: sourceId, endpoint: alternate, model: 'source', name: '改地址', removeKey: true });
  const summary = await service.configGet();
  assert.equal(summary.activeId, duplicate.activeId);
  assert.deepEqual(summary.profiles.map(({ hasKey }) => hasKey), [false, true]);
  await service.generate(input);
  assert.equal(calls[0].apiKey, apiKey);
  assert.equal(calls[0].config.endpoint, endpoint);
});

test('queued switching and removal affect only the selected profile', async t => {
  const { service, calls, filename, input } = fixture(t);
  const first = service.configSave({ endpoint, model: 'first', newProfile: true });
  const second = service.configSave({ endpoint: alternate, model: 'second', newProfile: true });
  const third = service.configSave({ endpoint: alternate, model: 'third', newProfile: true });
  const [one, two, three] = await Promise.all([first, second, third]);
  assert.deepEqual(three.profiles.map(({ model }) => model), ['first', 'second', 'third']);
  assert.equal((await service.configGet()).activeId, three.activeId);

  await service.configSelect({ profileId: two.activeId });
  await service.configTest();
  assert.deepEqual(calls[0].config, { endpoint: alternate, model: 'second' });
  const removedOther = await service.configRemove({ profileId: three.activeId });
  assert.equal(removedOther.activeId, two.activeId);
  const disabledLegacy = await service.configSave({ endpoint: '', model: '', removeKey: true });
  assert.equal(disabledLegacy.activeId, one.activeId);
  assert.deepEqual(disabledLegacy.profiles.map(({ model }) => model), ['first']);
  await service.generate(input);
  assert.deepEqual(calls[1].config, { endpoint, model: 'first' });

  await assert.rejects(service.configSelect({ profileId: two.activeId }), { code: 'EXPAND_PROFILE_NOT_FOUND' });
  await assert.rejects(service.configRemove({ profileId: two.activeId }), { code: 'EXPAND_PROFILE_NOT_FOUND' });
  assert.deepEqual(await service.configRemove({ profileId: one.activeId }), blank);
  assert.deepEqual(JSON.parse(readFileSync(filename, 'utf8')), { version: 2, activeId: null, profiles: [] });
  await assert.rejects(service.generate(input), { code: 'EXPAND_NOT_CONFIGURED' });
  assert.equal(calls.length, 2);
});

test('DeepSeek thinking belongs to each saved profile and survives selection and reopening', async t => {
  const { service, store, filename, vault, calls, input } = fixture(t);
  const deepSeek = 'https://api.deepseek.com/v1/chat/completions';
  const legacyV2 = { version: 2, activeId: 'existing', profiles: [
    { id: 'existing', name: '旧配置', endpoint: deepSeek, model: 'deepseek-chat', protectedKey: '' }
  ] };
  writeFileSync(filename, JSON.stringify(legacyV2));
  assert.equal((await service.configGet()).thinking, false);
  assert.equal((await service.configGet()).profiles[0].thinking, false);
  await assert.rejects(service.configSave({ endpoint: deepSeek, model: 'deepseek-chat', thinking: 'true' }), { code: 'EXPAND_CONFIG_INVALID' });
  const enabled = await service.configSave({ endpoint: deepSeek, model: 'deepseek-chat', apiKey: 'test-key', thinking: true });
  assert.equal(enabled.thinking, true);
  assert.equal((await service.configSave({ endpoint: deepSeek, model: 'deepseek-chat', name: '可思考' })).thinking, true);
  const clone = await service.configSave({ endpoint: deepSeek, model: 'deepseek-chat', newProfile: true, reuseKeyFrom: enabled.activeId });
  assert.deepEqual(clone.profiles.map(({ thinking }) => thinking), [true, false]);
  assert.equal(clone.thinking, false);
  assert.equal(clone.hasKey, true);
  await service.generate(input);
  assert.deepEqual(calls[0].config, { endpoint: deepSeek, model: 'deepseek-chat' });
  assert.equal(calls[0].apiKey, 'test-key');

  await service.configSelect({ profileId: enabled.activeId });
  const reopened = new ExpansionService(store, filename, vault, service.transport);
  reopened.canStore = service.canStore;
  assert.equal((await reopened.configGet()).thinking, true);
  await reopened.generate(input);
  assert.deepEqual(calls[1].config, { endpoint: deepSeek, model: 'deepseek-chat', thinking: true });
  assert.equal(calls[1].connectionTest, undefined);
  await reopened.configTest();
  assert.equal(calls[2].config.thinking, true);
  assert.equal(calls[2].connectionTest, true);
  assert.equal(calls[2].maxTokens, 48);

  const otherRoute = 'https://api.deepseek.com/chat/completions';
  assert.equal((await reopened.configSave({ endpoint: otherRoute, model: 'deepseek-chat' })).thinking, false);
  assert.equal((await reopened.configSave({ endpoint: deepSeek, model: 'deepseek-chat', thinking: true })).thinking, true);
  assert.equal((await reopened.configSave({ endpoint: deepSeek, model: 'deepseek-chat', thinking: false })).thinking, false);
  const custom = 'https://api.deepseek.com.example.org/v1/chat/completions';
  assert.equal((await reopened.configSave({ endpoint: custom, model: 'deepseek-chat', thinking: true })).thinking, false);
  assert.equal(JSON.parse(readFileSync(filename, 'utf8')).profiles[0].thinking, false);
  assert.equal((await reopened.configSave({ endpoint: 'https://api.deepseek.com:444/v1/chat/completions', model: 'deepseek-chat', thinking: true })).thinking, false);
});

test('verbatim full sentences echoed at the boundaries are removed from a preview', async t => {
  const { service, input } = fixture(t);
  await service.configSave({ endpoint, model: 'local' });
  const before = '长廊没有别人。许青踏进了教室里面。';
  const after = '门外忽然响起了铃声。她向窗边走去。';
  const target = '（补写制服）';
  service.transport = async () => '许青踏进了教室里面。领缘的银线微微发亮。门外忽然响起了铃声。';
  const request = { ...input, chapterText: before + target + after, from: before.length, to: before.length + target.length };
  assert.equal((await service.generate(request)).text, '领缘的银线微微发亮。');
  const bell = '窗铃响了一下。她向窗边走去。';
  service.transport = async () => '领缘的银线微微发亮。窗铃轻响了一下，打破了安静。';
  assert.equal((await service.generate({ ...request, chapterText: before + target + bell })).text, '领缘的银线微微发亮。');
  service.transport = async () => '领缘的银线微微发亮。有人拍了拍窗台。';
  assert.equal((await service.generate({ ...request, chapterText: before + target + bell })).text,
    '领缘的银线微微发亮。有人拍了拍窗台。');
  service.transport = async () => '许青踏进了教室里面。';
  await assert.rejects(service.generate(request), { code: 'EXPAND_EMPTY_RESPONSE' });
});

test('a damaged config can be reset only by the explicit clear action', async t => {
  const { service, filename } = fixture(t);
  writeFileSync(filename, '{ invalid');
  await assert.rejects(service.configGet(), { code: 'EXPAND_CONFIG_READ' });
  await assert.rejects(service.configSave({ endpoint: '', model: '' }), { code: 'EXPAND_CONFIG_READ' });
  assert.equal(readFileSync(filename, 'utf8'), '{ invalid');
  assert.deepEqual(await service.configSave({ endpoint: '', model: '', removeKey: true }), blank);
});


test('account expansion uses bounded original selection, preserves manuscripts and keeps API configuration', async t => {
  const { service, input, store, filename, calls } = fixture(t);
  await service.configSave({ endpoint, model: 'existing-api', apiKey: 'existing-key' });
  const beforeConfig = readFileSync(filename);
  const beforeDocs = store.db.prepare('SELECT * FROM original_docs ORDER BY id').all();
  let sent;
  service.sourceProvider = { read: () => ({ source: 'agy' }), snapshot: () => 'agy-flash', complete: async messages => {
    sent = messages; return '衣领旁的银线映着窗边的日光。';
  } };
  const result = await service.generate(input);
  assert.equal(result.text, '衣领旁的银线映着窗边的日光。');
  assert.equal(calls.length, 0);
  const payload = JSON.parse(sent[1].content);
  assert.equal(payload.task, '补写许青的学院制服');
  assert.ok(!('materials' in payload));
  assert.deepEqual(store.db.prepare('SELECT * FROM original_docs ORDER BY id').all(), beforeDocs);
  assert.deepEqual(readFileSync(filename), beforeConfig);
});

test('account expansion rejects cancelled, stale, empty and excessive output without touching originals', async t => {
  const { service, input, store } = fixture(t);
  let state = 'old';
  const provider = { read: () => ({ source: 'agy' }), snapshot: () => state, complete: async () => { state = 'new'; return '晚风掠过衣角。'; } };
  service.sourceProvider = provider;
  const before = store.db.prepare('SELECT * FROM original_docs').all();
  await assert.rejects(service.generate(input), { code: 'EXPAND_CONFIG_CHANGED' });
  provider.complete = async () => '';
  await assert.rejects(service.generate(input), { code: 'EXPAND_INVALID_RESPONSE' });
  provider.complete = async () => '字'.repeat(12001);
  await assert.rejects(service.generate(input), { code: 'EXPAND_OUTPUT_TOO_LARGE' });
  const controller = new AbortController();
  provider.complete = async () => { controller.abort(); return '不能采纳。'; };
  await assert.rejects(service.generate(input, { signal: controller.signal }), { code: 'EXPAND_CANCELLED' });
  assert.deepEqual(store.db.prepare('SELECT * FROM original_docs').all(), before);
});
