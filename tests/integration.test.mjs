import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import yazl from 'yazl';
import { BackupService } from '../app/main/backup.mjs';
import { paragraphId, readResultPackage } from '../app/main/protocol.mjs';
import { ImportService, ReferenceService } from '../app/main/reference.mjs';
import { SearchService } from '../app/main/search.mjs';
import { Store } from '../app/main/store.mjs';
import { WritingService } from '../app/main/writing.mjs';

const examples = new URL('../拆书规范包/examples/', import.meta.url);
const freshSample = async () => JSON.parse(await readFile(new URL('result.json', examples), 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z2kAAAAASUVORK5CYII=', 'base64');

async function temporary(t, beforeRemove) {
  const parent = tmpdir();
  const directory = await mkdtemp(join(parent, 'novel-studio-qa-'));
  t.after(async () => {
    beforeRemove?.();
    if (!relative(parent, directory).startsWith('novel-studio-qa-')) throw new Error('Unexpected test path');
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function zip(directory, data, resources = {}) {
  const filename = join(directory, randomUUID() + '.zip');
  const archive = new yazl.ZipFile();
  archive.addBuffer(Buffer.from(JSON.stringify(data)), 'result.json');
  for (const [pathname, bytes] of Object.entries(resources)) archive.addBuffer(bytes, pathname);
  archive.end();
  await pipeline(archive.outputStream, createWriteStream(filename));
  return filename;
}

function revise(result) {
  const [volume] = result.volumes;
  volume.revision_id = hash(JSON.stringify(volume.normalized_payload));
  for (const node of result.structures) node.revision_id = volume.revision_id;
  for (const range of result.report.processed_ranges) range.revision_id = volume.revision_id;
  return volume.revision_id;
}

function modelUnavailable() {
  const error = new Error('test worker exited');
  error.code = 'EMBED_WORKER_EXIT';
  throw error;
}

test('参考卷按卷号排列且不依赖入库顺序', async t => {
  let store;
  const directory = await temporary(t, () => store?.close());
  store = new Store(join(directory, 'library.sqlite'));
  const workId = randomUUID();
  store.db.prepare('INSERT INTO reference_works VALUES (?, ?, NULL)').run(workId, '分卷作品');
  const insert = store.db.prepare('INSERT INTO reference_volumes VALUES (?, ?, ?)');
  const expected = ['第一卷', '第二卷', '第三卷', '第４卷 余波', '第十卷', '第十一卷', '第21卷', '番外'];
  for (const title of [...expected].reverse()) insert.run(randomUUID(), workId, title);
  const reference = new ReferenceService(store);
  assert.deepEqual(reference.list().works[0].volumes.map(volume => volume.title), expected);
});

test('原创恢复稿、UTF-16 标记重定位、无效提示、历史及软删除', async t => {
  let store;
  const directory = await temporary(t, () => store?.close());
  store = new Store(join(directory, 'library.sqlite'));
  const writing = new WritingService(store);
  const { id: workId } = writing.createWork({ title: '测试作品' });
  const [{ id }] = writing.list({ workId }).docs;
  const original = '落雨🙂秘密门，外面没有脚步。';
  writing.stage({ id, expectedRevision: 0, text: original });
  store.close();
  store.open();
  assert.equal(writing.open({ id }).recovered, true);
  assert.equal(writing.open({ id }).text, original);
  const start = original.indexOf('秘密');
  const [mark] = writing.addMark({ id, expectedRevision: 1, start, end: start + 3, type: 'foreshadow', note: '回收' });
  const inserted = '夜里';
  const text = inserted + original;
  const saved = writing.save({ id, expectedRevision: 1, text, edits: [[{ from: 0, to: 0, insert: inserted }]], boundary: true });
  assert.equal(saved.marks[0].start, mark.start + inserted.length);
  const { start: from, end: to } = saved.marks[0];
  const deleted = writing.save({ id, expectedRevision: 2, text: text.slice(0, from) + text.slice(to), edits: [[{ from, to, insert: '' }]] });
  assert.equal(deleted.marks[0].invalid, 1);
  assert.throws(() => writing.save({ id, expectedRevision: 1, text: '过时版本' }), { code: 'WRITING_STALE' });
  assert.ok(writing.history({ id }).some(history => history.text === original));
  writing.trash({ id });
  assert.throws(() => writing.open({ id }), { code: 'WRITING_NOT_FOUND' });
  writing.restore({ id });
  assert.equal(writing.open({ id }).revision, 3);
});

test('保存中断保留已写入恢复稿，且原正文未被部分覆盖', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const writing = new WritingService(store);
  const { id: workId } = writing.createWork({ title: '故障注入' });
  const [{ id }] = writing.list({ workId }).docs;
  writing.stage({ id, expectedRevision: 0, text: '恢复稿仍然在' });
  store.db.exec("CREATE TRIGGER stop_save BEFORE UPDATE ON original_docs BEGIN SELECT RAISE(ABORT,'probe'); END");
  assert.throws(() => writing.save({ id, expectedRevision: 0, text: '恢复稿仍然在' }), /probe/);
  assert.equal(writing.doc(id).body, '');
  assert.equal(store.db.prepare('SELECT body FROM original_drafts WHERE doc_id=?').get(id).body, '恢复稿仍然在');
  store.db.exec('DROP TRIGGER stop_save');
  assert.equal(writing.open({ id }).text, '恢复稿仍然在');
});

test('预览和 TXT 导出只读当前版本的暂存稿，之后仍可正常保存', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const writing = new WritingService(store);
  const { id: workId } = writing.createWork({ title: '测试小说' });
  const [{ id }] = writing.list({ workId }).docs;
  writing.save({ id, expectedRevision: 0, text: '正稿' });
  const history = writing.history({ id });
  writing.stage({ id, expectedRevision: 1, text: '暂存稿' });

  assert.deepEqual(writing.preview({ id }), { id, kind: 'chapter', title: '第一章', text: '暂存稿' });
  assert.deepEqual(writing.exportText({ id }), { title: '第一章', text: '暂存稿' });
  assert.equal(writing.exportText({ id, draftText: '' }).text, '');
  assert.deepEqual(writing.exportText({ workId }), {
    title: '测试小说', text: '测试小说\n\n第一卷\n\n第一章\n\n暂存稿'
  });
  assert.equal(writing.doc(id).revision, 1);
  assert.equal(writing.doc(id).body, '正稿');
  assert.deepEqual(writing.history({ id }), history);
  assert.equal(store.db.prepare('SELECT body FROM original_drafts WHERE doc_id=?').get(id).body, '暂存稿');
  assert.equal(writing.save({ id, expectedRevision: 1, text: '暂存稿' }).revision, 2);

  store.db.prepare('INSERT INTO original_drafts(doc_id,base,body,edits,updated) VALUES (?,?,?,?,?)')
    .run(id, 1, '过期暂存稿', 'null', Date.now());
  assert.equal(writing.preview({ id }).text, '暂存稿');
  assert.equal(writing.exportText({ id }).text, '暂存稿');
});

test('原创资料在同一类别内排序，不跨入角色或设定', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const writing = new WritingService(store);
  const { id: workId } = writing.createWork({ title: '测试小说' });
  const { id: first } = writing.createDoc({ workId, kind: 'outline', title: '大纲甲' });
  const { id: character } = writing.createDoc({ workId, kind: 'character', title: '角色' });
  const { id: second } = writing.createDoc({ workId, kind: 'outline', title: '大纲乙' });
  assert.equal(writing.move({ kind: 'doc', id: second, direction: -1 }), true);
  assert.deepEqual(writing.list({ workId }).docs.filter(item => item.volume_id == null).map(item => item.id), [second, character, first]);
  assert.equal(writing.move({ kind: 'doc', id: character, direction: -1 }), false);
});

test('非法版本、哈希、段号、范围、章节重叠、图片和越界 ZIP 路径被拦截', async t => {
  const directory = await temporary(t);
  const variants = [
    ['SCHEMA_INVALID', data => { data.schema_version = 'draft-9.9'; }],
    ['REVISION_MISMATCH', data => { data.volumes[0].normalized_payload.blocks[0].text += '变动'; }],
    ['RANGE_INVALID', data => { data.cards[0].evidence[0].end = 'p000000'; }],
    ['RANGE_INVALID', data => { data.cards[0].evidence[0].start = 'p000005'; }],
    ['REFERENCE_MISSING', data => { data.cards[0].evidence[0].volume_id = randomUUID(); }],
    ['REFERENCE_MISSING', data => { data.cards[0].evidence[0].revision_id = '0'.repeat(64); }],
    ['SIBLING_OVERLAP', data => { data.structures.push({ ...data.structures[0], structure_id: randomUUID() }); }],
    ['STRUCTURE_COVERAGE', data => { data.structures[0].end = 'p000003'; }],
    ['RESOURCE_MISSING', data => { data.resources.push({ path: 'assets/probe.png', sha256: hash(png), purpose: 'image' }); }]
  ];
  for (const [code, mutate] of variants) {
    const result = await freshSample();
    mutate(result);
    await assert.rejects(readResultPackage(await zip(directory, result)), { code });
  }
  const bad = JSON.parse(await readFile(new URL('invalid-reference.json', examples), 'utf8'));
  await assert.rejects(readResultPackage(await zip(directory, bad)), { code: 'RANGE_INVALID' });
  const result = await freshSample();
  result.resources.push({ path: 'assets/probe.png', sha256: hash(png), purpose: 'image' });
  const wrong = await zip(directory, result, { 'assets/probe.png': Buffer.from('wrong') });
  await assert.rejects(readResultPackage(wrong), { code: 'RESOURCE_HASH' });
  const valid = await zip(directory, result, { 'assets/probe.png': png });
  const modified = await readFile(valid);
  const pathname = Buffer.from('assets/probe.png');
  const traversal = Buffer.from('../bad/probe.png');
  assert.equal(pathname.length, traversal.length);
  for (let at = modified.indexOf(pathname); at >= 0; at = modified.indexOf(pathname, at + pathname.length)) traversal.copy(modified, at);
  await writeFile(valid, modified);
  await assert.rejects(readResultPackage(valid), /relative path|unsafe|unsupported/i);
});

test('合法导入、重导幂等、冲突整批回滚、补正文版本和手改保护', async t => {
  const directory = await temporary(t);
  const store = new Store(':memory:');
  t.after(() => store.close());
  const reference = new ReferenceService(store);
  const importer = new ImportService(reference);
  const sample = await freshSample();
  const initial = await zip(directory, sample);
  const review = await importer.inspect(initial);
  assert.equal(reference.list().works.length, 0);
  assert.equal(importer.preview({ batchId: review.id, volumeId: sample.volumes[0].volume_id,
    revisionId: sample.volumes[0].revision_id, start: 'p000002', end: 'p000004' }).blocks[1].highlighted, true);
  importer.commit({ batchId: review.id });
  const { work_id: workId } = sample.work;
  const { card_id: cardId } = sample.cards[0];
  reference.editCard({ workId, expectedRevision: 1, card: { ...sample.cards[0], title: '手改后的标题' } });
  assert.equal((await importer.inspect(initial)).status, 'duplicate');
  assert.equal(reference.getCard({ workId, cardId }).title, '手改后的标题');
  const originalRevision = sample.volumes[0].revision_id;
  sample.volumes[0].normalized_payload.blocks[0].text += ' 再版';
  const newRevision = revise(sample);
  await assert.rejects(importer.inspect(await zip(directory, sample)), { code: 'IMPORT_ID_CONFLICT' });
  sample.package_id = randomUUID();
  sample.cards.push({ ...sample.cards[0], card_id: randomUUID(), title: '新的有据卡片' });
  const update = await importer.inspect(await zip(directory, sample));
  assert.equal(update.conflicts.length, 1);
  assert.throws(() => importer.commit({ batchId: update.id }), { code: 'IMPORT_CONFLICT' });
  assert.equal(reference.list().works[0].volumes[0].revisions.length, 1);
  assert.equal(importer.commit({ batchId: update.id, keepAll: true }).stats.cardsKept, 1);
  assert.equal(reference.listCards({ workId }).cards.length, 2);
  const volumeId = sample.volumes[0].volume_id;
  assert.equal(reference.getCard({ workId, cardId }).evidence[0].revision_id, originalRevision);
  assert.equal(reference.read({ workId, volumeId, revisionId: originalRevision }).blocks[0].text, '序章 灯塔');
  assert.match(reference.read({ workId, volumeId, revisionId: newRevision }).blocks[0].text, /再版/);
});

test('已发布的卡只在内容和证据一致时允许单独改类', async t => {
  let store;
  const directory = await temporary(t, () => store?.close());
  const dbPath = join(directory, 'library.sqlite');
  const patchPath = join(directory, 'patch.json');
  store = new Store(dbPath);
  const reference = new ReferenceService(store);
  const importer = new ImportService(reference);
  const sample = await freshSample();
  importer.commit({ batchId: (await importer.inspect(await zip(directory, sample))).id });
  const workId = sample.work.work_id;
  const initial = sample.cards[0];
  const cardId = initial.card_id;
  const published = { ...initial, title: '发布后的标题' };
  reference.editCard({ workId, expectedRevision: 1, card: published });
  const entry = {
    id: reference.cardRow(workId, cardId).id, workId, cardId, expectedRevision: 2,
    previousCategory: published.category, category: published.category === 'setting' ? 'character' : 'setting',
    title: published.title, content: published.content, evidence: published.evidence,
    claimType: published.claim_type, aliases: published.aliases ?? [], relatedCardIds: published.related_card_ids ?? []
  };
  const script = fileURLToPath(new URL('../scripts/revise-reference-cards.mjs', import.meta.url));
  const run = (mode, ...args) => spawnSync(process.execPath,
    ['--disable-warning=ExperimentalWarning', script, mode, dbPath, patchPath, ...args], { encoding: 'utf8' });
  for (const invalid of [
    { title: initial.title },
    { evidence: [{ ...entry.evidence[0], end: entry.evidence[0].start }] },
    { aliases: ['未发布的别名'] },
    { aliases: undefined },
    { previousCategory: entry.category }
  ]) {
    await writeFile(patchPath, JSON.stringify({ cards: [{ ...entry, ...invalid }] }));
    assert.match(run('--check').stderr, /protected or stale revision/);
  }
  await writeFile(patchPath, JSON.stringify({ cards: [entry] }));
  const applied = run('--apply', join(directory, 'before.sqlite'));
  assert.equal(applied.status, 0, applied.stderr);
  const after = reference.getCard({ workId, cardId });
  assert.equal(after.category, entry.category);
  assert.equal(after.title, published.title);
  assert.equal(after.revision, 3);
  assert.equal(JSON.parse(run('--check').stdout).unchanged, 1);

  reference.editCard({ workId, expectedRevision: 3, card: { ...published, category: entry.category, title: '用户手改' } });
  assert.match(run('--check').stderr, /protected or stale revision/);
  assert.equal(reference.getCard({ workId, cardId }).title, '用户手改');
});

test('插图、注释、三百万字阅读窗口、FTS/无结果/筛选/取消及模型故障降级', async t => {
  const directory = await temporary(t);
  const store = new Store(':memory:');
  t.after(() => store.close());
  const reference = new ReferenceService(store);
  const importer = new ImportService(reference);
  const sample = await freshSample();
  const volume = sample.volumes[0];
  sample.cards[0].content += '他们随后去了太阳之国。至于需要多少胜利或时间，角色还不确定。';
  volume.normalized_payload.blocks.push(
    { kind: 'image', text: '灯塔插图', asset_sha256: hash(png), note_target: null },
    { kind: 'note', text: '灯塔的注释。', asset_sha256: null, note_target: 'p000002' }
  );
  sample.resources.push({ path: 'assets/probe.png', sha256: hash(png), purpose: 'image' });
  const paragraph = { kind: 'text', text: '长篇阅读窗。'.repeat(42), asset_sha256: null, note_target: null };
  volume.normalized_payload.blocks.push(...Array.from({ length: 12000 }, () => paragraph));
  sample.structures[0].end = paragraphId(volume.normalized_payload.blocks.length);
  const revisionId = revise(sample);
  sample.cards[0].evidence[0].revision_id = revisionId;
  const review = await importer.inspect(await zip(directory, sample, { 'assets/probe.png': png }));
  importer.commit({ batchId: review.id });
  const { work_id: workId } = sample.work;
  const head = reference.read({ workId, volumeId: volume.volume_id, revisionId });
  assert.deepEqual(head.blocks[1].notes, ['p000006']);
  assert.match(reference.asset({ workId, hash: hash(png) }), /^data:image\/png;base64,/);
  const page = reference.read({ workId, volumeId: volume.volume_id, revisionId, start: 'p010000' });
  assert.equal(page.blocks.length, 120);
  assert.equal(page.blocks.find(block => block.highlighted).ordinal, 10000);
  const writing = new WritingService(store);
  const { id: original } = writing.createWork({ title: '原创保密词绛星' });
  const [{ id }] = writing.list({ workId: original }).docs;
  writing.save({ id, expectedRevision: 0, text: '原创保密词绛星' });
  const search = new SearchService(reference, { id: 'failed-worker', embed: modelUnavailable });
  const found = await search.query({ query: '燈塔' });
  assert.equal(found.hits[0].card_id, sample.cards[0].card_id);
  assert.equal(found.degraded, true);
  assert.deepEqual((await search.query({ query: '海王星绕太阳公转需要多少年？' })).hits, []);
  assert.deepEqual((await search.query({ query: '海王星公转需要多少年？' })).hits, []);
  assert.equal((await search.query({ query: '点亮灯塔需要多少记忆？' })).hits[0].card_id, sample.cards[0].card_id);
  assert.equal((await search.query({ query: '原创保密词绛星' })).hits.length, 0);
  assert.equal((await search.query({ query: '灯塔', categories: ['character'] })).hits.length, 0);
  await assert.rejects(search.query({ query: '灯塔' }, { signal: AbortSignal.abort(new Error('probe cancelled')) }), /cancelled/);
  reference.setHidden({ workId, hidden: true });
  assert.equal((await search.query({ query: '灯塔' })).hits.length, 0);
});

test('恢复真实 SQLite 快照后原创、标记、手改、证据和导入计数一致', async t => {
  let store;
  const directory = await temporary(t, () => store?.close());
  store = new Store(join(directory, 'library.sqlite'));
  const writing = new WritingService(store);
  const reference = new ReferenceService(store);
  const importer = new ImportService(reference);
  const backup = new BackupService(store);
  const { id: original } = writing.createWork({ title: '备份演练' });
  const [{ id }] = writing.list({ workId: original }).docs;
  writing.save({ id, expectedRevision: 0, text: '留在备份里的正文', boundary: true });
  writing.addMark({ id, expectedRevision: 1, start: 0, end: 2, type: 'key', note: '保留' });
  const sample = await freshSample();
  const initial = await zip(directory, sample);
  importer.commit({ batchId: (await importer.inspect(initial)).id });
  const { work_id: workId } = sample.work;
  const { card_id: cardId } = sample.cards[0];
  reference.editCard({ workId, expectedRevision: 1, card: { ...sample.cards[0], title: '备份前手改' } });
  const before = reference.getCard({ workId, cardId });
  const filename = join(directory, 'test-backup.zip');
  await backup.export(filename);
  writing.save({ id, expectedRevision: 1, text: '备份后版本' });
  reference.editCard({ workId, expectedRevision: 2, card: { ...sample.cards[0], title: '备份后手改' } });
  const { previous } = await backup.restore(filename);
  assert.ok((await readFile(previous)).length > 0);
  assert.equal(writing.open({ id }).text, '留在备份里的正文');
  assert.equal(writing.marks(id)[0].note, '保留');
  assert.deepEqual(reference.getCard({ workId, cardId }), before);
  assert.equal((await importer.inspect(initial)).status, 'duplicate');
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM reference_imports').get().n, 1);
});
