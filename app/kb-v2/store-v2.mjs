import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { paragraphId, paragraphNumber } from '../main/protocol.mjs';
import { fail } from '../main/store.mjs';
import { normalizeTextV2, tokenizeForIndex } from './text-index.mjs';

export const databaseVersionV2 = 2001;

const imageMedia = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export const facetKindLabels = {
  identity_appearance: '身份与服饰外貌',
  persona_style: '性格反差与言行',
  relationships: '人际关系张力',
  arc_highlights: '关键经历与弧光',
  core_mechanism: '核心规则与设定',
  cost_constraints: '条件限制与代价',
  narrative_application: '剧情与实战运用'
};

export const layerLabels = {
  scene: '剧情场次',
  character_facet: '人物切面',
  world_facet: '设定机制',
  passage: '原文描写切片'
};

export function parseChineseOrdinal(raw) {
  if (/^\d+$/u.test(raw)) return Number(raw);
  const digits = '零一二三四五六七八九';
  if (raw === '十') return 10;
  const [tens, ones] = raw.split('十');
  if (ones === undefined) {
    return digits.includes(tens) ? digits.indexOf(tens) : NaN;
  }
  const t = tens ? digits.indexOf(tens) : 1;
  const o = ones ? digits.indexOf(ones) : 0;
  return t >= 0 && o >= 0 ? t * 10 + o : NaN;
}

export function parseOrdinalValue(val) {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+$/u.test(trimmed)) return Number(trimmed);
    const pn = paragraphNumber(trimmed);
    if (Number.isFinite(pn)) return pn;
  }
  return 0;
}

export function volumeOrderNumber(title) {
  const norm = title.normalize('NFKC').trim();
  const prequel = /^前传\s*(\d+)/u.exec(norm);
  if (prequel) return Number(prequel[1]);
  const match = /^第(\d+|[零一二三四五六七八九十]+)卷/u.exec(norm);
  if (match) {
    const n = parseChineseOrdinal(match[1]);
    if (Number.isFinite(n)) return n;
  }
  if (/^(?:短篇|外传|番外)/u.test(norm)) return 900;
  return 500;
}

const schemaV2 = `
CREATE TABLE works (
  work_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  deleted INTEGER
) STRICT;

CREATE TABLE volumes (
  volume_id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(work_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 500
) STRICT;
CREATE INDEX volumes_work_order ON volumes(work_id, sort_order, title);

CREATE TABLE revisions (
  volume_id TEXT NOT NULL REFERENCES volumes(volume_id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count > 0),
  imported INTEGER NOT NULL,
  PRIMARY KEY (volume_id, revision_id)
) STRICT;

CREATE TABLE blocks (
  volume_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('text','image','note')),
  text TEXT NOT NULL,
  asset_sha256 TEXT,
  note_target TEXT,
  PRIMARY KEY (volume_id, revision_id, ordinal),
  FOREIGN KEY (volume_id, revision_id) REFERENCES revisions(volume_id, revision_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX blocks_note_target ON blocks(volume_id, revision_id, note_target) WHERE note_target IS NOT NULL;

CREATE TABLE structures (
  volume_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  structure_id TEXT NOT NULL,
  parent_id TEXT,
  type TEXT NOT NULL,
  title TEXT,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  PRIMARY KEY (volume_id, revision_id, structure_id),
  FOREIGN KEY (volume_id, revision_id) REFERENCES revisions(volume_id, revision_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX structures_range ON structures(volume_id, revision_id, start, end);

CREATE TABLE assets (
  work_id TEXT NOT NULL REFERENCES works(work_id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  media_type TEXT NOT NULL,
  body BLOB NOT NULL,
  PRIMARY KEY (work_id, hash)
) STRICT;

-- Layer 1: Character & World Rule Facet Dossiers
CREATE TABLE dossiers (
  dossier_id TEXT NOT NULL,
  work_id TEXT NOT NULL REFERENCES works(work_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('character','world_rule')),
  name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (work_id, dossier_id)
) STRICT;

CREATE TABLE dossier_facets (
  id INTEGER PRIMARY KEY,
  work_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL,
  facet_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('character','world_rule')),
  entity_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  facet_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  search_text TEXT NOT NULL,
  UNIQUE (work_id, facet_id),
  FOREIGN KEY (work_id, dossier_id) REFERENCES dossiers(work_id, dossier_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX dossier_facets_work_type ON dossier_facets(work_id, entity_type, facet_kind);
CREATE VIRTUAL TABLE facet_fts USING fts5(tokens, tokenize='unicode61 remove_diacritics 0');

-- Layer 2: Sequential Full-Book Objective Scene Ledger
CREATE TABLE scenes (
  id INTEGER PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(work_id) ON DELETE CASCADE,
  volume_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  scene_index INTEGER NOT NULL,
  chapter_title TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  setting_context TEXT NOT NULL DEFAULT '',
  characters_json TEXT NOT NULL DEFAULT '[]',
  objective_summary TEXT NOT NULL,
  interaction_dynamics TEXT NOT NULL DEFAULT '',
  narrative_highlights TEXT NOT NULL DEFAULT '',
  evidence_start INTEGER NOT NULL,
  evidence_end INTEGER NOT NULL CHECK(evidence_end >= evidence_start),
  search_text TEXT NOT NULL,
  UNIQUE (work_id, scene_id),
  FOREIGN KEY (volume_id, revision_id) REFERENCES revisions(volume_id, revision_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX scenes_work_vol ON scenes(work_id, volume_id, scene_index);
CREATE VIRTUAL TABLE scene_fts USING fts5(tokens, tokenize='unicode61 remove_diacritics 0');

-- Layer 3: Fine-Grained Raw Passage Sliding Windows
CREATE TABLE passage_chunks (
  id INTEGER PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(work_id) ON DELETE CASCADE,
  volume_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  chapter_title TEXT NOT NULL DEFAULT '',
  start_ordinal INTEGER NOT NULL,
  end_ordinal INTEGER NOT NULL CHECK(end_ordinal >= start_ordinal),
  text TEXT NOT NULL,
  search_text TEXT NOT NULL,
  UNIQUE (volume_id, revision_id, chunk_id),
  FOREIGN KEY (volume_id, revision_id) REFERENCES revisions(volume_id, revision_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX passage_chunks_vol_range ON passage_chunks(volume_id, revision_id, start_ordinal, end_ordinal);
CREATE VIRTUAL TABLE passage_fts USING fts5(tokens, tokenize='unicode61 remove_diacritics 0');

-- Unified Polymorphic Vector Store
CREATE TABLE vectors (
  unit_type TEXT NOT NULL CHECK(unit_type IN ('facet','scene','passage')),
  unit_row INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (unit_type, unit_row, model_id)
) STRICT;
`;

export class ReferenceStoreV2 {
  generation = 0;

  constructor(filename, { readOnly = false } = {}) {
    this.readOnly = readOnly;
    this.filename = filename;
    if (!readOnly && filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.open();
  }

  open() {
    this.db = new DatabaseSync(this.filename, { enableForeignKeyConstraints: true, readOnly: this.readOnly });
    try {
      this.db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;');
      const { user_version: version } = this.db.prepare('PRAGMA user_version').get();
      if (version === 0 && !this.readOnly) {
        this.transaction(() => this.db.exec(schemaV2 + `PRAGMA user_version=${databaseVersionV2};`));
      } else if (version !== databaseVersionV2) {
        fail('DATABASE_VERSION_V2', `不受支持的参考库 v2 版本: ${version}`);
      }
      if (!this.readOnly) this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close() {
    this.db?.close();
    this.db = null;
  }

  transaction(write) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = write();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Ingest standardized work/volumes/blocks/structures from an exported result.json object,
   * and optionally build deterministic Layer 3 passage sliding-window chunks for selected volumes.
   */
  ingestExportedBook(resultJson, assetReader = null, { passageVolumeIds = null, chunkTargetChars = 420, chunkMaxChars = 640, forceRebuildPassages = false } = {}) {
    const work = resultJson.work;
    const structureByVol = Map.groupBy(resultJson.structures ?? [], s => `${s.volume_id}@${s.revision_id}`);

    const stats = this.transaction(() => {
      this.db.prepare(`
        INSERT INTO works(work_id, title) VALUES(?, ?)
        ON CONFLICT(work_id) DO UPDATE SET title=excluded.title
      `).run(work.work_id, work.title);

      if (assetReader && Array.isArray(resultJson.resources)) {
        const insertAsset = this.db.prepare('INSERT OR IGNORE INTO assets(work_id, hash, media_type, body) VALUES(?,?,?,?)');
        for (const res of resultJson.resources) {
          const media = imageMedia[extname(res.path).toLowerCase()] ?? 'application/octet-stream';
          const bytes = assetReader(res.path);
          if (bytes) insertAsset.run(work.work_id, res.sha256, media, bytes);
        }
      }

      const upsertVol = this.db.prepare(`
        INSERT INTO volumes(volume_id, work_id, title, sort_order) VALUES(?,?,?,?)
        ON CONFLICT(volume_id) DO UPDATE SET title=excluded.title, sort_order=excluded.sort_order
      `);
      const insertRev = this.db.prepare('INSERT OR IGNORE INTO revisions(volume_id, revision_id, count, imported) VALUES(?,?,?,?)');
      const insertBlock = this.db.prepare('INSERT INTO blocks(volume_id, revision_id, ordinal, kind, text, asset_sha256, note_target) VALUES(?,?,?,?,?,?,?)');
      const deleteStruct = this.db.prepare('DELETE FROM structures WHERE volume_id=? AND revision_id=?');
      const insertStruct = this.db.prepare('INSERT INTO structures(volume_id, revision_id, structure_id, parent_id, type, title, start, end) VALUES(?,?,?,?,?,?,?,?)');

      let volumesAdded = 0;
      let chunksBuilt = 0;

      for (const vol of resultJson.volumes) {
        const blocks = vol.normalized_payload.blocks;
        upsertVol.run(vol.volume_id, work.work_id, vol.title, volumeOrderNumber(vol.title));
        const added = insertRev.run(vol.volume_id, vol.revision_id, blocks.length, Date.now()).changes;
        if (added) {
          volumesAdded++;
          blocks.forEach((b, idx) => {
            insertBlock.run(vol.volume_id, vol.revision_id, idx + 1, b.kind, b.text ?? '', b.asset_sha256 ?? null, b.note_target ?? null);
          });
        }
        deleteStruct.run(vol.volume_id, vol.revision_id);
        const structs = structureByVol.get(`${vol.volume_id}@${vol.revision_id}`) ?? [];
        for (const s of structs) {
          insertStruct.run(
            s.volume_id, s.revision_id, s.structure_id, s.parent_id ?? null,
            s.type, s.title ?? null, paragraphNumber(s.start), paragraphNumber(s.end)
          );
        }

        const shouldChunk = !passageVolumeIds || passageVolumeIds.has(vol.volume_id);
        if (shouldChunk) {
          const existingChunkCount = this.db.prepare('SELECT count(*) AS c FROM passage_chunks WHERE volume_id=? AND revision_id=?').get(vol.volume_id, vol.revision_id).c;
          if (existingChunkCount > 0 && !forceRebuildPassages) {
            chunksBuilt += existingChunkCount;
          } else {
            chunksBuilt += this.#rebuildVolumePassageChunks(work.work_id, vol.volume_id, vol.revision_id, blocks, structs, {
              targetChars: chunkTargetChars,
              maxChars: chunkMaxChars
            });
          }
        }
      }
      return { volumesAdded, totalVolumes: resultJson.volumes.length, chunksBuilt };
    });

    this.generation++;
    return stats;
  }

  #rebuildVolumePassageChunks(workId, volumeId, revisionId, blocks, rawStructures, { targetChars = 420, maxChars = 640 } = {}) {
    const existingIds = this.db.prepare('SELECT id FROM passage_chunks WHERE volume_id=? AND revision_id=?').all(volumeId, revisionId);
    if (existingIds.length) {
      const delFts = this.db.prepare('DELETE FROM passage_fts WHERE rowid=?');
      const delVec = this.db.prepare("DELETE FROM vectors WHERE unit_type='passage' AND unit_row=?");
      for (const { id } of existingIds) {
        delFts.run(id);
        delVec.run(id);
      }
      this.db.prepare('DELETE FROM passage_chunks WHERE volume_id=? AND revision_id=?').run(volumeId, revisionId);
    }

    const sections = rawStructures
      .map(s => ({ title: s.title || '', type: s.type, start: paragraphNumber(s.start), end: paragraphNumber(s.end) }))
      .filter(s => s.type !== 'volume' && s.type !== 'frontmatter' && s.start && s.end)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start));

    const chapterFor = ordinal => {
      const found = sections.find(s => ordinal >= s.start && ordinal <= s.end && s.title);
      return found?.title ?? '';
    };

    const insertChunk = this.db.prepare(`
      INSERT INTO passage_chunks(work_id, volume_id, revision_id, chunk_id, chapter_title, start_ordinal, end_ordinal, text, search_text)
      VALUES(?,?,?,?,?,?,?,?,?)
    `);
    const insertFts = this.db.prepare('INSERT INTO passage_fts(rowid, tokens) VALUES(?,?)');

    // Group consecutive text paragraphs within the same chapter into ~targetChars sliding windows
    let count = 0;
    let windowItems = [];
    let windowChars = 0;
    let currentChapter = null;

    const flushWindow = () => {
      if (!windowItems.length) return;
      const text = windowItems.map(item => item.text).join('\n');
      if (text.replace(/[\s\p{P}]/gu, '').length < 18) {
        windowItems = [];
        windowChars = 0;
        return;
      }
      const startOrd = windowItems[0].ordinal;
      const endOrd = windowItems.at(-1).ordinal;
      const chunkId = `chk_${startOrd}_${endOrd}`;
      const searchText = normalizeTextV2(`${currentChapter || ''} ${text}`);
      const tokens = tokenizeForIndex(searchText).join(' ');
      const rowId = insertChunk.run(
        workId, volumeId, revisionId, chunkId, currentChapter || '', startOrd, endOrd, text, searchText
      ).lastInsertRowid;
      insertFts.run(rowId, tokens);
      count++;
    };

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const ordinal = i + 1;
      if (b.kind !== 'text') continue;
      const trimmed = (b.text ?? '').trim();
      if (!trimmed) continue;

      const chap = chapterFor(ordinal);
      if (currentChapter !== null && chap !== currentChapter && windowItems.length) {
        flushWindow();
        windowItems = [];
        windowChars = 0;
      }
      currentChapter = chap;

      windowItems.push({ ordinal, text: trimmed });
      windowChars += trimmed.length;

      if (windowChars >= targetChars || windowChars >= maxChars) {
        flushWindow();
        // Keep 1 trailing paragraph overlap if reasonable length (< 140 chars) to preserve cross-window continuity
        const tail = windowItems.at(-1);
        if (tail && tail.text.length <= 140 && windowItems.length > 1) {
          windowItems = [tail];
          windowChars = tail.text.length;
        } else {
          windowItems = [];
          windowChars = 0;
        }
      }
    }
    if (windowItems.length) flushWindow();
    return count;
  }

  /**
   * Save extracted scenes for a specific volume (replacing any prior scenes for that volume).
   */
  replaceVolumeScenes(workId, volumeId, revisionId, scenes) {
    const rev = this.db.prepare('SELECT count FROM revisions WHERE volume_id=? AND revision_id=?').get(volumeId, revisionId);
    if (!rev) fail('SCENE_REVISION_MISSING', `找不到分卷版本 ${volumeId}@${revisionId}`);

    const written = this.transaction(() => {
      const oldRows = this.db.prepare('SELECT id FROM scenes WHERE work_id=? AND volume_id=?').all(workId, volumeId);
      const delFts = this.db.prepare('DELETE FROM scene_fts WHERE rowid=?');
      const delVec = this.db.prepare("DELETE FROM vectors WHERE unit_type='scene' AND unit_row=?");
      for (const { id } of oldRows) {
        delFts.run(id);
        delVec.run(id);
      }
      this.db.prepare('DELETE FROM scenes WHERE work_id=? AND volume_id=?').run(workId, volumeId);

      const insertScene = this.db.prepare(`
        INSERT INTO scenes(
          work_id, volume_id, revision_id, scene_id, scene_index, chapter_title, title,
          setting_context, characters_json, objective_summary, interaction_dynamics,
          narrative_highlights, evidence_start, evidence_end, search_text
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      const insertFts = this.db.prepare('INSERT INTO scene_fts(rowid, tokens) VALUES(?,?)');

      let idx = 0;
      for (const sc of scenes) {
        idx++;
        const start = Math.max(1, Math.min(rev.count, parseOrdinalValue(sc.evidence_start) || parseOrdinalValue(sc.start_p) || 1));
        const end = Math.max(start, Math.min(rev.count, parseOrdinalValue(sc.evidence_end) || parseOrdinalValue(sc.end_p) || start));
        const chars = Array.isArray(sc.characters) ? sc.characters.filter(Boolean) : [];
        const sceneId = sc.scene_id || `${volumeId.slice(0, 8)}_s${String(idx).padStart(3, '0')}`;
        const rawSearch = [
          sc.title, sc.chapter_title, sc.setting_context, chars.join(' '),
          sc.objective_summary, sc.interaction_dynamics, sc.narrative_highlights
        ].filter(Boolean).join(' ');
        const searchText = normalizeTextV2(rawSearch);
        const rowId = insertScene.run(
          workId, volumeId, revisionId, sceneId, idx,
          sc.chapter_title ?? '', sc.title ?? `场次 ${idx}`,
          sc.setting_context ?? '', JSON.stringify(chars),
          sc.objective_summary ?? '', sc.interaction_dynamics ?? '',
          sc.narrative_highlights ?? '', start, end, searchText
        ).lastInsertRowid;
        insertFts.run(rowId, tokenizeForIndex(searchText).join(' '));
      }
      return idx;
    });

    this.generation++;
    return written;
  }

  /**
   * Save Character & World Rule Facet Dossiers for a work (replacing prior dossiers for that work).
   */
  replaceWorkDossiers(workId, dossiers) {
    const revLookup = new Map(
      this.db.prepare(`
        SELECT v.volume_id, r.revision_id, r.count
        FROM volumes v JOIN revisions r USING(volume_id) WHERE v.work_id=?
      `).all(workId).map(r => [r.volume_id, r])
    );

    const stats = this.transaction(() => {
      const oldFacets = this.db.prepare('SELECT id FROM dossier_facets WHERE work_id=?').all(workId);
      const delFts = this.db.prepare('DELETE FROM facet_fts WHERE rowid=?');
      const delVec = this.db.prepare("DELETE FROM vectors WHERE unit_type='facet' AND unit_row=?");
      for (const { id } of oldFacets) {
        delFts.run(id);
        delVec.run(id);
      }
      this.db.prepare('DELETE FROM dossier_facets WHERE work_id=?').run(workId);
      this.db.prepare('DELETE FROM dossiers WHERE work_id=?').run(workId);

      const insertDossier = this.db.prepare(`
        INSERT INTO dossiers(dossier_id, work_id, entity_type, name, aliases_json, summary, updated_at)
        VALUES(?,?,?,?,?,?,?)
      `);
      const insertFacet = this.db.prepare(`
        INSERT INTO dossier_facets(
          work_id, dossier_id, facet_id, entity_type, entity_name, aliases_json,
          facet_kind, title, content, evidence_json, search_text
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
      `);
      const insertFts = this.db.prepare('INSERT INTO facet_fts(rowid, tokens) VALUES(?,?)');

      let dossierCount = 0;
      let facetCount = 0;

      for (const d of dossiers) {
        dossierCount++;
        const entityType = d.entity_type === 'world_rule' ? 'world_rule' : 'character';
        const dossierId = d.dossier_id || `${entityType}_${String(dossierCount).padStart(3, '0')}`;
        const aliases = Array.isArray(d.aliases) ? [...new Set(d.aliases.filter(Boolean))] : [];
        insertDossier.run(dossierId, workId, entityType, d.name, JSON.stringify(aliases), d.summary ?? '', Date.now());

        for (const f of d.facets ?? []) {
          if (!f.content?.trim()) continue;
          facetCount++;
          const facetKind = f.facet_kind || (entityType === 'character' ? 'persona_style' : 'core_mechanism');
          const facetId = f.facet_id || `${dossierId}_${facetKind}_${facetCount}`;
          const validEvidence = [];
          for (const ev of f.evidence ?? []) {
            const rev = revLookup.get(ev.volume_id);
            if (!rev) continue;
            const s = Math.max(1, Math.min(rev.count, parseOrdinalValue(ev.start) || parseOrdinalValue(ev.start_p) || 1));
            const rawEnd = Math.max(s, Math.min(rev.count, parseOrdinalValue(ev.end) || parseOrdinalValue(ev.end_p) || s));
            const e = Math.min(rawEnd, s + 40);
            validEvidence.push({ volume_id: ev.volume_id, revision_id: rev.revision_id, start: s, end: e });
          }
          const title = f.title || `${d.name} · ${facetKindLabels[facetKind] ?? facetKind}`;
          const rawSearch = [d.name, aliases.join(' '), facetKindLabels[facetKind] ?? '', title, d.summary ?? '', f.content].join(' ');
          const searchText = normalizeTextV2(rawSearch);
          const rowId = insertFacet.run(
            workId, dossierId, facetId, entityType, d.name, JSON.stringify(aliases),
            facetKind, title, f.content.trim(), JSON.stringify(validEvidence), searchText
          ).lastInsertRowid;
          insertFts.run(rowId, tokenizeForIndex(searchText).join(' '));
        }
      }
      return { dossierCount, facetCount };
    });

    this.generation++;
    return stats;
  }

  // ============================================================================
  // UI-Compatible Reference & Reader Adapter Methods
  // ============================================================================

  revision(workId, volumeId, revisionId) {
    return this.db.prepare(`
      SELECT r.count, r.imported, v.title AS volume_title, w.title AS work_title
      FROM revisions r JOIN volumes v USING(volume_id) JOIN works w USING(work_id)
      WHERE w.work_id=? AND r.volume_id=? AND r.revision_id=?
    `).get(workId, volumeId, revisionId);
  }

  list() {
    const works = this.db.prepare('SELECT * FROM works ORDER BY deleted IS NOT NULL, title, work_id').all();
    const volumes = this.db.prepare('SELECT * FROM volumes ORDER BY sort_order, title, volume_id').all();
    const revisions = this.db.prepare('SELECT * FROM revisions ORDER BY imported DESC, revision_id').all();
    const byVolume = Map.groupBy(revisions, r => r.volume_id);
    const byWork = Map.groupBy(volumes, v => v.work_id);
    return {
      works: works.map(work => ({
        ...work,
        cover: null,
        volumes: (byWork.get(work.work_id) ?? []).map(vol => ({
          ...vol,
          revisions: byVolume.get(vol.volume_id) ?? []
        }))
      }))
    };
  }

  setHidden({ workId, hidden }) {
    if (!this.db.prepare('UPDATE works SET deleted=? WHERE work_id=?').run(hidden ? Date.now() : null, workId).changes) {
      fail('REFERENCE_NOT_FOUND', '找不到该参考作品');
    }
    this.generation++;
    return true;
  }

  editCard() {
    fail('KB_V2_READONLY', 'KB v2 原型条目由结构化流水线维护，暂不支持手动改写单卡');
  }

  read({ workId, volumeId, revisionId, start = 'p000001', end = start, at }) {
    const revision = this.revision(workId, volumeId, revisionId);
    if (!revision) fail('READER_REVISION', '找不到证据引用的正文版本');
    const first = typeof start === 'number' ? start : paragraphNumber(start);
    const last = typeof end === 'number' ? end : paragraphNumber(end);
    if (!first || !last || first > last || last > revision.count) fail('READER_RANGE', '证据段落超出该版本范围');
    if (at != null && (!Number.isSafeInteger(at) || at < 1 || at > revision.count)) fail('READER_PAGE', '阅读页码无效');
    const pageStart = at ?? Math.max(1, first - 8);
    const pageEnd = Math.min(pageStart + 119, revision.count);
    const blocks = this.db.prepare(`
      SELECT b.ordinal, b.kind, b.text, b.asset_sha256, b.note_target,
        (SELECT group_concat(n.ordinal, ',') FROM blocks n WHERE n.volume_id=b.volume_id
         AND n.revision_id=b.revision_id AND n.note_target=printf('p%06d',b.ordinal)) AS note_ordinals
      FROM blocks b WHERE b.volume_id=? AND b.revision_id=? AND b.ordinal BETWEEN ? AND ? ORDER BY b.ordinal
    `).all(volumeId, revisionId, pageStart, pageEnd).map(({ note_ordinals, ...block }) => ({
      ...block,
      paragraph_id: paragraphId(block.ordinal),
      notes: note_ordinals ? note_ordinals.split(',').map(v => paragraphId(Number(v))) : [],
      highlighted: block.ordinal >= first && block.ordinal <= last
    }));
    const structures = this.db.prepare(`
      SELECT structure_id, parent_id, type, title, start, end FROM structures
      WHERE volume_id=? AND revision_id=? ORDER BY start, end DESC, structure_id
    `).all(volumeId, revisionId).map(node => ({ ...node, start: paragraphId(node.start), end: paragraphId(node.end) }));
    return {
      ...revision, blocks, structures, first, last, pageStart, pageEnd,
      previous: pageStart > 1 ? Math.max(1, pageStart - 120) : null,
      next: pageEnd < revision.count ? pageEnd + 1 : null
    };
  }

  asset({ workId, hash }) {
    const row = this.db.prepare('SELECT media_type, body FROM assets WHERE work_id=? AND hash=?').get(workId, hash);
    if (!row?.media_type.startsWith('image/')) fail('READER_IMAGE', '找不到该插图');
    return `data:${row.media_type};base64,${Buffer.from(row.body).toString('base64')}`;
  }

  #resolveEvidenceRange(volumeId, revisionId, startOrd, endOrd) {
    const meta = this.db.prepare(`
      SELECT v.title AS volume_title,
        (SELECT s.title FROM structures s WHERE s.volume_id=? AND s.revision_id=?
         AND s.start<=? AND s.end>=? AND s.type NOT IN ('volume','scene') ORDER BY s.end-s.start LIMIT 1) AS section
      FROM volumes v WHERE v.volume_id=?
    `).get(volumeId, revisionId, startOrd, startOrd, volumeId);
    return {
      volume_id: volumeId,
      revision_id: revisionId,
      start: paragraphId(startOrd),
      end: paragraphId(endOrd),
      volume_title: meta?.volume_title ?? '',
      section: meta?.section ?? ''
    };
  }

  /**
   * Materialize a v2 unit ('facet' | 'scene' | 'passage') as a rich UI-compatible item.
   */
  materializeReadRange({volumeId,revisionId,start,end},extra={}) {
    const row=this.db.prepare(`SELECT v.work_id,w.title AS work_title,v.title AS volume_title,r.count
      FROM revisions r JOIN volumes v USING(volume_id) JOIN works w USING(work_id)
      WHERE r.volume_id=? AND r.revision_id=? AND w.deleted IS NULL`).get(volumeId,revisionId);
    if(!row||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start||end>row.count||end-start>44)return null;
    const blocks=this.db.prepare("SELECT text FROM blocks WHERE volume_id=? AND revision_id=? AND ordinal BETWEEN ? AND ? AND kind='text' ORDER BY ordinal").all(volumeId,revisionId,start,end);
    const identity=Buffer.from(JSON.stringify({volumeId,revisionId,start,end})).toString('base64url');
    return {unit_key:'original:'+identity,card_id:'original:'+identity,v2_layer:'passage',v2_badge:'已核读原文',work_id:row.work_id,work_title:row.work_title,title:`${row.volume_title} · 原文段 ${start}–${end}`,category:'technique',claim_type:'fact',revision:1,creative_takeaway:extra.creative_takeaway??'',content:blocks.map(b=>b.text).join('\n\n'),evidence:[this.#resolveEvidenceRange(volumeId,revisionId,start,end)],aliases:[],related_card_ids:[]};
  }

  materializeUnit(unitType, unitRow, extra = {}) {
    if(unitType==='original')return this.materializeReadRange(unitRow,extra);
    if (unitType === 'scene') {
      const row = this.db.prepare(`
        SELECT s.*, w.title AS work_title, v.title AS volume_title
        FROM scenes s JOIN works w USING(work_id) JOIN volumes v USING(volume_id)
        WHERE s.id=?
      `).get(unitRow);
      if (!row) return null;
      const chars = JSON.parse(row.characters_json);
      const ev = this.#resolveEvidenceRange(row.volume_id, row.revision_id, row.evidence_start, row.evidence_end);
      const lines = [];
      if (extra.creative_takeaway) lines.push(`> **参考看点**：${extra.creative_takeaway}\n`);
      lines.push(`${row.objective_summary} [1]`);
      if (row.setting_context || chars.length) {
        lines.push(`\n### 场景与人物`);
        if (row.setting_context) lines.push(`- **情境**：${row.setting_context}`);
        if (chars.length) lines.push(`- **在场角色**：${chars.join('、')}`);
      }
      if (row.interaction_dynamics) {
        lines.push(`\n### 互动与张力\n${row.interaction_dynamics}`);
      }
      if (row.narrative_highlights) {
        lines.push(`\n### 叙事设计亮点\n${row.narrative_highlights}`);
      }
      return {
        unit_key: `scene:${row.id}`,
        v2_layer: 'scene',
        v2_badge: `剧情场次 · ${row.volume_title}`,
        creative_takeaway: extra.creative_takeaway ?? '',
        work_id: row.work_id,
        work_title: row.work_title,
        card_id: `scene:${row.scene_id}`,
        category: 'event',
        title: row.title,
        content: lines.join('\n'),
        claim_type: 'fact',
        revision: 1,
        evidence: [ev],
        aliases: chars,
        related_card_ids: []
      };
    }

    if (unitType === 'facet') {
      const row = this.db.prepare(`
        SELECT f.*, w.title AS work_title, d.summary AS dossier_summary
        FROM dossier_facets f
        JOIN works w USING(work_id)
        JOIN dossiers d ON d.work_id=f.work_id AND d.dossier_id=f.dossier_id
        WHERE f.id=?
      `).get(unitRow);
      if (!row) return null;
      const rawEv = JSON.parse(row.evidence_json);
      const evidence = rawEv.map(e => this.#resolveEvidenceRange(e.volume_id, e.revision_id, e.start, e.end));
      const aliases = JSON.parse(row.aliases_json);
      const lines = [];
      if (extra.creative_takeaway) lines.push(`> **参考看点**：${extra.creative_takeaway}\n`);
      if (row.dossier_summary) lines.push(`**对象定位**：${row.dossier_summary}\n`);
      const evRefs = evidence.length ? ' ' + evidence.slice(0, 3).map((_, i) => `[${i + 1}]`).join('') : '';
      lines.push(`${row.content}${evRefs}`);
      const isChar = row.entity_type === 'character';
      return {
        unit_key: `facet:${row.id}`,
        v2_layer: isChar ? 'character_facet' : 'world_facet',
        v2_badge: `${isChar ? '人物档案' : '世界设定'} · ${facetKindLabels[row.facet_kind] ?? row.facet_kind}`,
        creative_takeaway: extra.creative_takeaway ?? '',
        work_id: row.work_id,
        work_title: row.work_title,
        card_id: `facet:${row.facet_id}`,
        category: isChar ? 'character' : 'setting',
        title: row.title,
        content: lines.join('\n'),
        claim_type: 'fact',
        revision: 1,
        evidence,
        aliases,
        related_card_ids: []
      };
    }

    if (unitType === 'passage') {
      const row = this.db.prepare(`
        SELECT p.*, w.title AS work_title, v.title AS volume_title
        FROM passage_chunks p JOIN works w USING(work_id) JOIN volumes v USING(volume_id)
        WHERE p.id=?
      `).get(unitRow);
      if (!row) return null;
      const ev = this.#resolveEvidenceRange(row.volume_id, row.revision_id, row.start_ordinal, row.end_ordinal);
      const lines = [];
      if (extra.creative_takeaway) lines.push(`> **参考看点**：${extra.creative_takeaway}\n`);
      lines.push(row.text.split('\n').map(p => `> ${p}`).join('\n>\n') + ' [1]');
      return {
        unit_key: `passage:${row.id}`,
        v2_layer: 'passage',
        v2_badge: `原文描写 · ${row.volume_title}`,
        creative_takeaway: extra.creative_takeaway ?? '',
        work_id: row.work_id,
        work_title: row.work_title,
        card_id: `passage:${row.id}`,
        category: 'technique',
        title: `${row.volume_title}${row.chapter_title ? ' · ' + row.chapter_title : ''}（段 ${row.start_ordinal}–${row.end_ordinal}）`,
        content: lines.join('\n'),
        claim_type: 'fact',
        revision: 1,
        evidence: [ev],
        aliases: [],
        related_card_ids: []
      };
    }

    return null;
  }

  getCard({ workId, cardId }) {
    if (typeof cardId === 'string') {
      if(cardId.startsWith('original:')){
        let range;try{if(cardId.length>2000)throw new Error();range=JSON.parse(Buffer.from(cardId.slice(9),'base64url').toString('utf8'));}catch{fail('CARD_NOT_FOUND','原文范围标识无效');}
        const card=this.materializeReadRange(range);if(card?.work_id===workId)return card;
      }else if (cardId.startsWith('scene:')) {
        const sc = this.db.prepare('SELECT id FROM scenes WHERE work_id=? AND scene_id=?').get(workId, cardId.slice(6));
        if (sc) return this.materializeUnit('scene', sc.id);
      } else if (cardId.startsWith('facet:')) {
        const fc = this.db.prepare('SELECT id FROM dossier_facets WHERE work_id=? AND facet_id=?').get(workId, cardId.slice(6));
        if (fc) return this.materializeUnit('facet', fc.id);
      } else if (cardId.startsWith('passage:')) {
        const id = Number(cardId.slice(8));
        if (Number.isInteger(id)) return this.materializeUnit('passage', id);
      }
    }
    fail('CARD_NOT_FOUND', '找不到该知识条目');
  }

  listCards({ workId, offset = 0 }) {
    if (!Number.isSafeInteger(offset) || offset < 0) fail('CARD_PAGE', '页码无效');
    // Show facets first, then sequential scenes on the bookshelf
    const facetCount = this.db.prepare('SELECT count(*) AS c FROM dossier_facets WHERE work_id=?').get(workId).c;
    const items = [];
    if (offset < facetCount) {
      const facetRows = this.db.prepare('SELECT id FROM dossier_facets WHERE work_id=? ORDER BY id LIMIT 21 OFFSET ?').all(workId, offset);
      for (const r of facetRows) items.push(this.materializeUnit('facet', r.id));
    }
    if (items.length < 21) {
      const sceneOffset = Math.max(0, offset - facetCount);
      const needed = 21 - items.length;
      const sceneRows = this.db.prepare(`
        SELECT s.id FROM scenes s JOIN volumes v USING(volume_id)
        WHERE s.work_id=? ORDER BY v.sort_order, s.scene_index LIMIT ? OFFSET ?
      `).all(workId, needed, sceneOffset);
      for (const r of sceneRows) items.push(this.materializeUnit('scene', r.id));
    }
    return {
      cards: items.slice(0, 20).filter(Boolean),
      next: items.length > 20 ? offset + 20 : null
    };
  }

  stats() {
    return {
      works: this.db.prepare('SELECT count(*) AS c FROM works WHERE deleted IS NULL').get().c,
      volumes: this.db.prepare('SELECT count(*) AS c FROM volumes').get().c,
      blocks: this.db.prepare('SELECT count(*) AS c FROM blocks').get().c,
      dossiers: this.db.prepare('SELECT count(*) AS c FROM dossiers').get().c,
      facets: this.db.prepare('SELECT count(*) AS c FROM dossier_facets').get().c,
      scenes: this.db.prepare('SELECT count(*) AS c FROM scenes').get().c,
      passages: this.db.prepare('SELECT count(*) AS c FROM passage_chunks').get().c,
      vectors: this.db.prepare('SELECT unit_type, count(*) AS c FROM vectors GROUP BY unit_type').all()
    };
  }
}
