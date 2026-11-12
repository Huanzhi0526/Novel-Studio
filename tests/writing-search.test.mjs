import assert from 'node:assert/strict';
import test from 'node:test';
import { Store } from '../app/main/store.mjs';
import { WritingService } from '../app/main/writing.mjs';

function fixture(t) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const writing = new WritingService(store);
  const { id: workId } = writing.createWork({ title: '当前小说' });
  const { volumes: [{ id: volumeId }], docs: [{ id: chapterId }] } = writing.list({ workId });
  function chapter(title, text, scope = {}) {
    return writing.createDoc({ workId, volumeId, kind: 'chapter', title, text, ...scope }).id;
  }
  return { store, writing, workId, volumeId, chapterId, chapter };
}

test('work search uses literal first matches, UTF-16 offsets and well-formed excerpts', t => {
  const { writing, workId, chapter } = fixture(t);
  const query = '窗台%_a';
  const before = '起'.repeat(30) + '🙂' + '甲'.repeat(23);
  const after = '乙'.repeat(35) + '🙂' + '末'.repeat(28) + query;
  const id = chapter('全文查找', before + query + after);
  chapter('近似词', '窗台xyzA 窗台%_A');

  assert.deepEqual(writing.searchWork({ workId, query }), [{
    id, title: '全文查找', volumeTitle: '第一卷', offset: before.length,
    excerpt: `…🙂${'甲'.repeat(23)}${query}${'乙'.repeat(35)}🙂…`
  }]);
  assert.deepEqual(writing.searchWork({ workId, query: ' 窗台%_a' }), []);
  assert.deepEqual(writing.searchWork({ workId, query: '  ' }), []);
  assert.throws(() => writing.searchWork({ workId, query: '测'.repeat(251) }), { code: 'WRITING_QUERY' });
  assert.throws(() => writing.searchWork({ workId, query: '\ud800' }), { code: 'WRITING_QUERY' });
});

test('work search is read-only, selects current drafts and excludes other text stores', t => {
  const { store, writing, workId, volumeId, chapterId, chapter } = fixture(t);
  const query = '蓝色窗台';
  writing.save({ id: chapterId, expectedRevision: 0, text: '已保存文字' });
  const history = writing.history({ id: chapterId });
  writing.stage({ id: chapterId, expectedRevision: 1, text: `暂存 ${query}` });

  const deleted = chapter('回收站章节', query);
  writing.trash({ id: deleted });
  const stale = chapter('旧暂存章节', '正文没有匹配');
  store.db.prepare('INSERT INTO original_drafts VALUES(?,?,?,?,?)').run(stale, -1, query, null, 0);
  const replaced = chapter('正文被当前暂存替换', query);
  writing.stage({ id: replaced, expectedRevision: 0, text: '新文字' });
  for (const kind of ['outline', 'character', 'setting']) {
    writing.createDoc({ workId, kind, title: '创作资料', text: query });
  }
  const { id: otherId } = writing.createWork({ title: '另一本小说' });
  const [{ id: otherVolume }] = writing.list({ workId: otherId }).volumes;
  chapter('其他小说正文', query, { workId: otherId, volumeId: otherVolume });
  store.db.prepare('INSERT INTO reference_works(work_id,title) VALUES (?,?)').run(workId, '参考作品');
  store.db.prepare('INSERT INTO reference_volumes VALUES (?,?,?)').run(volumeId, workId, '参考第一卷');
  store.db.prepare('INSERT INTO reference_revisions VALUES (?,?,1,0)').run(volumeId, 'reference-revision');
  store.db.prepare('INSERT INTO reference_blocks VALUES (?,?,1,?,?,NULL,NULL)').run(volumeId, 'reference-revision', 'text', query);

  assert.deepEqual(writing.searchWork({ workId, query }), [{
    id: chapterId, title: '第一章', volumeTitle: '第一卷', excerpt: `暂存 ${query}`, offset: 3
  }]);
  assert.equal(writing.doc(chapterId).revision, 1);
  assert.equal(writing.doc(chapterId).body, '已保存文字');
  assert.deepEqual(writing.history({ id: chapterId }), history);
  assert.equal(store.db.prepare('SELECT body FROM original_drafts WHERE doc_id=?').get(chapterId).body, `暂存 ${query}`);
});

test('work search follows current volume and chapter order and stops at sixty results', t => {
  const { writing, workId, chapter } = fixture(t);
  const { id: secondVolume } = writing.createVolume({ workId, title: '第二卷' });
  const query = '重逢';
  const firstVolumeChapters = Array.from({ length: 60 }, (_, i) => chapter(`章 ${i + 1}`, query));
  const secondVolumeChapter = chapter('外传', query, { volumeId: secondVolume });
  writing.move({ kind: 'volume', id: secondVolume, direction: -1 });
  writing.move({ kind: 'doc', id: firstVolumeChapters[1], direction: -1 });

  const results = writing.searchWork({ workId, query });
  assert.deepEqual(results.map(({ id }) => id), [
    secondVolumeChapter, firstVolumeChapters[1], firstVolumeChapters[0], ...firstVolumeChapters.slice(2, 59)
  ]);
});
