import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { fail } from './store.mjs';
import { paragraphId, paragraphNumber, readResultPackage, validateCard } from './protocol.mjs';
import { cardSearchText, categoryLabels, searchTerms } from './search-text.mjs';

const imageMedia = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function volumeSortKey(title) {
  const normalized = title.normalize('NFKC');
  const ordinal = /^第(\d+|[一二三四五六七八九]|[一二三四五六七八九]?十[一二三四五六七八九]?)卷/u.exec(normalized);
  if (!ordinal) return '1' + title;
  const digits = '零一二三四五六七八九';
  const [tens, ones] = ordinal[1].split('十');
  const number = ones === undefined
    ? (digits.includes(tens) ? digits.indexOf(tens) : Number(tens))
    : 10 * (tens ? digits.indexOf(tens) : 1) + (ones ? digits.indexOf(ones) : 0);
  if (!Number.isSafeInteger(number)) return '1' + title;
  return `0${String(number).padStart(16, '0')}${normalized.slice(ordinal[0].length)}`;
}

function plainCard(card) {
  return {
    card_id: card.card_id, category: card.category, title: card.title, content: card.content, claim_type: card.claim_type,
    evidence: card.evidence.map(({ volume_id, revision_id, start, end }) => ({ volume_id, revision_id, start, end })),
    aliases: card.aliases ?? [], related_card_ids: card.related_card_ids ?? []
  };
}

function sameCard(a, b) {
  return JSON.stringify(plainCard(a)) === JSON.stringify(plainCard(b));
}

export class ReferenceService {
  generation = 0;

  constructor(store) {
    this.store = store;
    this.lookup = {
      volumeOwner: volumeId => this.db.prepare('SELECT work_id FROM reference_volumes WHERE volume_id=?').get(volumeId)?.work_id,
      revision: (workId, volumeId, revisionId) => this.revision(workId, volumeId, revisionId),
      card: (workId, cardId) => Boolean(this.cardRow(workId, cardId))
    };
  }

  get db() {
    return this.store.db;
  }

  revision(workId, volumeId, revisionId) {
    return this.db.prepare(`
      SELECT r.count,r.imported,v.title AS volume_title,w.title AS work_title
      FROM reference_revisions r JOIN reference_volumes v USING(volume_id) JOIN reference_works w USING(work_id)
      WHERE w.work_id=? AND r.volume_id=? AND r.revision_id=?
    `).get(workId, volumeId, revisionId);
  }

  list() {
    const works = this.db.prepare('SELECT * FROM reference_works ORDER BY deleted IS NOT NULL,title,work_id').all();
    const volumes = this.db.prepare('SELECT * FROM reference_volumes ORDER BY title,volume_id').all()
      .map(volume => ({ volume, key: volumeSortKey(volume.title) }))
      .sort((a, b) => a.key < b.key ? -1 : Number(a.key > b.key))
      .map(({ volume }) => volume);
    const revisions = this.db.prepare('SELECT * FROM reference_revisions ORDER BY imported DESC,revision_id').all();
    const byVolume = Map.groupBy(revisions, revision => revision.volume_id);
    const byWork = Map.groupBy(volumes, volume => volume.work_id);
    const covers = this.db.prepare(`
      SELECT s.volume_id, b.asset_sha256
      FROM reference_structures s JOIN reference_volumes v USING(volume_id)
      JOIN reference_revisions r ON r.volume_id=s.volume_id AND r.revision_id=s.revision_id
      JOIN reference_blocks b ON b.volume_id=s.volume_id AND b.revision_id=s.revision_id AND b.ordinal=s.start
      JOIN reference_assets a ON a.work_id=v.work_id AND a.hash=b.asset_sha256
      WHERE s.type='frontmatter' AND s.title IN ('封面','封面与卷首图')
        AND b.kind='image' AND a.media_type IN ('image/jpeg','image/png','image/webp') AND length(a.body)<=1048576
      ORDER BY r.imported DESC,s.revision_id,b.asset_sha256
    `).all();
    const byCoverVolume = Map.groupBy(covers, cover => cover.volume_id);
    return {
      works: works.map(work => {
        const workVolumes = byWork.get(work.work_id) ?? [];
        const markedCover = workVolumes.map(volume => byCoverVolume.get(volume.volume_id)?.[0]).find(Boolean);
        const cover = markedCover ? this.asset({ workId: work.work_id, hash: markedCover.asset_sha256 }) : null;
        return {
          ...work, cover, volumes: workVolumes.map(volume => ({
            ...volume, revisions: byVolume.get(volume.volume_id) ?? []
          }))
        };
      })
    };
  }

  setHidden({ workId, hidden }) {
    if (!this.db.prepare('UPDATE reference_works SET deleted=? WHERE work_id=?').run(hidden ? Date.now() : null, workId).changes) {
      fail('REFERENCE_NOT_FOUND', '找不到该参考作品');
    }
    this.generation++;
    return true;
  }

  cardRow(workId, cardId) {
    return this.db.prepare('SELECT * FROM reference_cards WHERE work_id=? AND card_id=?').get(workId, cardId);
  }

  cardDetails(row) {
    const evidence = this.db.prepare(`
      SELECT e.volume_id,e.revision_id,e.start,e.end,v.title AS volume_title,
        (SELECT s.title FROM reference_structures s WHERE s.volume_id=e.volume_id AND s.revision_id=e.revision_id
         AND s.start<=e.start AND s.end>=e.start AND s.type NOT IN ('volume','scene') ORDER BY s.end-s.start LIMIT 1) AS section
      FROM reference_evidence e JOIN reference_volumes v USING(volume_id)
      WHERE e.card_row=? ORDER BY e.position
    `).all(row.id).map(range => ({ ...range, start: paragraphId(range.start), end: paragraphId(range.end) }));
    return {
      work_id: row.work_id, work_title: row.work_title ?? this.db.prepare('SELECT title FROM reference_works WHERE work_id=?').get(row.work_id).title,
      card_id: row.card_id, category: row.category, title: row.title, content: row.content, claim_type: row.claim_type,
      revision: row.revision, evidence, aliases: JSON.parse(row.aliases), related_card_ids: JSON.parse(row.related_card_ids)
    };
  }

  getCard({ workId, cardId }) {
    const row = this.cardRow(workId, cardId);
    if (!row) fail('CARD_NOT_FOUND', '找不到该知识卡');
    return this.cardDetails(row);
  }

  listCards({ workId, offset = 0 }) {
    if (!Number.isSafeInteger(offset) || offset < 0) fail('CARD_PAGE', '页码无效');
    const rows = this.db.prepare('SELECT * FROM reference_cards WHERE work_id=? ORDER BY id LIMIT 21 OFFSET ?').all(workId, offset);
    return { cards: rows.slice(0, 20).map(row => this.cardDetails(row)), next: rows.length > 20 ? offset + 20 : null };
  }

  writeCard(workId, card, prior) {
    const text = cardSearchText(card);
    const args = [card.category, card.title, card.content, card.claim_type,
      JSON.stringify(card.aliases ?? []), JSON.stringify(card.related_card_ids ?? []), text];
    let rowId;
    if (prior) {
      rowId = prior.id;
      this.db.prepare(`
        UPDATE reference_cards SET category=?,title=?,content=?,claim_type=?,aliases=?,related_card_ids=?,search_text=?,revision=revision+1 WHERE id=?
      `).run(...args, rowId);
      this.db.prepare('DELETE FROM reference_evidence WHERE card_row=?').run(rowId);
      this.db.prepare('DELETE FROM reference_fts WHERE rowid=?').run(rowId);
      this.db.prepare('DELETE FROM reference_vectors WHERE card_row=?').run(rowId);
    } else {
      rowId = this.db.prepare(`
        INSERT INTO reference_cards(work_id,card_id,category,title,content,claim_type,aliases,related_card_ids,search_text)
        VALUES(?,?,?,?,?,?,?,?,?)
      `).run(workId, card.card_id, ...args).lastInsertRowid;
    }
    this.db.prepare('INSERT INTO reference_fts(rowid,tokens) VALUES(?,?)').run(rowId, searchTerms(text).join(' '));
    const addEvidence = this.db.prepare('INSERT INTO reference_evidence VALUES(?,?,?,?,?,?)');
    card.evidence.forEach((range, index) => addEvidence.run(
      rowId, index, range.volume_id, range.revision_id, paragraphNumber(range.start), paragraphNumber(range.end)
    ));
  }

  editCard({ workId, expectedRevision, card }) {
    const row = this.cardRow(workId, card?.card_id);
    if (!row) fail('CARD_NOT_FOUND', '找不到要修改的知识卡');
    if (row.revision !== expectedRevision) fail('CARD_STALE', '卡片已更新，请重新打开后再编辑');
    const { warnings } = validateCard(card, workId, this.lookup);
    if (!sameCard(card, this.cardDetails(row))) {
      this.store.transaction(() => this.writeCard(workId, card, row));
      this.generation++;
    }
    return { card: this.getCard({ workId, cardId: card.card_id }), warnings };
  }

  read({ workId, volumeId, revisionId, start = 'p000001', end = start, at }) {
    const revision = this.revision(workId, volumeId, revisionId);
    if (!revision) fail('READER_REVISION', '找不到证据引用的正文版本');
    const first = paragraphNumber(start);
    const last = paragraphNumber(end);
    if (!first || !last || first > last || last > revision.count) fail('READER_RANGE', '证据段落超出该版本范围');
    if (at != null && (!Number.isSafeInteger(at) || at < 1 || at > revision.count)) fail('READER_PAGE', '阅读页码无效');
    const pageStart = at ?? Math.max(1, first - 8);
    const pageEnd = Math.min(pageStart + 119, revision.count);
    const blocks = this.db.prepare(`
      SELECT b.ordinal,b.kind,b.text,b.asset_sha256,b.note_target,
        (SELECT group_concat(n.ordinal, ',') FROM reference_blocks n WHERE n.volume_id=b.volume_id
         AND n.revision_id=b.revision_id AND n.note_target=printf('p%06d',b.ordinal)) AS note_ordinals
      FROM reference_blocks b WHERE b.volume_id=? AND b.revision_id=? AND b.ordinal BETWEEN ? AND ? ORDER BY b.ordinal
    `).all(volumeId, revisionId, pageStart, pageEnd).map(({ note_ordinals, ...block }) => ({
      ...block, paragraph_id: paragraphId(block.ordinal),
      notes: note_ordinals ? note_ordinals.split(',').map(value => paragraphId(Number(value))) : [],
      highlighted: block.ordinal >= first && block.ordinal <= last
    }));
    const structures = this.db.prepare(`
      SELECT structure_id,parent_id,type,title,start,end FROM reference_structures
      WHERE volume_id=? AND revision_id=? ORDER BY start,end DESC,structure_id
    `).all(volumeId, revisionId).map(node => ({ ...node, start: paragraphId(node.start), end: paragraphId(node.end) }));
    return {
      ...revision, blocks, structures, first, last, pageStart, pageEnd,
      previous: pageStart > 1 ? Math.max(1, pageStart - 120) : null,
      next: pageEnd < revision.count ? pageEnd + 1 : null
    };
  }

  asset({ workId, hash }) {
    const row = this.db.prepare('SELECT media_type,body FROM reference_assets WHERE work_id=? AND hash=?').get(workId, hash);
    if (!row?.media_type.startsWith('image/')) fail('READER_IMAGE', '找不到该插图');
    return `data:${row.media_type};base64,${Buffer.from(row.body).toString('base64')}`;
  }
}

export class ImportService {
  pending = null;
  inspection = 0;

  constructor(reference) {
    this.reference = reference;
  }

  get db() {
    return this.reference.db;
  }

  findImport(result, digest) {
    const byId = this.db.prepare('SELECT digest,stats FROM reference_imports WHERE package_id=?').get(result.package_id);
    if (byId && byId.digest !== digest) fail('IMPORT_ID_CONFLICT', '相同 package_id 已用于内容不同的包');
    return byId ?? this.db.prepare('SELECT stats FROM reference_imports WHERE digest=?').get(digest);
  }

  async inspect(filePath, { signal } = {}) {
    const inspection = ++this.inspection;
    this.pending = null;
    const data = await readResultPackage(filePath, this.reference.lookup, { signal });
    signal?.throwIfAborted();
    if (inspection !== this.inspection) fail('IMPORT_CANCELLED', '导入审核已被另一批次替换');
    const { result, digest, warnings } = data;
    const existing = this.findImport(result, digest);
    if (existing) return { status: 'duplicate', stats: JSON.parse(existing.stats) };
    const workId = result.work.work_id;
    const conflicts = [];
    const baseline = new Map();
    for (const card of result.cards) {
      const row = this.reference.cardRow(workId, card.card_id);
      if (!row) continue;
      baseline.set(card.card_id, row.revision);
      const current = this.reference.cardDetails(row);
      if (!sameCard(current, card)) conflicts.push({ current, incoming: card });
    }
    const id = randomUUID();
    this.pending = { id, ...data, baseline };
    const samples = [...new Set([
      ...Object.keys(categoryLabels).map(category => result.cards.find(card => card.category === category)),
      result.cards.find(card => card.claim_type === 'interpretation')
    ].filter(Boolean))];
    return {
      status: 'review_ready', id, work: result.work, count: result.cards.length, conflicts, samples, warnings, report: result.report,
      volumes: result.volumes.map(volume => ({
        volume_id: volume.volume_id, title: volume.title, revision_id: volume.revision_id,
        count: volume.normalized_payload.blocks.length
      }))
    };
  }

  preview({ batchId, volumeId, revisionId, start, end }) {
    if (!this.pending || batchId !== this.pending.id) fail('IMPORT_EXPIRED', '导入审核已失效');
    const { result } = this.pending;
    const volume = result.volumes.find(item => item.volume_id === volumeId && item.revision_id === revisionId);
    if (!volume) return this.reference.read({ workId: result.work.work_id, volumeId, revisionId, start, end });
    const first = paragraphNumber(start);
    const last = paragraphNumber(end);
    if (!first || !last || last < first || last > volume.normalized_payload.blocks.length) fail('IMPORT_RANGE', '抽查范围无效');
    const offset = Math.max(0, first - 3);
    const blocks = volume.normalized_payload.blocks.slice(offset, Math.min(last + 2, offset + 30))
      .map((block, index) => ({
        ...block, ordinal: offset + index + 1, paragraph_id: paragraphId(offset + index + 1),
        highlighted: offset + index + 1 >= first && offset + index + 1 <= last
      }));
    return { blocks, volume_title: volume.title, work_title: result.work.title, first, last };
  }

  cancel({ id } = {}) {
    if (id == null || this.pending?.id === id) this.pending = null;
    return true;
  }

  commit({ batchId, resolutions = {}, keepAll = false }) {
    const batch = this.pending;
    if (!batch || batch.id !== batchId) fail('IMPORT_EXPIRED', '导入审核已失效，请重新选择包');
    const { result, digest, assets, baseline } = batch;
    const workId = result.work.work_id;
    const stats = this.reference.store.transaction(() => {
      const existing = this.findImport(result, digest);
      if (existing) return JSON.parse(existing.stats);
      const totals = { cardsAdded: 0, cardsUpdated: 0, cardsKept: 0, cardsSkipped: 0, revisionsAdded: 0 };
      this.db.prepare('INSERT INTO reference_works(work_id,title) VALUES(?,?) ON CONFLICT(work_id) DO UPDATE SET title=excluded.title')
        .run(workId, result.work.title);
      for (const resource of result.resources) {
        const media = imageMedia[extname(resource.path).toLowerCase()] ?? 'application/octet-stream';
        this.db.prepare('INSERT OR IGNORE INTO reference_assets VALUES(?,?,?,?)').run(workId, resource.sha256, media, assets.get(resource.path));
      }
      this.writeVolumes(result, totals);
      for (const card of result.cards) {
        const prior = this.reference.cardRow(workId, card.card_id);
        if (!prior) {
          this.reference.writeCard(workId, card);
          totals.cardsAdded++;
          continue;
        }
        if (sameCard(this.reference.cardDetails(prior), card)) {
          totals.cardsSkipped++;
          continue;
        }
        if (prior.revision !== baseline.get(card.card_id)) fail('IMPORT_STALE', '审核期间有卡片发生变化，请重新检查导入包');
        const resolution = Object.hasOwn(resolutions, card.card_id) ? resolutions[card.card_id] : { mode: keepAll ? 'keep' : null };
        if (resolution.mode === 'keep') {
          totals.cardsKept++;
          continue;
        }
        if (!['accept', 'merge'].includes(resolution.mode)) fail('IMPORT_CONFLICT', '还有未处理的卡片差异');
        const accepted = resolution.mode === 'merge' ? resolution.card : card;
        if (accepted?.card_id !== card.card_id) fail('IMPORT_CONFLICT', '合并时必须保留原卡片 ID');
        validateCard(accepted, workId, this.reference.lookup);
        this.reference.writeCard(workId, accepted, prior);
        totals.cardsUpdated++;
      }
      this.db.prepare('INSERT INTO reference_imports VALUES(?,?,?,?,?,?)')
        .run(result.package_id, digest, workId, Date.now(), JSON.stringify(result.report), JSON.stringify(totals));
      return totals;
    });
    this.pending = null;
    this.reference.generation++;
    return { status: 'committed', stats };
  }

  writeVolumes(result, totals) {
    const addVolume = this.db.prepare(`
      INSERT INTO reference_volumes VALUES(?,?,?) ON CONFLICT(volume_id) DO UPDATE SET title=excluded.title
    `);
    const addRevision = this.db.prepare('INSERT OR IGNORE INTO reference_revisions VALUES(?,?,?,?)');
    const addBlock = this.db.prepare('INSERT INTO reference_blocks VALUES(?,?,?,?,?,?,?)');
    for (const volume of result.volumes) {
      const { volume_id: volumeId, revision_id: revisionId } = volume;
      const { blocks } = volume.normalized_payload;
      const owner = this.reference.lookup.volumeOwner(volumeId);
      if (owner && owner !== result.work.work_id) fail('IMPORT_ID_CONFLICT', '分卷 ID 已属于另一部作品');
      addVolume.run(volumeId, result.work.work_id, volume.title);
      if (addRevision.run(volumeId, revisionId, blocks.length, Date.now()).changes) {
        blocks.forEach((block, index) => addBlock.run(
          volumeId, revisionId, index + 1, block.kind, block.text, block.asset_sha256, block.note_target
        ));
        totals.revisionsAdded++;
      }
      this.db.prepare('DELETE FROM reference_structures WHERE volume_id=? AND revision_id=?').run(volumeId, revisionId);
    }
    const addStructure = this.db.prepare('INSERT INTO reference_structures VALUES(?,?,?,?,?,?,?,?)');
    for (const node of result.structures) {
      addStructure.run(node.volume_id, node.revision_id, node.structure_id, node.parent_id,
        node.type, node.title, paragraphNumber(node.start), paragraphNumber(node.end));
    }
  }
}
