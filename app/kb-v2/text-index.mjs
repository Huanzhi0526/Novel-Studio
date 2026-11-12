import { Converter } from 'opencc-js';

const simplify = Converter({ from: 't', to: 'cn' });
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const wordPattern = /[\p{L}\p{N}]+/gu;
const hanRunPattern = /\p{Script=Han}{2,}/gu;

const questionFramingPattern = /^(?:请问|帮我找一下|帮我找|找一下|想找一下|我想找|我想看|我想参考|想参考|能不能找|有没有|有哪些|有什么|哪些|哪位|什么|怎样|怎么|如何)+/u;
const trailingMetaPattern = /(?:的)?(?:情节|桥段|场景|片段|案例|例子|人设|角色|人物|设定|资料|内容|参考|写法|描写|设计)+$/u;

const stopTokens = new Set([
  '的', '了', '是', '有', '在', '和', '与', '或', '被', '把', '将', '会', '能', '可以',
  '谁', '怎么', '什么', '哪些', '哪位', '为何', '如何', '是否', '为什么', '请问',
  '一下', '这个', '那个', '一些', '一点', '之类', '相关', '关于', '比如', '例如',
  '作品', '小说', '书中', '故事', '情节', '桥段', '人物', '角色', '人设', '设定', '参考'
]);

export function normalizeTextV2(text) {
  if (typeof text !== 'string') return '';
  return simplify(text.normalize('NFKC').toLowerCase()).replace(/\s+/g, ' ').trim();
}

/**
 * Strip natural-language question framing while preserving core semantic terms.
 * Example: "有哪些装逼打脸情节？" -> "装逼打脸"
 * Example: "有哪些服装设计与描写？" -> "服装设计与描写" (keeps 服装 + 设计/描写 if stripping leaves too little)
 */
export function extractQueryCore(rawQuery) {
  const norm = normalizeTextV2(rawQuery).replace(/[？?！!。，、；：""''（）()【】\[\]]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!norm) return '';
  let stripped = norm.replace(questionFramingPattern, '').trim();
  const withoutTrailing = stripped.replace(trailingMetaPattern, '').trim();
  if (withoutTrailing.length >= 2) {
    stripped = withoutTrailing;
  }
  return stripped || norm;
}

/**
 * Hybrid CJK tokenizer for FTS5 indexing:
 * Emits both Intl.Segmenter multi-char words AND overlapping CJK 2-char bigrams.
 * This guarantees OOV compounds like "装逼打脸", "败犬", "修罗场", "哥特萝莉" are never lost to single-char splitting.
 */
export function tokenizeForIndex(text) {
  const norm = normalizeTextV2(text);
  if (!norm) return [];
  const tokens = new Set();

  for (const part of segmenter.segment(norm)) {
    const matches = part.segment.match(wordPattern);
    if (!matches) continue;
    for (const word of matches) {
      if (word.length >= 2 && word.length <= 24) {
        tokens.add(word);
      } else if (/^[a-z0-9]+$/u.test(word) && word.length >= 1) {
        tokens.add(word);
      }
    }
  }

  for (const match of norm.matchAll(hanRunPattern)) {
    const run = match[0];
    for (let i = 0; i <= run.length - 2; i++) {
      tokens.add(run.slice(i, i + 2));
    }
  }

  return [...tokens];
}

/**
 * Extract high-signal query terms (words + CJK bigrams) for FTS5 MATCH.
 */
export function extractSearchTermsV2(rawQuery, extraKeywords = []) {
  const core = extractQueryCore(rawQuery);
  const sources = [core, ...extraKeywords.map(k => normalizeTextV2(k))].filter(Boolean);
  const terms = new Set();

  for (const src of sources) {
    for (const part of segmenter.segment(src)) {
      const matches = part.segment.match(wordPattern);
      if (!matches) continue;
      for (const word of matches) {
        if (word.length >= 2 && !stopTokens.has(word)) {
          terms.add(word);
        }
      }
    }
    for (const match of src.matchAll(hanRunPattern)) {
      const run = match[0];
      // Split out stop-phrases inside long runs before generating bigrams
      for (let i = 0; i <= run.length - 2; i++) {
        const bg = run.slice(i, i + 2);
        if (!stopTokens.has(bg) && !bg.includes('的') && !bg.includes('了') && !bg.includes('有') && !bg.includes('是')) {
          terms.add(bg);
        }
      }
    }
  }

  return [...terms].slice(0, 36);
}

export function buildFtsMatchExpression(terms) {
  const safe = terms
    .map(t => t.replace(/"/g, '').trim())
    .filter(t => t.length >= 2 || /^[a-z0-9]{2,}$/u.test(t));
  if (!safe.length) return null;
  return safe.map(t => `"${t}"`).join(' OR ');
}
