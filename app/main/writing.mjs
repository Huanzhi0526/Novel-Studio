import { randomUUID } from 'node:crypto';
import { fail } from './store.mjs';

const kinds = new Set(['chapter', 'outline', 'character', 'setting']);
const markTypes = new Set(['foreshadow', 'setup', 'key', 'other']);
const historyInterval = 5 * 60 * 1000;
const tables = { work: 'original_works', volume: 'original_volumes', doc: 'original_docs' };

function titleOf(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 250) {
    fail('WRITING_TITLE', '请输入 1 至 250 字的标题');
  }
  return value.trim();
}

function assertText(text) {
  if (typeof text !== 'string' || text.length > 10_000_000 || !text.isWellFormed() || text.includes('\0')) {
    fail('WRITING_TEXT', '当前文档超过编辑上限或文本无效');
  }
}

function boundary(text, index) {
  if (!Number.isInteger(index) || index < 0 || index > text.length) return false;
  const code = text.charCodeAt(index);
  const previous = text.charCodeAt(index - 1);
  return !(code >= 0xdc00 && code <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff);
}

function verifyEdits(oldText, newText, edits) {
  if (edits == null) return;
  if (!Array.isArray(edits)) fail('WRITING_EDITS', '编辑变更格式无效');
  let text = oldText;
  for (const group of edits) {
    if (!Array.isArray(group)) fail('WRITING_EDITS', '编辑变更格式无效');
    let cursor = 0;
    const parts = [];
    for (const { from, to, insert } of group) {
      if (from < cursor || to < from || !boundary(text, from) || !boundary(text, to) || typeof insert !== 'string') {
        fail('WRITING_EDITS', '编辑变更范围无效');
      }
      parts.push(text.slice(cursor, from), insert);
      cursor = to;
    }
    parts.push(text.slice(cursor));
    text = parts.join('');
  }
  if (text !== newText) fail('WRITING_EDITS', '编辑变更与新正文不一致');
}

function mappedRange(mark, newText, edits) {
  let { start, end, quote } = mark;
  if (edits == null) {
    const contextual = mark.prefix + quote + mark.suffix;
    const at = newText.indexOf(contextual);
    if (at < 0 || newText.indexOf(contextual, at + 1) >= 0) return null;
    start = at + mark.prefix.length;
    return { start, end: start + quote.length };
  }
  for (const group of edits) {
    let shift = 0;
    for (const change of group) {
      if (change.to <= start) {
        shift += change.insert.length - (change.to - change.from);
      } else if (change.from < end) {
        return null;
      }
    }
    start += shift;
    end += shift;
  }
  return newText.slice(start, end) === quote ? { start, end } : null;
}

export class WritingService {
  constructor(store) {
    this.store = store;
  }

  get db() {
    return this.store.db;
  }

  doc(id, includeDeleted = false) {
    const row = this.db.prepare('SELECT * FROM original_docs WHERE id=?').get(id);
    if (!row || (!includeDeleted && row.deleted != null)) fail('WRITING_NOT_FOUND', '找不到该文档');
    return row;
  }

  readText(row) {
    const draft = this.db.prepare('SELECT body FROM original_drafts WHERE doc_id=? AND base=?').get(row.id, row.revision);
    return draft?.body ?? row.body;
  }

  preview({ id }) {
    const row = this.doc(id);
    return { id: row.id, kind: row.kind, title: row.title, text: this.readText(row) };
  }

  list({ workId } = {}) {
    const works = this.db.prepare('SELECT id,title FROM original_works ORDER BY created,id').all();
    if (!workId) return { works, volumes: [], docs: [] };
    const volumes = this.db.prepare('SELECT id,work_id,title,position FROM original_volumes WHERE work_id=? ORDER BY position,id').all(workId);
    const docs = this.db.prepare(
      'SELECT id,volume_id,kind,title,position,deleted,updated FROM original_docs WHERE work_id=? ORDER BY position,id'
    ).all(workId);
    return { works, volumes, docs };
  }

  searchWork({ workId, query }) {
    if (typeof workId !== 'string' || !workId || workId.length > 128) {
      fail('WRITING_WORK', '请先选择要查找的作品');
    }
    if (typeof query !== 'string' || query.length > 250 || !query.isWellFormed() || query.includes('\0')) {
      fail('WRITING_QUERY', '请输入有效的查找文字，最多 250 个字符');
    }
    if (!query.trim()) return [];

    const matches = this.db.prepare(`
      SELECT chapter.id, chapter.title, volume.title AS volumeTitle
      FROM original_volumes volume
      JOIN original_docs chapter ON chapter.work_id=volume.work_id AND chapter.volume_id=volume.id
      LEFT JOIN original_drafts draft ON draft.doc_id=chapter.id AND draft.base=chapter.revision
      WHERE volume.work_id=? AND chapter.kind='chapter' AND chapter.deleted IS NULL
        AND instr(coalesce(draft.body, chapter.body), ?) > 0
      ORDER BY volume.position, volume.id, chapter.position, chapter.id
      LIMIT 60
    `);
    const results = [];
    for (const match of matches.iterate(workId, query)) {
      const text = this.readText(this.doc(match.id));
      const offset = text.indexOf(query);
      let start = Math.max(0, offset - 24);
      let end = Math.min(text.length, offset + query.length + 36);
      if (!boundary(text, start)) start--;
      if (!boundary(text, end)) end++;
      const excerpt = `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
      results.push({ ...match, excerpt, offset });
    }
    return results;
  }

  createWork({ title }) {
    return this.store.transaction(() => {
      const id = randomUUID();
      this.db.prepare('INSERT INTO original_works VALUES(?,?,?)').run(id, titleOf(title), Date.now());
      const volume = this.createVolume({ workId: id, title: '第一卷' });
      this.createDoc({ workId: id, volumeId: volume.id, kind: 'chapter', title: '第一章' });
      return { id };
    });
  }

  createVolume({ workId, title }) {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO original_volumes SELECT ?,?,?,coalesce(max(position)+1,0)
      FROM original_volumes WHERE work_id=?`
    ).run(id, workId, titleOf(title), workId);
    return { id };
  }

  createDoc({ workId, volumeId = null, kind, title, text = '' }) {
    if (!kinds.has(kind)) fail('WRITING_KIND', '资料类型无效');
    assertText(text);
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO original_docs(id,work_id,volume_id,kind,title,position,body,updated)
      SELECT ?,?,?,?,?,coalesce(max(position)+1,0),?,? FROM original_docs WHERE work_id=? AND volume_id IS ?`
    ).run(id, workId, volumeId, kind, titleOf(title), text, Date.now(), workId, volumeId);
    return { id };
  }

  rename({ kind, id, title }) {
    if (!Object.hasOwn(tables, kind)) fail('WRITING_KIND', '对象类型无效');
    if (!this.db.prepare(`UPDATE ${tables[kind]} SET title=? WHERE id=?`).run(titleOf(title), id).changes) {
      fail('WRITING_NOT_FOUND', '找不到该对象');
    }
    return true;
  }

  move({ kind, id, direction }) {
    if (!['volume', 'doc'].includes(kind) || ![-1, 1].includes(direction)) fail('WRITING_MOVE', '排序操作无效');
    const table = tables[kind];
    const current = this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
    if (!current || current.deleted != null) fail('WRITING_NOT_FOUND', '找不到该对象');
    const peers = kind === 'doc'
      ? this.db.prepare(`
          SELECT id,position FROM original_docs
          WHERE work_id=? AND volume_id IS ? AND kind=? AND deleted IS NULL
          ORDER BY position,id
        `).all(current.work_id, current.volume_id, current.kind)
      : this.db.prepare('SELECT id,position FROM original_volumes WHERE work_id=? ORDER BY position,id').all(current.work_id);
    const neighbor = peers[peers.findIndex(item => item.id === id) + direction];
    if (!neighbor) return false;
    return this.store.transaction(() => {
      const write = this.db.prepare(`UPDATE ${table} SET position=? WHERE id=?`);
      write.run(current.position, neighbor.id);
      write.run(neighbor.position, current.id);
      return true;
    });
  }

  marks(id) {
    return this.db.prepare('SELECT id,type,start,end,quote,note,invalid FROM original_marks WHERE doc_id=? ORDER BY start,id').all(id);
  }

  open({ id }) {
    let row = this.doc(id);
    const draft = this.db.prepare('SELECT * FROM original_drafts WHERE doc_id=? AND base=?').get(id, row.revision);
    if (draft) {
      this.save({ id, expectedRevision: draft.base, text: draft.body, edits: JSON.parse(draft.edits), boundary: true });
      row = this.doc(id);
    }
    return {
      id: row.id, work_id: row.work_id, volume_id: row.volume_id, kind: row.kind,
      title: row.title, text: row.body, revision: row.revision, marks: this.marks(id), recovered: Boolean(draft)
    };
  }

  checkRevision(row, expectedRevision) {
    if (row.revision !== expectedRevision) fail('WRITING_STALE', '正文版本已变化，请先保留当前编辑并重新打开');
  }

  stage({ id, expectedRevision, text, edits }) {
    assertText(text);
    const row = this.doc(id);
    this.checkRevision(row, expectedRevision);
    if (row.body === text && !edits?.length) {
      this.db.prepare('DELETE FROM original_drafts WHERE doc_id=?').run(id);
      return true;
    }
    this.db.prepare(`
      INSERT INTO original_drafts VALUES(?,?,?,?,?)
      ON CONFLICT(doc_id) DO UPDATE SET base=excluded.base,body=excluded.body,edits=excluded.edits,updated=excluded.updated
    `).run(id, expectedRevision, text, JSON.stringify(edits ?? null), Date.now());
    return true;
  }

  snapshot(id, revision, body, saved) {
    this.db.prepare('INSERT OR IGNORE INTO original_history VALUES(?,?,?,?)').run(id, revision, body, saved);
    this.db.prepare(`
      DELETE FROM original_history WHERE doc_id=? AND revision NOT IN (
        SELECT revision FROM original_history WHERE doc_id=? ORDER BY revision DESC LIMIT 20
      )`
    ).run(id, id);
  }

  save({ id, expectedRevision, text, edits, boundary: atBoundary = false }) {
    assertText(text);
    const row = this.doc(id);
    this.checkRevision(row, expectedRevision);
    return this.store.transaction(() => {
      const now = Date.now();
      let revision = row.revision;
      if (text !== row.body) {
        verifyEdits(row.body, text, edits);
        const last = this.db.prepare('SELECT max(saved) AS time FROM original_history WHERE doc_id=?').get(id);
        if (atBoundary || last.time == null || now - last.time >= historyInterval) {
          this.snapshot(id, row.revision, row.body, now);
        }
        revision++;
        this.db.prepare('UPDATE original_docs SET body=?,revision=?,updated=? WHERE id=?').run(text, revision, now, id);
        const update = this.db.prepare('UPDATE original_marks SET start=?,end=?,prefix=?,suffix=?,invalid=? WHERE id=?');
        for (const mark of this.db.prepare('SELECT * FROM original_marks WHERE doc_id=? AND invalid=0').all(id)) {
          const range = mappedRange(mark, text, edits);
          if (!range) {
            update.run(mark.start, mark.end, mark.prefix, mark.suffix, 1, mark.id);
          } else {
            const { start, end } = range;
            update.run(start, end, text.slice(Math.max(0, start - 24), start), text.slice(end, end + 24), 0, mark.id);
          }
        }
      }
      if (atBoundary && revision > 0) this.snapshot(id, revision, text, now);
      this.db.prepare('DELETE FROM original_drafts WHERE doc_id=?').run(id);
      return { revision, marks: this.marks(id) };
    });
  }

  addMark({ id, expectedRevision, start, end, type, note = '', markId }) {
    const row = this.doc(id);
    this.checkRevision(row, expectedRevision);
    if (!markTypes.has(type) || !boundary(row.body, start) || !boundary(row.body, end) || start >= end) {
      fail('MARK_RANGE', '请选择有效的正文范围和标记类型');
    }
    if (typeof note !== 'string' || note.length > 5000) fail('MARK_NOTE', '标记备注过长');
    const params = [
      type, start, end, row.body.slice(start, end),
      row.body.slice(Math.max(0, start - 24), start), row.body.slice(end, end + 24), note
    ];
    if (markId) {
      const result = this.db.prepare(`
        UPDATE original_marks SET type=?,start=?,end=?,quote=?,prefix=?,suffix=?,note=?,invalid=0 WHERE id=? AND doc_id=?
      `).run(...params, markId, id);
      if (!result.changes) fail('MARK_NOT_FOUND', '找不到要修改的标记');
    } else {
      this.db.prepare(`
        INSERT INTO original_marks(id,doc_id,type,start,end,quote,prefix,suffix,note) VALUES(?,?,?,?,?,?,?,?,?)
      `).run(randomUUID(), id, ...params);
    }
    return this.marks(id);
  }

  deleteMark({ id, markId }) {
    this.doc(id);
    this.db.prepare('DELETE FROM original_marks WHERE id=? AND doc_id=?').run(markId, id);
    return this.marks(id);
  }

  history({ id }) {
    const row = this.doc(id);
    return this.db.prepare(
      'SELECT revision,saved,body AS text FROM original_history WHERE doc_id=? AND revision<>? ORDER BY revision DESC'
    ).all(id, row.revision);
  }

  restoreHistory({ id, revision, expectedRevision }) {
    const history = this.db.prepare('SELECT body FROM original_history WHERE doc_id=? AND revision=?').get(id, revision);
    if (!history) fail('WRITING_HISTORY', '找不到该历史版本');
    this.save({ id, expectedRevision, text: history.body, boundary: true });
    return this.open({ id });
  }

  trash({ id }) {
    this.open({ id });
    this.db.prepare('UPDATE original_docs SET deleted=? WHERE id=?').run(Date.now(), id);
    return true;
  }

  restore({ id }) {
    this.doc(id, true);
    this.db.prepare('UPDATE original_docs SET deleted=NULL WHERE id=?').run(id);
    return true;
  }

  exportText({ id, workId, draftText }) {
    if (id) {
      const row = this.doc(id);
      if (draftText != null) assertText(draftText);
      return { title: row.title, text: draftText ?? this.readText(row) };
    }
    const work = this.db.prepare('SELECT title FROM original_works WHERE id=?').get(workId);
    if (!work) fail('WRITING_NOT_FOUND', '找不到该作品');
    const { volumes, docs } = this.list({ workId });
    const parts = [work.title];
    for (const volume of volumes) {
      parts.push(volume.title);
      for (const chapter of docs.filter(doc => doc.volume_id === volume.id && doc.deleted == null)) {
        parts.push(chapter.title, this.readText(this.doc(chapter.id)));
      }
    }
    return { title: work.title, text: parts.join('\n\n') };
  }
}
