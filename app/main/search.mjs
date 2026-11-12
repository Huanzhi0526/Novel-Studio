import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';
import { fail } from './store.mjs';
import { categoryLabels, normalizeSearch, searchTerms } from './search-text.mjs';

const template = 'nks-card-cn-v1';
const semanticThreshold = 0.56;
const rrfK = 60;
const channelLimit = 100;
const stopWords = new Set([
  '的', '了', '是', '有', '在', '和', '与', '被', '将', '会', '能', '谁', '怎么', '什么', '哪些', '哪位',
  '为何', '如何', '是否', '为什么', '为什么会', '可以', '请问', '请', '描述', '讲讲', '一下', '这个', '那个',
  '作品', '小说', '书中', '故事', '角色', '情节', '人物', '设定'
]);
const quantityQuestionWords = new Set(['需要', '多少']);
const scope = `
  w.deleted IS NULL AND
  (json_array_length(?)=0 OR c.work_id IN (SELECT value FROM json_each(?))) AND
  (json_array_length(?)=0 OR c.category IN (SELECT value FROM json_each(?)))`;

function scopeArgs(workIds = [], categories = []) {
  if (!Array.isArray(workIds) || !Array.isArray(categories) || workIds.length > 1000 ||
      workIds.some(id => typeof id !== 'string') || categories.some(key => !Object.hasOwn(categoryLabels, key))) {
    fail('SEARCH_FILTER', '检索筛选条件无效');
  }
  const works = JSON.stringify([...new Set(workIds)].sort());
  const types = JSON.stringify([...new Set(categories)].sort());
  return [works, works, types, types];
}

function vector(value) {
  const row = Float32Array.from(value ?? []);
  if (row.length < 2 || row.length > 4096 || row.some(entry => !Number.isFinite(entry))) {
    fail('EMBED_VECTOR', '语义模型返回无效向量');
  }
  const norm = Math.sqrt(row.reduce((sum, n) => sum + n * n, 0));
  if (!norm) fail('EMBED_VECTOR', '语义模型返回零向量');
  return row.map(n => n / norm);
}

function cardInput(row) {
  const aliases = JSON.parse(row.aliases);
  return `标题：${row.title}\n别名：${aliases.join('、')}\n类别：${categoryLabels[row.category]}\n内容：${row.content}`.slice(0, 6000);
}

function keywordReason(code) {
  if (code === 'EMBED_MODEL_NOT_CONFIGURED') return '本地语义模型尚未配置，已使用关键词检索。';
  if (code === 'SEARCH_INDEXING') return '语义索引待构建，已使用关键词检索。可在资料设置中构建索引。';
  return '本地语义模型暂时不可用，已使用关键词检索。重试时会重新连接模型。';
}

export class SearchService {
  embeddingLane = Promise.resolve();
  cursors = new Map();
  pendingIndex = null;

  constructor(reference, embedding, options = {}) {
    this.reference = reference;
    this.embedding = embedding;
    this.semanticThreshold = options.semanticThreshold ?? semanticThreshold;
  }

  get db() {
    return this.reference.db;
  }

  async encode(texts, signal, query = false) {
    signal?.throwIfAborted();
    if (!this.embedding) fail('EMBED_MODEL_NOT_CONFIGURED', '未配置本地模型');
    const job = this.embeddingLane.catch(() => {}).then(() => {
      signal?.throwIfAborted();
      return this.embedding.embed(texts, { signal, query });
    });
    this.embeddingLane = job;
    if (!signal) return job;
    let cancel;
    const aborted = new Promise((_, reject) => {
      cancel = () => reject(signal.reason);
      signal.addEventListener('abort', cancel, { once: true });
    });
    try {
      return await Promise.race([job, aborted]);
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }

  checkGeneration(generation) {
    if (generation !== this.reference.generation) fail('SEARCH_STALE', '资料索引已变化，请重新搜索');
  }

  keywords(query, args) {
    const meaningful = searchTerms(query).filter(term => !stopWords.has(term));
    if (!meaningful.length) return [];
    const exact = query.length <= 32 ? this.db.prepare(`
      SELECT c.id FROM reference_cards c JOIN reference_works w USING(work_id)
      WHERE ${scope} AND instr(c.search_text,?)>0
      ORDER BY instr(c.search_text,?)<>1,length(c.search_text),c.id LIMIT ${channelLimit}
    `).all(...args, query, query).map(row => row.id) : [];
    const candidateTerms = meaningful.filter(term => term.length >= 2 || query.length <= 2).slice(0, 24);
    // Common quantity-question words can co-occur in unrelated cards. Do not let
    // them supply evidence or make a longer question pass with one shared word.
    const terms = candidateTerms.filter(term => !quantityQuestionWords.has(term));
    if (!terms.length) return exact;
    const expression = terms.map(term => `"${term}"`).join(' OR ');
    const rows = this.db.prepare(`
      SELECT c.id,c.search_text,bm25(reference_fts) AS rank FROM reference_fts
      JOIN reference_cards c ON c.id=reference_fts.rowid JOIN reference_works w USING(work_id)
      WHERE reference_fts MATCH ? AND ${scope} ORDER BY rank,c.id LIMIT 240
    `).all(expression, ...args);
    const expected = candidateTerms.length >= 4 && terms.length >= 2 ? 2 : 1;
    const eligible = rows.filter(row => terms.filter(term => row.search_text.includes(term)).length >= expected);
    return [...new Set([...exact, ...eligible.map(row => row.id)])].slice(0, channelLimit);
  }

  missing(args) {
    return this.db.prepare(`
      SELECT count(*) AS count FROM reference_cards c JOIN reference_works w USING(work_id)
      LEFT JOIN reference_vectors v ON v.card_row=c.id AND v.model_id=? AND v.template=? AND v.card_revision=c.revision
      WHERE v.card_row IS NULL AND ${scope}
    `).get(this.embedding?.id ?? '', template, ...args).count;
  }

  async index(args, { signal, generation }) {
    const model = this.embedding?.id ?? '';
    let indexed = 0;
    while (true) {
      signal?.throwIfAborted();
      this.checkGeneration(generation);
      const pending = this.db.prepare(`
        SELECT c.* FROM reference_cards c JOIN reference_works w USING(work_id)
        LEFT JOIN reference_vectors v ON v.card_row=c.id AND v.model_id=? AND v.template=? AND v.card_revision=c.revision
        WHERE v.card_row IS NULL AND ${scope} ORDER BY c.id LIMIT 16
      `).all(model, template, ...args);
      if (!pending.length) return indexed;
      const raw = await this.encode(pending.map(cardInput), signal);
      signal?.throwIfAborted();
      this.checkGeneration(generation);
      if (raw.length !== pending.length) fail('EMBED_VECTOR', '本地模型返回的向量数量不符');
      const vectors = raw.map(vector);
      if (vectors.some(item => item.length !== vectors[0].length)) fail('EMBED_VECTOR', '本地模型返回的向量维度不一致');
      this.reference.store.transaction(() => {
        const write = this.db.prepare(`
          INSERT INTO reference_vectors VALUES (?,?,?,?,?,?)
          ON CONFLICT(card_row,model_id,template) DO UPDATE SET
            card_revision=excluded.card_revision,dimension=excluded.dimension,data=excluded.data
        `);
        pending.forEach((row, index) => {
          const value = vectors[index];
          write.run(row.id, row.revision, model, template, value.length,
            Buffer.from(value.buffer, value.byteOffset, value.byteLength));
        });
      });
      indexed += pending.length;
    }
  }

  async prepare({ workIds, categories } = {}, { signal } = {}) {
    if (this.pendingIndex) fail('SEARCH_INDEXING', '语义索引正在构建');
    const args = scopeArgs(workIds, categories);
    this.pendingIndex = this.index(args, { signal, generation: this.reference.generation });
    try {
      return { indexed: await this.pendingIndex, model: this.embedding?.id ?? null };
    } finally {
      this.pendingIndex = null;
    }
  }

  async semantic(query, args, signal, generation, threshold = this.semanticThreshold) {
    const raw = await this.encode([query], signal, true);
    const q = vector(raw[0]);
    const scored = [];
    let after = 0;
    let indexed = 0;
    while (true) {
      signal?.throwIfAborted();
      this.checkGeneration(generation);
      const rows = this.db.prepare(`
        SELECT c.id,v.dimension,v.data FROM reference_vectors v JOIN reference_cards c ON c.id=v.card_row
        JOIN reference_works w USING(work_id)
        WHERE v.model_id=? AND v.template=? AND v.card_revision=c.revision AND c.id>? AND ${scope}
        ORDER BY c.id LIMIT 384
      `).all(this.embedding.id, template, after, ...args);
      if (!rows.length) break;
      for (const { id, dimension, data } of rows) {
        if (dimension !== q.length || data.byteLength !== dimension * 4) fail('EMBED_DIMENSION', '模型维度已变更，请重新配置模型并构建索引');
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let score = 0;
        for (let i = 0; i < dimension; i++) score += q[i] * view.getFloat32(i * 4, true);
        if (score >= threshold) scored.push({ id, score });
      }
      indexed += rows.length;
      after = rows.at(-1).id;
      if (rows.length < 384) break;
      await setImmediate();
    }
    scored.sort((a, b) => b.score - a.score || a.id - b.id);
    return { hits: scored.slice(0, channelLimit).map(row => row.id), indexed };
  }

  page(session, offset, limit, start) {
    const read = this.db.prepare(`
      SELECT c.*,w.title AS work_title FROM reference_cards c JOIN reference_works w USING(work_id) WHERE c.id=?
    `);
    const hits = session.ids.slice(offset, offset + limit).map(id => this.reference.cardDetails(read.get(id)));
    let cursor = null;
    if (offset + limit < session.ids.length) {
      cursor = randomUUID();
      this.cursors.set(cursor, { ...session, offset: offset + limit });
      if (this.cursors.size > 24) this.cursors.delete(this.cursors.keys().next().value);
    }
    const { degraded, reason, channels, indexed } = session;
    return { hits, cursor, degraded, reason, channels, indexed, elapsed: Math.round(performance.now() - start) };
  }

  rankedPage({ query, workIds, categories, limit = 10 }, cards, metadata) {
    const args = scopeArgs(workIds, categories);
    const key = JSON.stringify([normalizeSearch(query), ...args]);
    const ids = cards.map(card => this.reference.cardRow(card.work_id, card.card_id)?.id).filter(Boolean);
    return this.page({ ids, key, generation: this.reference.generation, ...metadata }, 0, limit, performance.now());
  }

  async query({ query, workIds, categories, limit = 10, cursor }, { signal, broadCandidates = false } = {}) {
    const start = performance.now();
    signal?.throwIfAborted();
    if (typeof query !== 'string' || query.length > 500 || !Number.isInteger(limit) || limit < 1 || limit > 30) {
      fail('SEARCH_QUERY', '请输入不超过 500 字的检索问题');
    }
    const normalized = normalizeSearch(query);
    if (!normalized) fail('SEARCH_QUERY', '请先输入检索问题');
    const args = scopeArgs(workIds, categories);
    const key = JSON.stringify([normalized, ...args]);
    const generation = this.reference.generation;
    if (cursor) {
      const session = this.cursors.get(cursor);
      if (!session || session.key !== key || session.generation !== generation) fail('SEARCH_STALE', '结果分页已过期，请重新搜索');
      return this.page(session, session.offset, limit, start);
    }
    const keywords = this.keywords(normalized, args);
    let semantic = [];
    let reason = null;
    let indexed = 0;
    const total = this.db.prepare(`
      SELECT count(*) AS count FROM reference_cards c JOIN reference_works w USING(work_id) WHERE ${scope}
    `).get(...args).count;
    if (total) {
      try {
        if (!this.embedding || ('modelPath' in this.embedding && !this.embedding.modelPath)) {
          fail('EMBED_MODEL_NOT_CONFIGURED', '未配置本地模型');
        }
        const missing = this.missing(args);
        if (missing > 128 || (missing && this.pendingIndex)) fail('SEARCH_INDEXING', '语义索引待构建');
        if (missing) await this.index(args, { signal, generation });
        const result = await this.semantic(normalized, args, signal, generation, broadCandidates ? -1 : this.semanticThreshold);
        semantic = result.hits;
        indexed = result.indexed;
      } catch (error) {
        signal?.throwIfAborted();
        this.checkGeneration(generation);
        reason = keywordReason(error.code);
      }
    }
    signal?.throwIfAborted();
    this.checkGeneration(generation);
    const ranks = new Map();
    for (const channel of [keywords, semantic]) {
      channel.forEach((id, index) => ranks.set(id, (ranks.get(id) ?? 0) + 1 / (rrfK + index + 1)));
    }
    const ids = [...ranks].sort(([a, x], [b, y]) => y - x || a - b).map(([id]) => id);
    return this.page({
      ids, key, generation, degraded: Boolean(reason), reason, indexed,
      channels: { keyword: keywords.length, semantic: semantic.length }
    }, 0, limit, start);
  }
}
