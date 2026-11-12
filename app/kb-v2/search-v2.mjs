import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fail } from '../main/store.mjs';
import { facetKindLabels } from './store-v2.mjs';
import { buildFtsMatchExpression, extractSearchTermsV2, normalizeTextV2 } from './text-index.mjs';

const rrfK = 50;
const semanticFloor = 0.34;

function normalizeVector(raw) {
  const arr = Float32Array.from(raw ?? []);
  if (arr.length < 2 || arr.length > 4096 || arr.some(v => !Number.isFinite(v))) {
    fail('EMBED_VECTOR', '语义模型返回无效向量');
  }
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
  const norm = Math.sqrt(sum);
  if (!norm) fail('EMBED_VECTOR', '语义模型返回零向量');
  for (let i = 0; i < arr.length; i++) arr[i] /= norm;
  return arr;
}

export class SearchEngineV2 {
  embeddingLane = Promise.resolve();
  cursors = new Map();
  pendingIndex = null;

  constructor(storeV2, embedding) {
    this.reference = storeV2;
    this.embedding = embedding;
  }

  get db() {
    return this.reference.db;
  }

  async encode(texts, signal, query = false) {
    signal?.throwIfAborted();
    if (!this.embedding || ('modelPath' in this.embedding && !this.embedding.modelPath)) {
      fail('EMBED_MODEL_NOT_CONFIGURED', '未配置本地语义模型');
    }
    const job = this.embeddingLane.catch(() => {}).then(() => {
      signal?.throwIfAborted();
      return this.embedding.embed(texts, { signal, query });
    });
    this.embeddingLane = job;
    const raw = await job;
    return raw.map(normalizeVector);
  }

  #facetEmbedText(row) {
    const aliases = JSON.parse(row.aliases_json);
    const kind = facetKindLabels[row.facet_kind] ?? row.facet_kind;
    return [
      `作品：${row.work_title}`,
      `对象：${row.entity_name}${aliases.length ? `（${aliases.join('、')}）` : ''}`,
      `类型：${row.entity_type === 'character' ? '人物档案' : '世界设定'} · ${kind}`,
      `标题：${row.title}`,
      row.dossier_summary ? `定位：${row.dossier_summary}` : '',
      `内容：${row.content}`
    ].filter(Boolean).join('\n').slice(0, 3200);
  }

  #sceneEmbedText(row) {
    const chars = JSON.parse(row.characters_json);
    return [
      `作品：${row.work_title} · ${row.volume_title}${row.chapter_title ? ' · ' + row.chapter_title : ''}`,
      `场次：${row.title}`,
      row.setting_context ? `情境：${row.setting_context}` : '',
      chars.length ? `人物：${chars.join('、')}` : '',
      `经过：${row.objective_summary}`,
      row.interaction_dynamics ? `互动：${row.interaction_dynamics}` : '',
      row.narrative_highlights ? `看点：${row.narrative_highlights}` : ''
    ].filter(Boolean).join('\n').slice(0, 2400);
  }

  #passageEmbedText(row) {
    return [
      `作品：${row.work_title} · ${row.volume_title}${row.chapter_title ? ' · ' + row.chapter_title : ''}`,
      `正文片段：${row.text}`
    ].join('\n').slice(0, 1800);
  }

  async prepare({ includePassages = true, batchSize = 24 } = {}, { signal } = {}) {
    if (this.pendingIndex) fail('SEARCH_INDEXING', '语义索引正在构建中');
    const modelId = this.embedding?.id ?? '';
    if (!modelId || !this.embedding?.modelPath) fail('EMBED_MODEL_NOT_CONFIGURED', '未配置本地模型');

    const run = async () => {
      let totalIndexed = 0;
      const specs = [
        {
          unitType: 'facet',
          sql: `
            SELECT f.*, w.title AS work_title, d.summary AS dossier_summary
            FROM dossier_facets f
            JOIN works w USING(work_id)
            JOIN dossiers d ON d.work_id=f.work_id AND d.dossier_id=f.dossier_id
            LEFT JOIN vectors v ON v.unit_type='facet' AND v.unit_row=f.id AND v.model_id=?
            WHERE v.unit_row IS NULL ORDER BY f.id LIMIT ?
          `,
          format: r => this.#facetEmbedText(r)
        },
        {
          unitType: 'scene',
          sql: `
            SELECT s.*, w.title AS work_title, vol.title AS volume_title
            FROM scenes s
            JOIN works w USING(work_id)
            JOIN volumes vol USING(volume_id)
            LEFT JOIN vectors v ON v.unit_type='scene' AND v.unit_row=s.id AND v.model_id=?
            WHERE v.unit_row IS NULL ORDER BY s.id LIMIT ?
          `,
          format: r => this.#sceneEmbedText(r)
        }
      ];
      if (includePassages) {
        specs.push({
          unitType: 'passage',
          sql: `
            SELECT p.*, w.title AS work_title, vol.title AS volume_title
            FROM passage_chunks p
            JOIN works w USING(work_id)
            JOIN volumes vol USING(volume_id)
            LEFT JOIN vectors v ON v.unit_type='passage' AND v.unit_row=p.id AND v.model_id=?
            WHERE v.unit_row IS NULL ORDER BY p.id LIMIT ?
          `,
          format: r => this.#passageEmbedText(r)
        });
      }

      const writeStmt = this.db.prepare(`
        INSERT INTO vectors(unit_type, unit_row, model_id, dimension, data)
        VALUES(?,?,?,?,?)
        ON CONFLICT(unit_type, unit_row, model_id) DO UPDATE SET dimension=excluded.dimension, data=excluded.data
      `);

      for (const spec of specs) {
        while (true) {
          signal?.throwIfAborted();
          const pending = this.db.prepare(spec.sql).all(modelId, batchSize);
          if (!pending.length) break;
          const vecs = await this.encode(pending.map(spec.format), signal, false);
          this.reference.transaction(() => {
            pending.forEach((row, i) => {
              const vec = vecs[i];
              writeStmt.run(
                spec.unitType, row.id, modelId, vec.length,
                Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength)
              );
            });
          });
          totalIndexed += pending.length;
        }
      }
      return { indexed: totalIndexed, model: modelId };
    };

    this.pendingIndex = run();
    try {
      return await this.pendingIndex;
    } finally {
      this.pendingIndex = null;
    }
  }

  #workFilterClause(workIds, alias = 't') {
    const clean = Array.isArray(workIds) ? [...new Set(workIds.filter(id => typeof id === 'string' && id))] : [];
    const json = JSON.stringify(clean);
    return {
      sql: `w.deleted IS NULL AND (json_array_length(?)=0 OR ${alias}.work_id IN (SELECT value FROM json_each(?)))`,
      args: [json, json]
    };
  }

  lexicalSearchLayer(unitType, terms, { workIds = [], entityType = null, facetKind = null, limit = 50 } = {}) {
    const expr = buildFtsMatchExpression(terms);
    if (!expr) return [];
    const wf = this.#workFilterClause(workIds, 't');

    let sql;
    const extraArgs = [];
    if (unitType === 'facet') {
      const filters = [wf.sql];
      if (entityType) { filters.push('t.entity_type=?'); extraArgs.push(entityType); }
      if (facetKind) { filters.push('t.facet_kind=?'); extraArgs.push(facetKind); }
      sql = `
        SELECT t.id, t.search_text, bm25(facet_fts) AS rank
        FROM facet_fts
        JOIN dossier_facets t ON t.id=facet_fts.rowid
        JOIN works w ON w.work_id=t.work_id
        WHERE facet_fts MATCH ? AND ${filters.join(' AND ')}
        ORDER BY rank, t.id LIMIT 180
      `;
    } else if (unitType === 'scene') {
      sql = `
        SELECT t.id, t.search_text, bm25(scene_fts) AS rank
        FROM scene_fts
        JOIN scenes t ON t.id=scene_fts.rowid
        JOIN works w ON w.work_id=t.work_id
        WHERE scene_fts MATCH ? AND ${wf.sql}
        ORDER BY rank, t.id LIMIT 180
      `;
    } else {
      sql = `
        SELECT t.id, t.search_text, bm25(passage_fts) AS rank
        FROM passage_fts
        JOIN passage_chunks t ON t.id=passage_fts.rowid
        JOIN works w ON w.work_id=t.work_id
        WHERE passage_fts MATCH ? AND ${wf.sql}
        ORDER BY rank, t.id LIMIT 180
      `;
    }

    const rows = this.db.prepare(sql).all(expr, ...wf.args, ...extraArgs);
    const scored = rows.map(row => {
      let matchedCount = 0;
      for (const term of terms) {
        if (row.search_text.includes(term)) matchedCount++;
      }
      // bm25 in SQLite FTS5 is negative (more negative = better match)
      const lexicalScore = matchedCount * 2.0 + Math.min(12, -row.rank);
      return { id: row.id, lexicalScore, matchedCount };
    });
    scored.sort((a, b) => b.lexicalScore - a.lexicalScore || a.id - b.id);
    return scored.slice(0, limit);
  }

  semanticSearchLayer(unitType, queryVectors, { workIds = [], entityType = null, facetKind = null, limit = 50, floor = semanticFloor } = {}) {
    if (!queryVectors?.length || !this.embedding?.id) return [];
    const wf = this.#workFilterClause(workIds, 't');
    const extraArgs = [];
    let tableJoin;
    if (unitType === 'facet') {
      const conds = [wf.sql];
      if (entityType) { conds.push('t.entity_type=?'); extraArgs.push(entityType); }
      if (facetKind) { conds.push('t.facet_kind=?'); extraArgs.push(facetKind); }
      tableJoin = `JOIN dossier_facets t ON t.id=v.unit_row JOIN works w ON w.work_id=t.work_id WHERE v.unit_type='facet' AND v.model_id=? AND ${conds.join(' AND ')}`;
    } else if (unitType === 'scene') {
      tableJoin = `JOIN scenes t ON t.id=v.unit_row JOIN works w ON w.work_id=t.work_id WHERE v.unit_type='scene' AND v.model_id=? AND ${wf.sql}`;
    } else {
      tableJoin = `JOIN passage_chunks t ON t.id=v.unit_row JOIN works w ON w.work_id=t.work_id WHERE v.unit_type='passage' AND v.model_id=? AND ${wf.sql}`;
    }

    const rows = this.db.prepare(`SELECT v.unit_row AS id, v.dimension, v.data FROM vectors v ${tableJoin}`).all(
      this.embedding.id, ...wf.args, ...extraArgs
    );

    const results = [];
    for (const { id, dimension, data } of rows) {
      if (dimension !== queryVectors[0].length || data.byteLength !== dimension * 4) continue;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let bestCosine = -1;
      for (const qVec of queryVectors) {
        let dot = 0;
        for (let i = 0; i < dimension; i++) dot += qVec[i] * view.getFloat32(i * 4, true);
        if (dot > bestCosine) bestCosine = dot;
      }
      if (bestCosine >= floor) {
        results.push({ id, cosine: bestCosine });
      }
    }
    results.sort((a, b) => b.cosine - a.cosine || a.id - b.id);
    return results.slice(0, limit);
  }

  /**
   * Multi-layer hybrid search combining FTS5 (word+bigram) + Qwen3 semantic vectors via RRF.
   */
  async multiLayerSearch({
    queries = [],
    lexicalKeywords = [],
    workIds = [],
    layerWeights = { scene: 1.0, facet: 1.0, passage: 0.72 },
    entityType = null,
    facetKind = null,
    perLayerLimit = 35,
    totalLimit = 60,
    signal
  } = {}) {
    const cleanQueries = [...new Set(queries.map(q => q?.trim()).filter(Boolean))];
    const terms = extractSearchTermsV2(cleanQueries[0] ?? '', [...cleanQueries.slice(1), ...lexicalKeywords]);

    let queryVectors = [];
    let degraded = false;
    let reason = null;
    if (cleanQueries.length) {
      try {
        queryVectors = await this.encode(cleanQueries.slice(0, 5), signal, true);
      } catch (err) {
        signal?.throwIfAborted();
        degraded = true;
        reason = err.code === 'EMBED_MODEL_NOT_CONFIGURED'
          ? '本地向量未启用，已使用混合分词与双字检索。'
          : '语义模型暂不可用，已回退关键词检索。';
      }
    }

    const fused = new Map();
    const channelStats = { lexical: 0, semantic: 0 };

    for (const [unitType, weight] of Object.entries(layerWeights)) {
      if (!weight || weight <= 0) continue;
      const opts = { workIds, entityType: unitType === 'facet' ? entityType : null, facetKind: unitType === 'facet' ? facetKind : null, limit: perLayerLimit };

      const lexHits = this.lexicalSearchLayer(unitType, terms, opts);
      channelStats.lexical += lexHits.length;
      lexHits.forEach((hit, rank) => {
        const key = `${unitType}:${hit.id}`;
        const prev = fused.get(key) ?? { unitType, unitRow: hit.id, score: 0, cosine: null, lexicalScore: 0 };
        prev.score += weight * (1.0 / (rrfK + rank + 1));
        prev.lexicalScore = Math.max(prev.lexicalScore, hit.lexicalScore);
        fused.set(key, prev);
      });

      const semHits = this.semanticSearchLayer(unitType, queryVectors, opts);
      channelStats.semantic += semHits.length;
      semHits.forEach((hit, rank) => {
        const key = `${unitType}:${hit.id}`;
        const prev = fused.get(key) ?? { unitType, unitRow: hit.id, score: 0, cosine: null, lexicalScore: 0 };
        prev.score += weight * (1.15 / (rrfK + rank + 1)) + Math.max(0, hit.cosine - 0.35) * 0.015 * weight;
        prev.cosine = prev.cosine === null ? hit.cosine : Math.max(prev.cosine, hit.cosine);
        fused.set(key, prev);
      });
    }

    const sorted = [...fused.values()].sort((a, b) => b.score - a.score);
    return { candidates: sorted.slice(0, totalLimit), degraded, reason, channels: channelStats };
  }

  /**
   * Standard UI-compatible query entry for Local Hybrid mode (and pagination).
   */
  async query({ query, workIds = [], categories = [], limit = 12, cursor }, { signal } = {}) {
    const start = performance.now();
    signal?.throwIfAborted();
    const normalized = normalizeTextV2(query);
    if (!normalized) fail('SEARCH_QUERY', '请输入检索问题');

    const key = JSON.stringify([normalized, workIds, categories]);
    if (cursor) {
      const session = this.cursors.get(cursor);
      if (!session || session.key !== key || session.generation !== this.reference.generation) {
        fail('SEARCH_STALE', '分页已过期，请重新搜索');
      }
      return this.#buildPage(session, session.offset, limit, start);
    }

    // Map legacy UI category filter gracefully if user picked one
    const layerWeights = this.weightsFromLegacyCategories(categories);
    const { candidates, degraded, reason, channels } = await this.multiLayerSearch({
      queries: [query],
      workIds,
      layerWeights,
      totalLimit: 60,
      signal
    });

    const items = candidates.map(c => ({ unitType: c.unitType, unitRow: c.unitRow }));
    const session = {
      items,
      key,
      generation: this.reference.generation,
      degraded,
      reason: reason ?? '本地三层混合检索（档案切面 + 全书场次 + 原文描写）',
      channels,
      synthesis: null
    };
    return this.#buildPage(session, 0, limit, start);
  }

  weightsFromLegacyCategories(categories = []) {
    if (!categories?.length) return { scene: 1.05, facet: 1.05, passage: 0.78 };
    const set = new Set(categories);
    if (set.has('character')) return { facet: 1.3, scene: 0.75, passage: 0.5 };
    if (set.has('event') || set.has('storyline')) return { scene: 1.35, facet: 0.6, passage: 0.65 };
    if (set.has('technique')) return { passage: 1.3, scene: 1.0, facet: 0.5 };
    return { facet: 1.25, scene: 0.85, passage: 0.65 };
  }

  rankedPage({ query, workIds = [], categories = [], limit = 15 }, annotatedItems, metadata = {}) {
    const start = performance.now();
    const key = JSON.stringify([normalizeTextV2(query), workIds, categories, metadata.mode || 'ai']);
    const session = {
      items: annotatedItems,
      key,
      generation: this.reference.generation,
      degraded: Boolean(metadata.degraded),
      reason: metadata.reason ?? null,
      channels: metadata.channels ?? { lexical: 0, semantic: 0 },
      synthesis: metadata.synthesis ?? null
    };
    return this.#buildPage(session, 0, limit, start);
  }

  #buildPage(session, offset, limit, start) {
    const slice = session.items.slice(offset, offset + limit);
    const hits = slice
      .map(entry => this.reference.materializeUnit(entry.unitType, entry.unitRow, { creative_takeaway: entry.creative_takeaway }))
      .filter(Boolean);
    let nextCursor = null;
    if (offset + limit < session.items.length) {
      nextCursor = randomUUID();
      this.cursors.set(nextCursor, { ...session, offset: offset + limit });
      if (this.cursors.size > 24) this.cursors.delete(this.cursors.keys().next().value);
    }
    return {
      hits,
      cursor: nextCursor,
      degraded: session.degraded,
      reason: session.reason,
      synthesis: offset === 0 ? session.synthesis : null,
      channels: session.channels,
      elapsed: Math.round(performance.now() - start)
    };
  }

  // ============================================================================
  // Read-Only Local Tools for Agentic Deep Retrieval
  // ============================================================================

  resolveToolWorkIds(agentWorkId = null, scopedWorkIds = []) {
    const allowed = Array.isArray(scopedWorkIds) ? scopedWorkIds.filter(Boolean) : [];
    if (!agentWorkId || typeof agentWorkId !== 'string') return allowed;
    const raw = agentWorkId.trim();
    if (!raw) return allowed;
    const allWorks = this.db.prepare('SELECT work_id, title FROM works WHERE deleted IS NULL').all();
    const normRaw = normalizeTextV2(raw);
    const matched = allWorks
      .filter(w => w.work_id === raw || normalizeTextV2(w.title).includes(normRaw))
      .map(w => w.work_id);
    if (!matched.length) return allowed;
    return allowed.length ? matched.filter(id => allowed.includes(id)) : matched;
  }

  async toolSearchScenes({ query, keywords = [], workId = null, scopedWorkIds = [], limit = 15 }, signal) {
    const workIds = this.resolveToolWorkIds(workId, scopedWorkIds);
    if (scopedWorkIds?.length && !workIds.length) return [];
    const { candidates } = await this.multiLayerSearch({
      queries: query ? [query] : [],
      lexicalKeywords: keywords,
      workIds,
      layerWeights: { scene: 1.0, facet: 0, passage: 0 },
      perLayerLimit: Math.min(30, Math.max(5, limit)),
      totalLimit: Math.min(30, Math.max(5, limit)),
      signal
    });
    return candidates.map(c => {
      const row = this.db.prepare(`
        SELECT s.*, w.title AS work_title, v.title AS volume_title
        FROM scenes s JOIN works w USING(work_id) JOIN volumes v USING(volume_id) WHERE s.id=?
      `).get(c.unitRow);
      if (!row) return null;
      return {
        ref: `scene:${row.id}`,
        work: row.work_title,
        volume: row.volume_title,
        volume_id: row.volume_id,
        chapter: row.chapter_title,
        title: row.title,
        setting: row.setting_context,
        characters: JSON.parse(row.characters_json),
        summary: row.objective_summary,
        dynamics: row.interaction_dynamics,
        highlights: row.narrative_highlights,
        range: [row.evidence_start, row.evidence_end]
      };
    }).filter(Boolean);
  }

  async toolSearchDossiers({ query, keywords = [], entityType = null, facetKind = null, workId = null, scopedWorkIds = [], limit = 12 }, signal) {
    const workIds = this.resolveToolWorkIds(workId, scopedWorkIds);
    if (scopedWorkIds?.length && !workIds.length) return [];
    const { candidates } = await this.multiLayerSearch({
      queries: query ? [query] : [],
      lexicalKeywords: keywords,
      workIds,
      layerWeights: { facet: 1.0, scene: 0, passage: 0 },
      entityType,
      facetKind,
      perLayerLimit: Math.min(25, Math.max(5, limit)),
      totalLimit: Math.min(25, Math.max(5, limit)),
      signal
    });
    return candidates.map(c => {
      const row = this.db.prepare(`
        SELECT f.*, w.title AS work_title, d.summary AS dossier_summary
        FROM dossier_facets f
        JOIN works w USING(work_id)
        JOIN dossiers d ON d.work_id=f.work_id AND d.dossier_id=f.dossier_id
        WHERE f.id=?
      `).get(c.unitRow);
      if (!row) return null;
      return {
        ref: `facet:${row.id}`,
        work: row.work_title,
        entity: row.entity_name,
        entity_type: row.entity_type,
        facet_kind: row.facet_kind,
        title: row.title,
        summary: row.dossier_summary,
        content: row.content.slice(0, 900),
        evidence: JSON.parse(row.evidence_json)
      };
    }).filter(Boolean);
  }

  async toolSearchPassages({ query, keywords = [], workId = null, scopedWorkIds = [], limit = 12 }, signal) {
    const workIds = this.resolveToolWorkIds(workId, scopedWorkIds);
    if (scopedWorkIds?.length && !workIds.length) return [];
    const { candidates } = await this.multiLayerSearch({
      queries: query ? [query] : [],
      lexicalKeywords: keywords,
      workIds,
      layerWeights: { passage: 1.0, scene: 0, facet: 0 },
      perLayerLimit: Math.min(25, Math.max(5, limit)),
      totalLimit: Math.min(25, Math.max(5, limit)),
      signal
    });
    return candidates.map(c => {
      const row = this.db.prepare(`
        SELECT p.*, w.title AS work_title, v.title AS volume_title
        FROM passage_chunks p JOIN works w USING(work_id) JOIN volumes v USING(volume_id) WHERE p.id=?
      `).get(c.unitRow);
      if (!row) return null;
      return {
        ref: `passage:${row.id}`,
        work: row.work_title,
        volume: row.volume_title,
        volume_id: row.volume_id,
        chapter: row.chapter_title,
        range: [row.start_ordinal, row.end_ordinal],
        text: row.text.slice(0, 650)
      };
    }).filter(Boolean);
  }

  toolReadOriginalRange({ volumeId, startOrdinal, endOrdinal, scopedWorkIds = [] }) {
    const rev = this.db.prepare(`
      SELECT r.revision_id, r.count, v.work_id, v.title AS volume_title, w.title AS work_title
      FROM revisions r JOIN volumes v USING(volume_id) JOIN works w USING(work_id)
      WHERE r.volume_id=? AND w.deleted IS NULL ORDER BY r.imported DESC LIMIT 1
    `).get(volumeId);
    if (!rev) return { error: '找不到指定分卷' };
    if (scopedWorkIds?.length && !scopedWorkIds.includes(rev.work_id)) {
      return { error: '该分卷不在当前限定的检索书目范围内' };
    }
    const s = Math.max(1, Math.min(rev.count, Number(startOrdinal) || 1));
    const e = Math.max(s, Math.min(rev.count, Math.min(s + 44, Number(endOrdinal) || s + 20)));
    const blocks = this.db.prepare(`
      SELECT ordinal, text FROM blocks
      WHERE volume_id=? AND revision_id=? AND kind='text' AND ordinal BETWEEN ? AND ?
      ORDER BY ordinal
    `).all(volumeId, rev.revision_id, s, e);
    return {
      work: rev.work_title,
      volume: rev.volume_title,
      volume_id: volumeId,
      range: [s, e],
      paragraphs: blocks.map(b => `[p${String(b.ordinal).padStart(6, '0')}] ${b.text}`)
    };
  }
}
