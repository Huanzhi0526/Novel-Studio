import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { paragraphNumber } from '../../app/main/protocol.mjs';
import { AgyFlashClient, resolveAgyExecutable } from '../../app/kb-v2/agy-client.mjs';
import { parseLooseJson } from '../../app/kb-v2/retrieval-v2.mjs';
import { ReferenceStoreV2, volumeOrderNumber } from '../../app/kb-v2/store-v2.mjs';
import { SearchEngineV2 } from '../../app/kb-v2/search-v2.mjs';
import { EmbeddingProvider } from '../../app/main/embedding.mjs';
import { captureAntigravityUsage } from '../capture-antigravity-usage.mjs';

// agy.exe acp truncates single session/prompt inputs around ~196 KB UTF-8 (~188.5 KB body + ~8 KB header).
// Keep every segment <= 148 KB UTF-8 (and <= 74 KB on fallback split) so 0 bytes are ever truncated.
const MAX_SEGMENT_BYTES = 148_000;
const FALLBACK_HALF_BYTES = 74_000;
const MAX_SYNTH_OBS_BYTES = 142_000;

const AFTERWORD_TITLE_RE = /(?:后记|後記|插画后记|插畫後記|奥付|制作信息|版权页|版權頁|译注汇总|特典说明)/i;

function minScenesForSegment(segTextCount, isTail = false) {
  if (segTextCount === 0) return 0;
  if (isTail && segTextCount < 160) return 0;
  if (segTextCount < 280) return 1;
  if (segTextCount < 900) return 2;
  if (segTextCount < 1600) return 4;
  return 5;
}

function collectVolumeTextItems(volume, structures) {
  const sections = (structures ?? [])
    .filter(s => s.volume_id === volume.volume_id && s.revision_id === volume.revision_id && s.type !== 'volume' && s.type !== 'frontmatter')
    .map(s => ({
      start: paragraphNumber(s.start),
      end: paragraphNumber(s.end),
      title: (s.title || s.type || '').trim()
    }))
    .filter(s => s.start && s.end)
    .sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));

  const chapterStarts = new Map();
  for (const sec of sections) {
    if (!chapterStarts.has(sec.start)) chapterStarts.set(sec.start, sec.title);
  }

  const chapterForOrd = ord => {
    let best = null;
    for (const sec of sections) {
      if (ord >= sec.start && ord <= sec.end) {
        if (!best || (sec.end - sec.start) <= (best.end - best.start)) best = sec;
      }
    }
    return best?.title ?? '';
  };

  const items = [];
  const blocks = volume.normalized_payload.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const ord = i + 1;
    const b = blocks[i];
    if (b.kind === 'text' && b.text?.trim()) {
      const chapHeader = chapterStarts.get(ord) ?? null;
      const chapterTitle = chapHeader || chapterForOrd(ord);
      const prefix = chapHeader ? `\n=== 章节：${chapHeader} ===\n` : '';
      const line = `${prefix}[${ord}] ${b.text.trim()}`;
      items.push({
        ord,
        chapterTitle,
        isChapterStart: Boolean(chapHeader),
        isAfterword: AFTERWORD_TITLE_RE.test(chapterTitle),
        line,
        bytes: Buffer.byteLength(line + '\n', 'utf8')
      });
    }
  }

  const storyItems = items.filter(it => !it.isAfterword);
  return {
    totalBlocks: blocks.length,
    items,
    storyItems: storyItems.length > 0 ? storyItems : items
  };
}

function takeNextSegment(remainingItems, maxBytes) {
  if (remainingItems.length === 0) return [];
  let accBytes = 0;
  let endIdx = 0;
  for (let i = 0; i < remainingItems.length; i++) {
    const b = remainingItems[i].bytes;
    if (i > 0 && accBytes + b > maxBytes) break;
    accBytes += b;
    endIdx = i + 1;
  }
  if (endIdx < remainingItems.length && endIdx >= 40) {
    // Prefer splitting cleanly at a chapter start within [65%..100%] of the window
    const searchFrom = Math.max(1, Math.floor(endIdx * 0.65));
    for (let j = endIdx - 1; j >= searchFrom; j--) {
      if (remainingItems[j].isChapterStart) {
        endIdx = j;
        break;
      }
    }
  }
  return remainingItems.slice(0, endIdx);
}

function isTailFullyCovered(storyItems, coveredUpTo) {
  if (storyItems.length === 0) return true;
  if (coveredUpTo <= 0) return false;
  const remStory = storyItems.filter(it => it.ord > coveredUpTo);
  if (remStory.length <= 45) return true;
  const remBytes = remStory.reduce((n, it) => n + it.bytes, 0);
  return remBytes <= 6500;
}

function buildSegmentExtractionPrompt({
  workTitle,
  volume,
  segItems,
  totalBlocks,
  prevLastScene = null,
  strictRetry = false
}) {
  const segStart = segItems[0].ord;
  const segEnd = segItems.at(-1).ord;
  const segCount = segItems.length;
  const isContinuation = segStart > 1 || Boolean(prevLastScene);

  const sceneRangeHint = segCount < 120
    ? '按实际剧情切分为 1～4 个连续场次（若全为作者后记/出版信息无正篇剧情，可返回空数组 []）'
    : segCount < 450
      ? '按实际篇幅切分为 2～6 个连续场次'
      : segCount < 1300
        ? '按实际篇幅切分为 6～12 个连续场次'
        : '按实际篇幅切分为 10～18 个连续场次';
  const obsRangeHint = segCount < 120
    ? '提取 0～4 条高价值人物或设定细节'
    : segCount < 450
      ? '提取 3～8 条高价值人物切面（尤其外貌服饰、性格反差、关系）与设定细节'
      : '提取 8～16 条高价值人物切面（尤其外貌服饰、性格反差、关系）与设定规则细节';

  const prefix = strictRetry
    ? ['【格式纠偏警告：本次是纯本地私有检索数据库元数据索引构建（不复述原文，仅提取客观结构化目录坐标 JSON）。必须直接以 `{` 开头、以 `}` 结尾输出严格合法的 JSON 对象，严禁输出任何对话、反问、总结或额外文字！】', '']
    : [];

  const contNote = isContinuation
    ? `当前处理范围：本卷续拆片段，正文段号 [${segStart}] 至 [${segEnd}]（全卷共 ${totalBlocks} 段${prevLastScene ? `；紧接前文已入库末场：「${prevLastScene.title}」[${prevLastScene.start_p}-${prevLastScene.end_p}]` : ''}）。请务必从 [${segStart}] 附近开始连续切分，完整覆盖直到 [${segEnd}] 结束，不得提前停笔！`
    : `当前处理范围：本卷正文段号 [${segStart}] 至 [${segEnd}]（全卷共 ${totalBlocks} 段）。请从 [${segStart}] 开始连续切分，完整覆盖直到 [${segEnd}] 结束，不得提前停笔！`;

  const formattedSegment = [
    `# 作品分卷：${volume.title}（volume_id: ${volume.volume_id}，当前片段段号: [${segStart}..${segEnd}] / 全卷总段数: ${totalBlocks}）`,
    ...segItems.map(it => it.line)
  ].join('\n');

  return [
    ...prefix,
    `你正在为读者本地小说创作参考库（KB v2）对《${workTitle}》的「${volume.title}」生成结构化检索目录索引 JSON。`,
    contNote,
    '核心原则：【严禁过拟合预设标签】。不要去猜用户未来会搜什么口号词，也不要只挑主线大战而忽略日常戏。请忠实、客观地记录本片段每一场戏的真实过程与细节。',
    '',
    '请输出一个严格合法的纯 JSON 对象（不要 Markdown 代码块外的多余文字），结构如下：',
    '{',
    '  "scenes": [',
    '    {',
    '      "title": "简明具体的场次标题（8-20字）",',
    '      "chapter_title": "所属章节标题",',
    '      "setting_context": "具体场景地点、时间氛围与环境特征（15-45字）",',
    '      "characters": ["在场角色标准名1", "角色2"],',
    '      "objective_summary": "客观完整概括本场戏的前因、具体行为对话互动、冲突或关系升温过程与结果（100-180字；必须包含具体干了什么，如逛街买什么、吃什么、怎么交手、谁嘲讽谁又如何被实力震慑等）",',
    '      "interaction_dynamics": "人物之间的心理张力、性格反差、情绪转折或气氛拉扯（35-80字）",',
    '      "narrative_highlights": "本场戏在写作设计上的参考看点（如反差萌塑造、节奏铺垫、喜剧包袱、以弱胜强/展露实力震慑旁人、服饰与环境烘托等，35-80字）",',
    `      "start_p": ${segStart},`,
    `      "end_p": ${Math.min(segEnd, segStart + 150)}`,
    '    }',
    '  ],',
    '  "observations": [',
    '    {',
    '      "entity_type": "character" | "world_rule",',
    '      "name": "角色标准名 或 世界规则/魔法机制/重要组织制度名",',
    '      "aliases": ["别名或称号"],',
    '      "aspect": "identity_appearance" | "persona_style" | "relationships" | "arc_highlights" | "core_mechanism" | "cost_constraints" | "narrative_application",',
    '      "detail": "具体且有信息密度的细节记录（60-150字）。特别注意：① 凡正文中描写的角色服装穿搭（制服、私服、礼服、泳装、女仆装、铠甲法袍、饰品配色款式）与外貌神态特征，务必归入 identity_appearance 并保留具体款式色彩细节！② 凡涉及魔法/技能/游戏机制/制度的发动条件、限制与代价，务必归入 cost_constraints 或 core_mechanism！",',
    `      "start_p": ${segStart},`,
    `      "end_p": ${Math.min(segEnd, segStart + 40)}`,
    '    }',
    '  ]',
    '}',
    '',
    '硬性要求：',
    `1. scenes 必须按正文段号 \`[段号]\` 从 [${segStart}] 到 [${segEnd}] 顺序切分覆盖本片段全部实质剧情（${sceneRangeHint}），日常闲聊、外出同行/约会、用餐、换装、探索、考试、战斗全部如实切入，最后一场戏的 end_p 必须推进到本片段末尾（[${segEnd}] 附近，后记除外）！`,
    `2. start_p 与 end_p 必须是本片段中真实出现的整数段号（${segStart} <= start_p <= end_p <= ${segEnd}）。`,
    `3. observations ${obsRangeHint}。`,
    '4. 只输出纯 JSON 对象，确保引号转义合法。',
    '',
    '================ 以下为本片段标准化正文 ================',
    formattedSegment,
    '================ 本片段正文结束 ================',
    '请立即严格按上方结构输出纯 JSON 对象（直接以 { 开头、以 } 结尾，必须包含 scenes 与 observations 数组，严禁输出任何对话、反问、总结或额外文字）：'
  ].join('\n');
}

function fitObservationsWithinBytes(volumeSummaries, maxBytes = MAX_SYNTH_OBS_BYTES) {
  let current = volumeSummaries.map(v => ({
    volume_id: v.volume_id,
    volume_title: v.volume_title ?? v.title,
    observations: (v.observations ?? []).map(o => ({
      entity_type: o.entity_type,
      name: o.name,
      aliases: o.aliases,
      aspect: o.aspect,
      detail: o.detail,
      start_p: o.start_p,
      end_p: o.end_p
    }))
  }));
  let serialized = JSON.stringify(current);
  if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) return serialized;

  // Progressively cap per-volume observations evenly if a 22-volume book exceeds 142 KB UTF-8
  for (let cap = 26; cap >= 8; cap -= 3) {
    const trimmed = current.map(v => ({
      ...v,
      observations: v.observations.slice(0, cap)
    }));
    serialized = JSON.stringify(trimmed);
    if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) return serialized;
  }
  return serialized.slice(0, maxBytes);
}

function buildDossierSynthesisPrompt(workTitle, volumeSummaries, focusType = 'all', strictRetry = false) {
  const focusDesc = focusType === 'character'
    ? '跨全卷「人物切面档案」（entity_type 固定为 "character"）'
    : focusType === 'world_rule'
      ? '跨全卷「世界/机制设定切面档案」（entity_type 固定为 "world_rule"）'
      : '跨卷「人物切面档案」与「世界/机制设定切面档案」';

  const specificRules = focusType === 'character'
    ? [
        '1. 本次仅整理人物档案（entity_type="character"）。主角、核心女主/同伴群、关键导师/对手等主要角色尽量配齐 identity_appearance、persona_style、relationships、arc_highlights 四个切面；有亮点的次要角色保留 1～2 个最突出的切面（全书共整理约 10～26 名角色）。',
        '2. 人物的 identity_appearance 切面必须把身份背景、外貌特征以及各卷出现过的代表性服装造型（制服、私服、礼服、泳装、装备法袍等款式配色细节）完整汇总；persona_style 写清表里反差与行为模式；arc_highlights 汇总跨卷关键高光与成长转折。'
      ]
    : focusType === 'world_rule'
      ? [
          '1. 本次仅整理世界观、魔法/技能/游戏机制体系、学园/公会/贵族制度、关键舞台或特殊武装道具档案（entity_type="world_rule"，全书共整理约 4～14 项核心设定）。',
          '2. 每项设定按 core_mechanism（核心规则与运作方式）、cost_constraints（发动条件、限制与代价）、narrative_application（对剧情冲突或日常互动的推动作用）组织 2～3 个切面。'
        ]
      : [
          '1. 主要角色尽量配齐 identity_appearance、persona_style、relationships、arc_highlights 四个切面；次要特色角色保留 1～2 个切面。',
          '2. 世界观、魔法/能力体系、学园/公会/贵族制度、关键社团或特殊道具归为 entity_type="world_rule"，按 core_mechanism、cost_constraints、narrative_application 组织切面。'
        ];

  const prefix = strictRetry
    ? ['【格式纠偏警告：必须直接输出 `{ "dossiers": [...] }` 纯 JSON 对象，严禁输出任何其他解释文字！】', '']
    : [];

  const compactJson = fitObservationsWithinBytes(volumeSummaries, MAX_SYNTH_OBS_BYTES);

  return [
    ...prefix,
    `你正在为《${workTitle}》汇总${focusDesc}。`,
    '下方提供了从全书各卷正文中直接提取的客观观察记录（附带 volume_id 与起止段号 start_p / end_p）。',
    '请将同一对象在不同分卷的记录去重合并，整理为高信息密度、可直接供小说作者参考的切面档案，并输出严格合法的纯 JSON 对象：',
    '{',
    '  "dossiers": [',
    '    {',
    `      "entity_type": ${focusType === 'character' ? '"character"' : focusType === 'world_rule' ? '"world_rule"' : '"character" | "world_rule"'},`,
    '      "name": "对象标准名称",',
    '      "aliases": ["别名", "头衔", "常见称呼"],',
    '      "summary": "一句话精准概括该角色的人设核心定位（含身份阶级、核心属性反差）或该设定的核心作用（30-70字）",',
    '      "facets": [',
    '        {',
    '          "facet_kind": "identity_appearance" | "persona_style" | "relationships" | "arc_highlights" | "core_mechanism" | "cost_constraints" | "narrative_application",',
    '          "title": "对象名 · 切面具体标题",',
    '          "content": "结构清晰、细节丰富的受限 Markdown 文本（150-420字，可用无序列表和粗体）。",',
    '          "evidence": [',
    '            { "volume_id": "原样保留输入中的volume_id", "start": 50, "end": 85 }',
    '          ]',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
    '硬性要求：',
    ...specificRules,
    '3. 每个切面的 evidence 数组保留 1～4 条最能支撑该切面的真实 {volume_id, start, end}，严禁编造不存在的 volume_id。',
    '4. 只输出纯 JSON 对象，确保引号转义合法。',
    '',
    '================ 以下为各卷实证观察记录 ================',
    compactJson,
    '================ 观察记录结束 ================',
    '请立即严格按上方结构输出纯 JSON 对象（直接以 { 开头、以 } 结尾，必须包含 dossiers 数组，严禁输出任何解释或额外文字）：'
  ].join('\n');
}

function isLikelyQuotaError(err) {
  const msg = String(err?.message ?? '');
  return /RESOURCE_EXHAUSTED|quota\s+exceeded|rate[_\s-]?limit|429\s+Too\s+Many|exhausted\s+your\s+.*limit/i.test(msg);
}

function mergeUsage(target, src) {
  if (!src) return;
  for (const k of ['inputTokens', 'outputTokens', 'cachedReadTokens', 'thoughtTokens', 'totalTokens']) {
    target[k] = (target[k] ?? 0) + (src[k] ?? 0);
  }
}

function normalizeAndMergeScenes(existingScenes, addedScenes, segStart, segEnd, maxOrd) {
  const merged = [...existingScenes];
  for (const raw of addedScenes ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    let sp = Number(raw.start_p) || segStart;
    let ep = Number(raw.end_p) || sp;
    if (ep < sp) [sp, ep] = [ep, sp];
    sp = Math.max(1, Math.min(maxOrd, sp));
    ep = Math.max(sp, Math.min(maxOrd, ep));
    // Skip duplicate scenes that belong entirely inside already-covered range before segStart - 15
    if (ep < segStart) continue;
    merged.push({
      ...raw,
      start_p: sp,
      end_p: ep
    });
  }
  merged.sort((a, b) => (a.start_p - b.start_p) || (a.end_p - b.end_p));
  return merged;
}

async function main() {
  const args = process.argv.slice(2);
  const concurrency = Number(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? 6);
  const skipVectors = args.includes('--skip-vectors');

  const mvpRoot = resolve('.local/kb-v2-mvp');
  const workerCwd = join(mvpRoot, 'worker-cwd');
  const samplesRoot = join(mvpRoot, 'samples');
  const extractionsRoot = join(mvpRoot, 'data/extractions');
  const reportsRoot = join(mvpRoot, 'reports');
  const dbPath = join(mvpRoot, 'data/app-profile/reference-v2.sqlite');

  mkdirSync(workerCwd, { recursive: true });
  mkdirSync(extractionsRoot, { recursive: true });
  mkdirSync(reportsRoot, { recursive: true });
  mkdirSync(join(mvpRoot, 'data/app-profile'), { recursive: true });

  const manifestFile = join(reportsRoot, 'export-all-manifest.json');
  if (!existsSync(manifestFile)) {
    throw new Error('请先运行 scripts/kb-v2/export-all-v2.mjs 导出参考书样本清单');
  }
  const exportManifest = JSON.parse(readFileSync(manifestFile, 'utf8'));

  const agyExecutable = resolveAgyExecutable();
  try {
    await captureAntigravityUsage({
      executable: agyExecutable,
      filename: join(reportsRoot, 'quota-before-continuation.json'),
      cwd: workerCwd
    });
  } catch (e) {
    console.warn('[Quota Before Warning]', e.message);
  }

  // Bounded 5-entry LRU cache for parsed result.json files so heap stays < 220 MB across 27 books
  const sampleCache = new Map();
  const loadSampleJson = workId => {
    if (sampleCache.has(workId)) {
      const val = sampleCache.get(workId);
      sampleCache.delete(workId);
      sampleCache.set(workId, val);
      return val;
    }
    const parsed = JSON.parse(readFileSync(join(samplesRoot, workId, 'result.json'), 'utf8'));
    sampleCache.set(workId, parsed);
    if (sampleCache.size > 5) {
      const oldest = sampleCache.keys().next().value;
      sampleCache.delete(oldest);
    }
    return parsed;
  };

  const store = new ReferenceStoreV2(dbPath);
  const startedAt = Date.now();
  const runUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, thoughtTokens: 0, totalTokens: 0 };
  const errorsLog = [];

  // Quota wait coordinator so concurrent lanes pause together if 5h bucket briefly hits 0%
  let quotaGatePromise = null;
  let quotaHalted = false;
  const handlePotentialQuotaPause = async err => {
    if (!isLikelyQuotaError(err)) return false;
    if (quotaGatePromise) {
      await quotaGatePromise;
      return !quotaHalted;
    }
    quotaGatePromise = (async () => {
      try {
        const snapPath = join(reportsRoot, 'quota-mid-check.json');
        const snap = await captureAntigravityUsage({ executable: agyExecutable, filename: snapPath, cwd: workerCwd });
        const geminiGroup = snap?.command?.data?.groups?.find(g => g.name?.includes('Gemini'));
        const b5h = geminiGroup?.buckets?.find(b => b.id === 'gemini-5h');
        const bWeekly = geminiGroup?.buckets?.find(b => b.id === 'gemini-weekly');
        if (bWeekly && bWeekly.remaining_fraction <= 0.005) {
          console.warn(`[Quota Halt] Weekly Gemini quota exhausted (reset=${bWeekly.reset_time}). Saving checkpoint...`);
          quotaHalted = true;
          return;
        }
        if (b5h && b5h.remaining_fraction <= 0.015 && b5h.reset_time) {
          const waitMs = new Date(b5h.reset_time).getTime() - Date.now() + 20_000;
          if (waitMs > 0 && waitMs <= 180 * 60 * 1000) {
            console.log(`[Quota Wait] 5-hour bucket resets at ${b5h.reset_time}; sleeping ${Math.ceil(waitMs / 1000)}s then resuming...`);
            await new Promise(r => setTimeout(r, waitMs));
            return;
          }
          if (waitMs > 180 * 60 * 1000) {
            console.warn(`[Quota Halt] 5-hour bucket resets in ${Math.round(waitMs / 60000)}m (> 180m). Saving checkpoint...`);
            quotaHalted = true;
          }
        }
      } catch (qe) {
        console.warn('[Quota Check Error]', qe.message);
      }
    })().finally(() => { quotaGatePromise = null; });
    await quotaGatePromise;
    return !quotaHalted;
  };

  // Phase 1: Canonical check & Full-Coverage / Truncation Audit across all 278 volumes
  console.log(`\n=== Phase 1: Auditing Full-Volume Coverage & Continuation Ranges across ${exportManifest.works.length} Books ===`);
  const books = [];
  let totalAlreadyCompleteVols = 0;
  let totalNeedContinueVols = 0;
  let totalFreshVols = 0;

  for (const item of exportManifest.works) {
    const workId = item.work_id;
    const sampleDir = join(samplesRoot, workId);
    const resultJson = JSON.parse(readFileSync(join(sampleDir, 'result.json'), 'utf8'));
    const workTitle = resultJson.work.title;

    // Fast path: only run ingestExportedBook if volumes or passage_chunks are missing in SQLite
    const existingVolCount = store.db.prepare('SELECT count(*) AS c FROM volumes WHERE work_id=?').get(workId).c;
    const existingPassCount = store.db.prepare('SELECT count(*) AS c FROM passage_chunks WHERE work_id=?').get(workId).c;
    let passageChunks = existingPassCount;
    if (existingVolCount !== resultJson.volumes.length || (existingPassCount === 0 && item.blocks > 0)) {
      const assetReader = relPath => {
        const p = join(sampleDir, relPath);
        return existsSync(p) ? readFileSync(p) : null;
      };
      const ingestStats = store.ingestExportedBook(resultJson, assetReader, { passageVolumeIds: null });
      passageChunks = ingestStats.chunksBuilt;
    }

    const sortedVols = [...resultJson.volumes].sort((a, b) => {
      const oa = volumeOrderNumber(a.title);
      const ob = volumeOrderNumber(b.title);
      return oa - ob || a.title.localeCompare(b.title, 'zh-CN');
    });

    const workExtractDir = join(extractionsRoot, workId);
    mkdirSync(workExtractDir, { recursive: true });

    const volEntries = [];
    let incompleteCount = 0;
    let anyVolContinuedInHistory = false;

    for (const vol of sortedVols) {
      const { totalBlocks, items, storyItems } = collectVolumeTextItems(vol, resultJson.structures);
      const cachePath = join(workExtractDir, `${vol.volume_id}.json`);
      let isComplete = false;
      let coveredUpTo = 0;

      if (items.length === 0) {
        if (!existsSync(cachePath)) {
          writeFileSync(cachePath, JSON.stringify({
            volume_id: vol.volume_id,
            revision_id: vol.revision_id,
            title: vol.title,
            skippedEmpty: true,
            fullCoverage: true,
            scenes: [],
            observations: []
          }, null, 2));
        }
        isComplete = true;
        totalAlreadyCompleteVols++;
      } else if (existsSync(cachePath)) {
        try {
          const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
          const existingScenes = Array.isArray(cached.scenes) ? cached.scenes : [];
          coveredUpTo = existingScenes.length > 0 ? Math.max(...existingScenes.map(s => Number(s.end_p) || 0)) : 0;
          if (cached.continuedSegments > 0) anyVolContinuedInHistory = true;

          if (cached.skippedEmpty || (existingScenes.length > 0 && (cached.fullCoverage === true || isTailFullyCovered(storyItems, coveredUpTo)))) {
            if (!cached.fullCoverage) {
              cached.fullCoverage = true;
              writeFileSync(cachePath, JSON.stringify(cached, null, 2));
            }
            const dbScenes = store.db.prepare('SELECT count(*) AS c FROM scenes WHERE work_id=? AND volume_id=?').get(workId, vol.volume_id).c;
            if (dbScenes !== existingScenes.length) {
              store.replaceVolumeScenes(workId, vol.volume_id, vol.revision_id, existingScenes);
            }
            isComplete = true;
            totalAlreadyCompleteVols++;
          }
        } catch {}
      }

      if (!isComplete) {
        incompleteCount++;
        if (coveredUpTo > 0) totalNeedContinueVols++;
        else totalFreshVols++;
      }

      volEntries.push({
        workId,
        workTitle,
        volumeId: vol.volume_id,
        revisionId: vol.revision_id,
        title: vol.title,
        totalBlocks,
        textBlockCount: items.length,
        lastStoryOrd: storyItems.at(-1)?.ord ?? 0,
        coveredUpTo,
        cachePath,
        done: isComplete
      });
    }

    const dossierCachePath = join(workExtractDir, 'dossiers-synthesized.json');
    let synthesized = false;
    if (incompleteCount === 0 && existsSync(dossierCachePath)) {
      try {
        const cachedDossiers = JSON.parse(readFileSync(dossierCachePath, 'utf8'));
        const dossierIsFull = cachedDossiers.fullCoverage === true || !anyVolContinuedInHistory;
        if (dossierIsFull && cachedDossiers.volumeCount === sortedVols.length && Array.isArray(cachedDossiers.dossiers) && cachedDossiers.dossiers.length > 0) {
          if (!cachedDossiers.fullCoverage) {
            cachedDossiers.fullCoverage = true;
            writeFileSync(dossierCachePath, JSON.stringify(cachedDossiers, null, 2));
          }
          const dbDossiers = store.db.prepare('SELECT count(*) AS c FROM dossiers WHERE work_id=?').get(workId).c;
          if (dbDossiers !== cachedDossiers.dossiers.length) {
            store.replaceWorkDossiers(workId, cachedDossiers.dossiers);
          }
          synthesized = true;
        }
      } catch {}
    }

    const bookObj = {
      workId,
      title: workTitle,
      totalVolumes: sortedVols.length,
      blocks: item.blocks,
      passageChunks,
      volumes: volEntries,
      remainingVols: incompleteCount,
      failedVols: [],
      dossierCachePath,
      synthesized,
      completedAt: synthesized ? 'cached-full' : null
    };
    books.push(bookObj);
    console.log(`  [Audit] ${workTitle}: ${sortedVols.length - incompleteCount}/${sortedVols.length} full-covered vols (${incompleteCount} to continue/split), dossiers=${synthesized ? 'full-ready' : 'todo'}`);
  }

  console.log(`\n[Audit Summary] Already 100% covered=${totalAlreadyCompleteVols} vols | Truncated needing continuation=${totalNeedContinueVols} vols | Unsplit=${totalFreshVols} vols`);

  // Sort books by remaining incomplete volumes ascending, then total volumes ascending, so books finish early and steadily
  books.sort((a, b) => a.remainingVols - b.remainingVols || a.totalVolumes - b.totalVolumes);

  // Progress report writer
  let vectorsIndexedThisRun = 0;
  let activeEmbedBackend = null;

  const writeProgressCheckpoint = (phaseLabel = 'running') => {
    const dbStats = store.stats();
    const bookRows = books.map(b => {
      const scenes = store.db.prepare('SELECT count(*) AS c FROM scenes WHERE work_id=?').get(b.workId).c;
      const dossiers = store.db.prepare('SELECT count(*) AS c FROM dossiers WHERE work_id=?').get(b.workId).c;
      const facets = store.db.prepare('SELECT count(*) AS c FROM dossier_facets WHERE work_id=?').get(b.workId).c;
      return {
        work_id: b.workId,
        title: b.title,
        totalVolumes: b.totalVolumes,
        doneVolumes: b.totalVolumes - b.remainingVols,
        failedVolumes: b.failedVols.length,
        synthesized: b.synthesized,
        scenes,
        dossiers,
        facets,
        passageChunks: b.passageChunks,
        completedAt: b.completedAt
      };
    });

    const completedBooks = bookRows.filter(r => r.doneVolumes === r.totalVolumes && r.synthesized).length;
    const totalDoneVols = bookRows.reduce((n, r) => n + r.doneVolumes, 0);
    const totalAllVols = bookRows.reduce((n, r) => n + r.totalVolumes, 0);

    const progressJson = {
      updatedAt: new Date().toISOString(),
      status: phaseLabel,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      concurrency,
      completedBooks,
      totalBooks: books.length,
      completedVolumes: totalDoneVols,
      totalVolumes: totalAllVols,
      vectorsIndexedThisRun,
      embeddingBackend: activeEmbedBackend,
      llmUsageThisRun: runUsage,
      dbStats,
      resolvedTransientRetries: errorsLog.filter(e => e.resolved).length,
      errors: errorsLog.filter(e => !e.resolved),
      books: bookRows
    };
    writeFileSync(join(reportsRoot, 'full-library-progress.json'), JSON.stringify(progressJson, null, 2));

    const mdLines = [
      '# KB v2 全书库（27 部 / 278 卷）全卷无截断拆解与索引实时台账',
      '',
      `- 更新时间：\`${progressJson.updatedAt}\`（状态：\`${phaseLabel}\`，已运行 \`${progressJson.elapsedSeconds}s\`）`,
      `- 整书完成进度：**${completedBooks} / ${books.length} 部**｜满卷覆盖进度：**${totalDoneVols} / ${totalAllVols} 卷**`,
      `- 数据库总计：档案 **${dbStats.dossiers}** 份（切面 **${dbStats.facets}** 条）｜顺序场次 **${dbStats.scenes}** 场｜原文切片 **${dbStats.passages}** 片`,
      `- 向量索引进度（后端：\`${activeEmbedBackend || 'pending'}\`）：本次新增 **${vectorsIndexedThisRun}** 条，库内总计 **${dbStats.vectors.reduce((n, v) => n + v.c, 0)}** 条`,
      '',
      '| # | 书名 | 满卷进度 | 切面档案 | 独立切面 | 顺序场次 | 原文切片 | 状态 |',
      '|---:|---|---:|---:|---:|---:|---:|---|',
      ...bookRows.map((r, idx) => `| ${idx + 1} | ${r.title} | ${r.doneVolumes}/${r.totalVolumes} | ${r.dossiers} | ${r.facets} | ${r.scenes} | ${r.passageChunks} | ${r.synthesized && r.doneVolumes === r.totalVolumes ? '已完成(全覆盖)' : r.failedVolumes > 0 ? '待补卷' : '续拆/汇总中'} |`)
    ];
    writeFileSync(join(reportsRoot, 'full-library-progress.md'), mdLines.join('\n') + '\n');
    return progressJson;
  };

  writeProgressCheckpoint('audited');

  // Stage C setup: Background Overlapped Vulkan GPU Embedding Worker
  let embedFinishedAllStages = false;
  let wakeEmbedResolve = null;
  const wakeEmbedder = () => {
    if (wakeEmbedResolve) {
      const fn = wakeEmbedResolve;
      wakeEmbedResolve = null;
      fn();
    }
  };

  const embedPromise = (async () => {
    if (skipVectors) return;
    const modelPath = resolve('.local/model/Qwen3-Embedding-0.6B-Q8_0.gguf');
    const vulkanRuntime = resolve('.local/kb-v2-mvp/llama-cpp-vulkan/llama-server.exe');
    const cpuRuntime = resolve('.local/model/llama-cpp/llama-server.exe');
    const useVulkan = existsSync(vulkanRuntime);
    const { size, mtimeMs } = statSync(modelPath);
    const modelId = `Qwen3-Embedding-0.6B-Q8_0:${size}:${Math.trunc(mtimeMs)}`;

    const emb = new EmbeddingProvider({
      modelPath,
      runtimePath: useVulkan ? vulkanRuntime : cpuRuntime,
      fallbackRuntimePath: cpuRuntime,
      id: modelId,
      idleTimeoutMs: 0,
      startupTimeoutMs: 45_000,
      extraArgs: useVulkan
        ? ['-ngl', '99', '--device', 'Vulkan0', '--ctx-size', '16384', '--batch-size', '2048', '--ubatch-size', '1024']
        : ['--ctx-size', '16384', '--batch-size', '2048', '--ubatch-size', '1024', '--threads', '8', '--threads-batch', '8']
    });
    const searchEngine = new SearchEngineV2(store, emb);
    const writePassageVec = store.db.prepare(`
      INSERT INTO vectors(unit_type, unit_row, model_id, dimension, data)
      VALUES('passage', ?, ?, ?, ?)
      ON CONFLICT(unit_type, unit_row, model_id) DO UPDATE SET dimension=excluded.dimension, data=excluded.data
    `);
    const selectPendingPassages = store.db.prepare(`
      SELECT p.id, p.text, p.chapter_title, w.title AS work_title, vol.title AS volume_title
      FROM passage_chunks p
      JOIN works w USING(work_id)
      JOIN volumes vol USING(volume_id)
      LEFT JOIN vectors v ON v.unit_type='passage' AND v.unit_row=p.id AND v.model_id=?
      WHERE v.unit_row IS NULL ORDER BY p.id LIMIT ?
    `);

    let lastLoggedMilestone = 0;
    let consecutiveEmbedErrors = 0;
    try {
      while (true) {
        try {
          const fsRes = await searchEngine.prepare({ includePassages: false, batchSize: 12 });
          consecutiveEmbedErrors = 0;
          if (fsRes.indexed > 0) {
            vectorsIndexedThisRun += fsRes.indexed;
            activeEmbedBackend = emb.activeBackendMode;
            if (vectorsIndexedThisRun - lastLoggedMilestone >= 400) {
              lastLoggedMilestone = vectorsIndexedThisRun;
              console.log(`  [GPU Vectors] +${vectorsIndexedThisRun} newly indexed (${Math.round((Date.now() - startedAt) / 1000)}s, backend=${activeEmbedBackend})`);
            }
          }

          const batchSize = useVulkan ? 24 : 16;
          const pBatch = selectPendingPassages.all(modelId, batchSize);
          if (pBatch.length > 0) {
            const texts = pBatch.map(r => `作品：${r.work_title} · ${r.volume_title}${r.chapter_title ? ' · ' + r.chapter_title : ''}\n正文片段：${r.text}`.slice(0, 1800));
            const vecs = await searchEngine.encode(texts, undefined, false);
            activeEmbedBackend = emb.activeBackendMode;
            store.transaction(() => {
              pBatch.forEach((row, idx) => {
                const vec = vecs[idx];
                writePassageVec.run(row.id, modelId, vec.length, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
              });
            });
            vectorsIndexedThisRun += pBatch.length;
            continue;
          }

          if (embedFinishedAllStages) {
            const finalFs = await searchEngine.prepare({ includePassages: false, batchSize: 12 });
            vectorsIndexedThisRun += finalFs.indexed;
            if (finalFs.indexed > 0) activeEmbedBackend = emb.activeBackendMode;
            const finalPass = selectPendingPassages.all(modelId, 1);
            if (finalFs.indexed === 0 && finalPass.length === 0) break;
            continue;
          }
        } catch (embErr) {
          consecutiveEmbedErrors += 1;
          console.warn(`  [GPU Embed Retry #${consecutiveEmbedErrors}] ${embErr.message}`);
          if (embedFinishedAllStages && consecutiveEmbedErrors >= 8) {
            errorsLog.push({ stage: 'embedding', error: embErr.message, at: new Date().toISOString(), resolved: false });
            break;
          }
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        await new Promise(resolve => {
          wakeEmbedResolve = resolve;
          setTimeout(resolve, 3500).unref?.();
        });
      }
      console.log(`[GPU Embedding Complete] Total newly indexed vectors=${vectorsIndexedThisRun} (backend=${activeEmbedBackend || 'gpu'})`);
    } finally {
      await emb.close();
    }
  })();

  // Stage B setup: Full-Coverage Dossier Synthesis Queue & Worker
  const synthQueue = [];
  let synthAllEnqueued = false;
  let wakeSynthResolve = null;
  const wakeSynthesizer = () => {
    if (wakeSynthResolve) {
      const fn = wakeSynthResolve;
      wakeSynthResolve = null;
      fn();
    }
  };

  for (const b of books) {
    if (b.remainingVols === 0 && !b.synthesized) synthQueue.push(b);
  }

  const runSynthesisCall = async (client, workTitle, compactObs, focusType, allowEmpty = false) => {
    let lastErr = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (quotaHalted) throw new Error('Quota halted');
      try {
        const prompt = buildDossierSynthesisPrompt(workTitle, compactObs, focusType, attempt >= 2);
        const { text, usage } = await client.promptText(prompt, { timeoutMs: 360_000 });
        runUsage.calls += 1;
        mergeUsage(runUsage, usage);
        const parsed = parseLooseJson(text);
        if (!Array.isArray(parsed.dossiers) || (!allowEmpty && parsed.dossiers.length === 0)) {
          throw new Error(`Dossier synthesis (${focusType}) returned empty dossiers`);
        }
        return { dossiers: parsed.dossiers, usage };
      } catch (err) {
        lastErr = err;
        const canContinue = await handlePotentialQuotaPause(err);
        if (!canContinue) break;
        console.warn(`  [Synth Retry ${attempt}/4] ${workTitle} (${focusType}): ${err.message}`);
        if (attempt < 4) await new Promise(r => setTimeout(r, 4000 * attempt));
      }
    }
    if (allowEmpty) {
      console.warn(`  [Synth Empty Fallback] ${workTitle} (${focusType}) Proceeding with 0 ${focusType} dossiers.`);
      return { dossiers: [], usage: null };
    }
    throw lastErr;
  };

  const synthPromise = (async () => {
    const synthClient = new AgyFlashClient();
    try {
      while (true) {
        if (quotaHalted) break;
        const book = synthQueue.shift();
        if (!book) {
          if (synthAllEnqueued) break;
          await new Promise(resolve => {
            wakeSynthResolve = resolve;
            setTimeout(resolve, 2500).unref?.();
          });
          continue;
        }

        try {
          const tSynth = Date.now();
          const volumeExtractions = book.volumes.map(ve => {
            const cached = JSON.parse(readFileSync(ve.cachePath, 'utf8'));
            return { volume_id: ve.volumeId, title: ve.title, observations: cached.observations ?? [] };
          });

          let mergedDossiers = [];
          const combinedUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, thoughtTokens: 0, totalTokens: 0 };

          if (volumeExtractions.length > 5) {
            const charCompact = volumeExtractions
              .map(ve => ({ volume_id: ve.volume_id, volume_title: ve.title, observations: ve.observations.filter(o => o.entity_type !== 'world_rule') }))
              .filter(v => v.observations.length > 0);
            const ruleCompact = volumeExtractions
              .map(ve => ({ volume_id: ve.volume_id, volume_title: ve.title, observations: ve.observations.filter(o => o.entity_type === 'world_rule') }))
              .filter(v => v.observations.length > 0);

            const charPart = await runSynthesisCall(synthClient, book.title, charCompact, 'character', false);
            const rulePart = ruleCompact.length > 0
              ? await runSynthesisCall(synthClient, book.title, ruleCompact, 'world_rule', true)
              : { dossiers: [], usage: null };

            if (charPart.usage) { combinedUsage.calls += 1; mergeUsage(combinedUsage, charPart.usage); }
            if (rulePart.usage) { combinedUsage.calls += 1; mergeUsage(combinedUsage, rulePart.usage); }
            mergedDossiers = [
              ...charPart.dossiers.map(d => ({ ...d, entity_type: 'character' })),
              ...rulePart.dossiers.map(d => ({ ...d, entity_type: 'world_rule' }))
            ];
          } else {
            const compactObs = volumeExtractions.filter(v => v.observations.length > 0);
            const part = await runSynthesisCall(synthClient, book.title, compactObs, 'all', false);
            if (part.usage) { combinedUsage.calls += 1; mergeUsage(combinedUsage, part.usage); }
            mergedDossiers = part.dossiers;
          }

          const dossiersData = {
            work_id: book.workId,
            work_title: book.title,
            volumeCount: book.totalVolumes,
            fullCoverage: true,
            synthesizedAt: new Date().toISOString(),
            elapsedMs: Date.now() - tSynth,
            usage: combinedUsage,
            dossiers: mergedDossiers
          };
          writeFileSync(book.dossierCachePath, JSON.stringify(dossiersData, null, 2));
          const stats = store.replaceWorkDossiers(book.workId, mergedDossiers);
          book.synthesized = true;
          book.completedAt = new Date().toISOString();
          for (const e of errorsLog) {
            if (e.stage === 'synthesis' && e.workId === book.workId) e.resolved = true;
          }
          wakeEmbedder();

          const doneBooksCount = books.filter(b => b.remainingVols === 0 && b.synthesized).length;
          console.log(`  [Book Complete ${doneBooksCount}/${books.length}] 《${book.title}》: ${stats.dossierCount} dossiers (${stats.facetCount} facets) in ${Math.round((Date.now() - tSynth) / 1000)}s`);
          writeProgressCheckpoint('running');
        } catch (err) {
          errorsLog.push({ stage: 'synthesis', workId: book.workId, title: book.title, error: err.message, at: new Date().toISOString(), resolved: false });
          console.error(`  [Synthesis Failed] 《${book.title}》: ${err.message}`);
          writeProgressCheckpoint('running');
        }
      }
    } finally {
      synthClient.close();
    }
  })();

  // Stage A: Segmented Continuation & Full-Coverage Volume Extraction Pool
  const bookByWorkId = new Map(books.map(b => [b.workId, b]));
  const volumeQueue = [];
  for (const b of books) {
    for (const v of b.volumes) {
      if (!v.done) volumeQueue.push(v);
    }
  }

  console.log(`\n=== Phase 2: Continuing/Splitting ${volumeQueue.length} Volumes to 100% Coverage (concurrency=${concurrency}, <=148KB/seg, GPU overlapped) ===`);

  let completedVolsSinceCheckpoint = 0;

  const extractOrContinueVolume = async (volEntry, laneClient, maxSegAttempts = 4) => {
    const tVolStart = Date.now();
    const resultJson = loadSampleJson(volEntry.workId);
    const volObj = resultJson.volumes.find(v => v.volume_id === volEntry.volumeId);
    const { totalBlocks, items, storyItems } = collectVolumeTextItems(volObj, resultJson.structures);

    // Load any existing prefix already extracted on disk so we continue right after coveredUpTo!
    let scenes = [];
    let observations = [];
    let continuedSegments = 0;
    let totalUsage = { inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, thoughtTokens: 0, totalTokens: 0 };

    if (existsSync(volEntry.cachePath)) {
      try {
        const cached = JSON.parse(readFileSync(volEntry.cachePath, 'utf8'));
        if (Array.isArray(cached.scenes)) scenes = cached.scenes;
        if (Array.isArray(cached.observations)) observations = cached.observations;
        continuedSegments = cached.continuedSegments ?? 0;
        if (cached.usage) mergeUsage(totalUsage, cached.usage);
      } catch {}
    }

    let coveredUpTo = scenes.length > 0 ? Math.max(...scenes.map(s => Number(s.end_p) || 0)) : 0;
    let safetySegLoop = 0;

    while (!isTailFullyCovered(storyItems, coveredUpTo)) {
      if (quotaHalted) throw new Error('Quota halted');
      if (++safetySegLoop > 12) break;

      const remItems = items.filter(it => it.ord > coveredUpTo);
      if (remItems.length === 0) break;

      let segSuccess = false;
      let lastErr = null;

      for (let attempt = 1; attempt <= maxSegAttempts; attempt++) {
        if (quotaHalted) throw new Error('Quota halted');
        // On retry >= 2, halve segment size to 74 KB so long streams or dense battle chapters pass effortlessly
        const segBudgetBytes = attempt >= 2 ? FALLBACK_HALF_BYTES : MAX_SEGMENT_BYTES;
        const segItems = takeNextSegment(remItems, segBudgetBytes);
        const segStart = segItems[0].ord;
        const segEnd = segItems.at(-1).ord;
        const segStoryCount = segItems.filter(it => !it.isAfterword).length;
        const isLastSlice = segEnd === items.at(-1).ord;
        const minSegScenes = minScenesForSegment(segStoryCount, isLastSlice);

        try {
          const prevLastScene = scenes.length > 0 ? scenes.at(-1) : null;
          const prompt = buildSegmentExtractionPrompt({
            workTitle: volEntry.workTitle,
            volume: volObj,
            segItems,
            totalBlocks,
            prevLastScene,
            strictRetry: attempt >= 2
          });

          const { text, usage } = await laneClient.promptText(prompt, { timeoutMs: 360_000 });
          runUsage.calls += 1;
          mergeUsage(runUsage, usage);
          mergeUsage(totalUsage, usage);

          const parsed = parseLooseJson(text);
          if (!Array.isArray(parsed.scenes) || parsed.scenes.length < minSegScenes) {
            throw new Error(`Too few scenes in segment [${segStart}..${segEnd}] (${parsed?.scenes?.length ?? 0} < ${minSegScenes})`);
          }

          scenes = normalizeAndMergeScenes(scenes, parsed.scenes, segStart, segEnd, totalBlocks);
          if (Array.isArray(parsed.observations) && parsed.observations.length > 0) {
            for (const o of parsed.observations) {
              if (!o || typeof o !== 'object') continue;
              let sp = Math.max(1, Math.min(totalBlocks, Number(o.start_p) || segStart));
              let ep = Math.max(sp, Math.min(totalBlocks, Number(o.end_p) || sp));
              observations.push({ ...o, start_p: sp, end_p: ep });
            }
          }

          const newMaxEnd = scenes.length > 0 ? Math.max(...scenes.map(s => Number(s.end_p) || 0)) : segEnd;
          // Ensure forward cursor always advances at least through the extracted segment if tail had only minor epilogue/afterword
          coveredUpTo = Math.max(coveredUpTo + 1, newMaxEnd, isLastSlice && segStoryCount < 140 ? segEnd : newMaxEnd);
          // If the model covered >= 88% of this segment's range, advance cursor to segEnd so we don't re-feed trailing 15 lines of chapter transition
          if (segEnd - coveredUpTo <= 55 || (coveredUpTo - segStart) >= (segEnd - segStart) * 0.88) {
            coveredUpTo = Math.max(coveredUpTo, segEnd);
          }

          continuedSegments += 1;
          const nowFull = isTailFullyCovered(storyItems, coveredUpTo);

          // Persist intermediate progress immediately after EVERY segment so 0 work is ever lost!
          writeFileSync(volEntry.cachePath, JSON.stringify({
            volume_id: volEntry.volumeId,
            revision_id: volEntry.revisionId,
            title: volEntry.title,
            fullCoverage: nowFull,
            coveredUpTo,
            totalBlocks,
            continuedSegments,
            extractedAt: new Date().toISOString(),
            elapsedMs: Date.now() - tVolStart,
            usage: totalUsage,
            scenes,
            observations
          }, null, 2));
          store.replaceVolumeScenes(volEntry.workId, volEntry.volumeId, volEntry.revisionId, scenes);
          wakeEmbedder();

          segSuccess = true;
          break;
        } catch (err) {
          lastErr = err;
          const canContinue = await handlePotentialQuotaPause(err);
          if (!canContinue) break;
          console.warn(`  [Seg Retry ${attempt}/${maxSegAttempts}] 《${volEntry.workTitle}》 ${volEntry.title} [${segStart}..${segEnd}]: ${err.message}`);
          if (attempt < maxSegAttempts) await new Promise(r => setTimeout(r, 3500 * attempt));
        }
      }

      if (!segSuccess) {
        throw lastErr ?? new Error('Segment extraction failed');
      }
    }

    // Mark volume 100% complete
    writeFileSync(volEntry.cachePath, JSON.stringify({
      volume_id: volEntry.volumeId,
      revision_id: volEntry.revisionId,
      title: volEntry.title,
      fullCoverage: true,
      coveredUpTo: Math.max(coveredUpTo, volEntry.lastStoryOrd),
      totalBlocks,
      continuedSegments,
      extractedAt: new Date().toISOString(),
      elapsedMs: Date.now() - tVolStart,
      usage: totalUsage,
      scenes,
      observations
    }, null, 2));
    const written = store.replaceVolumeScenes(volEntry.workId, volEntry.volumeId, volEntry.revisionId, scenes);

    volEntry.done = true;
    for (const e of errorsLog) {
      if (e.stage === 'volume' && e.volumeId === volEntry.volumeId) e.resolved = true;
    }
    const parentBook = bookByWorkId.get(volEntry.workId);
    parentBook.remainingVols = Math.max(0, parentBook.remainingVols - 1);
    wakeEmbedder();

    console.log(`  [Full-Vol OK] 《${volEntry.workTitle}》 ${volEntry.title}: ${written} scenes (to p${coveredUpTo}/${totalBlocks}), ${observations.length} obs in ${Math.round((Date.now() - tVolStart) / 1000)}s (rem=${parentBook.remainingVols})`);

    completedVolsSinceCheckpoint += 1;
    if (completedVolsSinceCheckpoint >= 4) {
      completedVolsSinceCheckpoint = 0;
      writeProgressCheckpoint('running');
    }
    if (parentBook.remainingVols === 0 && parentBook.failedVols.length === 0 && !parentBook.synthesized) {
      synthQueue.push(parentBook);
      wakeSynthesizer();
    }
    return true;
  };

  let volCursor = 0;
  const runVolumeLanes = async (queueItems, laneCount, maxAttempts) => {
    volCursor = 0;
    const workers = Array.from({ length: Math.min(laneCount, Math.max(1, queueItems.length)) }, async (_, laneIdx) => {
      if (queueItems.length === 0) return;
      if (laneIdx > 0) await new Promise(r => setTimeout(r, laneIdx * 2500));
      const laneClient = new AgyFlashClient();
      try {
        while (!quotaHalted) {
          const idx = volCursor++;
          if (idx >= queueItems.length) break;
          const volEntry = queueItems[idx];
          try {
            await extractOrContinueVolume(volEntry, laneClient, maxAttempts);
          } catch (err) {
            if (!quotaHalted) {
              const parentBook = bookByWorkId.get(volEntry.workId);
              parentBook.failedVols.push(volEntry.volumeId);
              errorsLog.push({
                stage: 'volume',
                workId: volEntry.workId,
                title: `${volEntry.workTitle} · ${volEntry.title}`,
                volumeId: volEntry.volumeId,
                error: err.message,
                at: new Date().toISOString(),
                resolved: false
              });
              console.error(`  [Volume Deferred] 《${volEntry.workTitle}》 ${volEntry.title}: ${err.message}`);
              writeProgressCheckpoint('running');
              await new Promise(r => setTimeout(r, 3000));
            }
          }
        }
      } finally {
        laneClient.close();
      }
    });
    await Promise.all(workers);
  };

  await runVolumeLanes(volumeQueue, concurrency, 4);

  // Final cleanup retry pass for any transiently deferred volumes (if quota not halted)
  if (!quotaHalted) {
    const retryVolumes = [];
    for (const b of books) {
      if (b.failedVols.length > 0) {
        b.failedVols = [];
        for (const v of b.volumes) {
          if (!v.done) retryVolumes.push(v);
        }
      }
    }
    if (retryVolumes.length > 0) {
      console.log(`\n=== Cleanup Retry Pass: Retrying ${retryVolumes.length} deferred volumes at concurrency=3 ===`);
      await runVolumeLanes(retryVolumes, 3, 4);
    }
  }

  // Also retry any failed synthesis once if needed
  if (!quotaHalted) {
    for (const b of books) {
      if (b.remainingVols === 0 && !b.synthesized && !synthQueue.includes(b)) {
        synthQueue.push(b);
      }
    }
  }

  // Signal synthesis worker that no more books will enter synthQueue, and wait for synthesis to finish
  synthAllEnqueued = true;
  wakeSynthesizer();
  await synthPromise;

  // Signal GPU embedding worker that all facets/scenes/passages are in DB, and wait for 100% vector drain
  embedFinishedAllStages = true;
  wakeEmbedder();
  await embedPromise;

  try {
    await captureAntigravityUsage({
      executable: agyExecutable,
      filename: join(reportsRoot, 'quota-after-full-library.json'),
      cwd: workerCwd
    });
  } catch (e) {
    console.warn('[Quota After Warning]', e.message);
  }

  const finalSummary = writeProgressCheckpoint(quotaHalted ? 'paused_quota' : 'completed');
  store.close();

  console.log('\n=== KB v2 Full Library Untruncated Split & GPU Index Summary ===');
  console.log(JSON.stringify({
    status: finalSummary.status,
    elapsedSeconds: finalSummary.elapsedSeconds,
    completedBooks: `${finalSummary.completedBooks}/${finalSummary.totalBooks}`,
    completedVolumes: `${finalSummary.completedVolumes}/${finalSummary.totalVolumes}`,
    vectorsIndexedThisRun: finalSummary.vectorsIndexedThisRun,
    dbStats: finalSummary.dbStats,
    errorsCount: finalSummary.errors.length
  }, null, 2));
}

main().catch(err => {
  console.error('Fatal error in split-all-library-v2:', err);
  process.exitCode = 1;
});
