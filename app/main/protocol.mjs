import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yauzl from 'yauzl';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schemaPath = fileURLToPath(new URL('../../拆书规范包/schema/result.schema.json', import.meta.url));
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateResult = ajv.compile(schema);
const validateCardShape = ajv.compile(schema.properties.cards.items);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const uuidRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ENTRIES = 10000, MAX_TOTAL = 512 * 1024 * 1024, MAX_JSON = 32 * 1024 * 1024;

function fail(code, message, details) { const e = new Error(message); e.code = code; if (details !== undefined) e.details = details; throw e; }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function paragraphId(index) {
  if (!Number.isSafeInteger(index) || index < 1) throw new RangeError('index must be a positive 1-based integer');
  return `p${String(index).padStart(6, '0')}`;
}
export function paragraphNumber(id) {
  if (typeof id !== 'string' || !/^p(?:0[0-9]{5}|[1-9][0-9]{5,})$/.test(id)) return NaN;
  const n = Number(id.slice(1));
  return Number.isSafeInteger(n) && n > 0 && paragraphId(n) === id ? n : NaN;
}
function payloadDigest(payload) {
  const ordered = { volume_id: payload.volume_id, blocks: payload.blocks.map(b => ({ kind: b.kind, text: b.text, asset_sha256: b.asset_sha256, note_target: b.note_target })) };
  return sha256(JSON.stringify(ordered));
}
function rangeCheck(range, volumeMap, workId, lookup, context) {
  const local = volumeMap.get(range.volume_id);
  const revision = local?.revision_id === range.revision_id ? local : lookup.revision?.(workId, range.volume_id, range.revision_id);
  const count = revision?.count;
  if (!count) fail('REFERENCE_MISSING', `${context} 引用了不存在的分卷版本`, { context, volume_id: range.volume_id, revision_id: range.revision_id });
  const start = paragraphNumber(range.start), end = paragraphNumber(range.end);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end > count) fail('RANGE_INVALID', `${context} has an invalid paragraph range`, { context, start: range.start, end: range.end, paragraph_count: count });
  return { start, end, count };
}
function validateSemantics(result, lookup, warnings) {
  const workId = result.work.work_id, volumes = new Map();
  for (const v of result.volumes) {
    if (volumes.has(v.volume_id)) fail('DUPLICATE_ID', 'Duplicate volume_id in package', { volume_id: v.volume_id });
    const owner = lookup.volumeOwner?.(v.volume_id);
    if (owner !== undefined && owner !== workId) fail('IDENTITY_CONFLICT', 'volume_id belongs to another work', { volume_id: v.volume_id, expected_work_id: workId, actual_work_id: owner });
    if (v.normalized_payload.volume_id !== v.volume_id) fail('IDENTITY_MISMATCH', 'normalized_payload.volume_id does not match volume_id', { volume_id: v.volume_id });
    if (payloadDigest(v.normalized_payload) !== v.revision_id) fail('REVISION_MISMATCH', 'Volume revision_id does not match normalized_payload', { volume_id: v.volume_id });
    const blocks = v.normalized_payload.blocks;
    blocks.forEach((b, i) => {
      if (b.kind === 'text' && b.text.length === 0) fail('BLOCK_INVALID', 'Text blocks must not be empty', { volume_id: v.volume_id, paragraph_id: paragraphId(i + 1) });
      if (b.kind === 'image' && !b.asset_sha256) fail('RESOURCE_REFERENCE', 'Image blocks must reference an image resource SHA-256', { volume_id: v.volume_id, paragraph_id: paragraphId(i + 1) });
      if (!b.text.isWellFormed() || b.text.includes('\0') || b.text.normalize('NFC') !== b.text || b.text.includes('\r')) fail('TEXT_NORMALIZATION', 'Block text must be valid Unicode NFC with LF line endings', { volume_id: v.volume_id, paragraph_id: paragraphId(i + 1) });
      if (b.note_target && (Number.isNaN(paragraphNumber(b.note_target)) || paragraphNumber(b.note_target) > blocks.length)) fail('NOTE_TARGET_INVALID', 'note_target is outside this volume', { volume_id: v.volume_id, note_target: b.note_target });
    });
    volumes.set(v.volume_id, { revision_id: v.revision_id, count: blocks.length });
  }
  const structures = new Map();
  for (const s of result.structures) {
    if (structures.has(s.structure_id)) fail('DUPLICATE_ID', 'Duplicate structure_id', { structure_id: s.structure_id });
    const v = volumes.get(s.volume_id);
    if (!v || v.revision_id !== s.revision_id) fail('REFERENCE_MISSING', 'Structure references a missing volume revision', { structure_id: s.structure_id });
    const { start, end, count } = rangeCheck(s, volumes, workId, lookup, `structure ${s.structure_id}`);
    if (start > end || end > count) fail('RANGE_INVALID', 'Structure range is invalid', { structure_id: s.structure_id });
    structures.set(s.structure_id, { ...s, startN: start, endN: end });
  }
  const children = new Map();
  const checkedParents = new Set();
  const hasIssues = result.report.issues.some(issue => issue.trim());
  for (const s of structures.values()) {
    if (s.type === 'unclassified' && !hasIssues) fail('STRUCTURE_UNCLASSIFIED', '未分类结构需要在处理报告中说明疑点', { structure_id: s.structure_id });
    if (s.parent_id !== null) {
      const p = structures.get(s.parent_id);
      if (!p || p.volume_id !== s.volume_id) fail('PARENT_MISSING', 'Structure parent is missing or belongs to another volume', { structure_id: s.structure_id, parent_id: s.parent_id });
      if (s.startN < p.startN || s.endN > p.endN) fail('PARENT_RANGE', 'Child structure is outside parent range', { structure_id: s.structure_id, parent_id: p.structure_id });
      const key = `${p.structure_id}`; if (!children.has(key)) children.set(key, []); children.get(key).push(s);
    } else {
      const key = `root:${s.volume_id}`; if (!children.has(key)) children.set(key, []); children.get(key).push(s);
    }
  }
  for (const s of structures.values()) {
    const seen = new Set();
    let node = s;
    while (node && !checkedParents.has(node.structure_id)) {
      if (seen.has(node.structure_id)) fail('STRUCTURE_CYCLE', '章节父子关系存在循环', { structure_id: s.structure_id });
      seen.add(node.structure_id);
      node = structures.get(node.parent_id);
    }
    for (const id of seen) checkedParents.add(id);
  }
  for (const [parent, list] of children) { list.sort((a,b) => a.startN-b.startN || a.endN-b.endN); for (let i=1;i<list.length;i++) if (list[i].startN <= list[i-1].endN) fail('SIBLING_OVERLAP', 'Sibling structure ranges overlap', { parent_id: parent, structure_ids: [list[i-1].structure_id,list[i].structure_id] }); }
  for (const v of result.volumes) {
    const nodes = [...structures.values()]
      .filter(s => s.volume_id === v.volume_id && !['volume','scene'].includes(s.type))
      .sort((a, b) => a.startN - b.startN);
    let coveredThrough = 0;
    for (const node of nodes) {
      if (node.startN > coveredThrough + 1) break;
      coveredThrough = Math.max(coveredThrough, node.endN);
    }
    if (coveredThrough < v.normalized_payload.blocks.length) fail('STRUCTURE_COVERAGE', '存在未归属章节或其他有效结构的段落', { volume_id: v.volume_id, first_missing: paragraphId(coveredThrough + 1) });
  }
  const cards = new Map();
  for (const c of result.cards) {
    const prior = cards.get(c.card_id);
    if (prior) { if (canonical(prior) !== canonical(c)) fail('DUPLICATE_ID', 'Conflicting duplicate card_id', { card_id: c.card_id }); warnings.push(`重复且完全相同的卡片 ${c.card_id} 将按一张处理。`); continue; }
    c.evidence.forEach((r,i) => rangeCheck(r, volumes, workId, lookup, `card ${c.card_id} evidence ${i+1}`));
    cards.set(c.card_id,c);
  }
  for (const c of cards.values()) for (const id of c.related_card_ids ?? []) if (!cards.has(id) && !lookup.card?.(workId,id)) warnings.push(`卡片 ${c.card_id} 关联的卡片 ${id} 不在本包或当前作品中。`);
  result.cards = [...cards.values()];
  result.report.processed_ranges.forEach((r,i) => rangeCheck(r, volumes, workId, lookup, `processed_ranges[${i}]`));
  for (const [category,status] of Object.entries(result.report.category_status)) {
    const n = [...cards.values()].filter(c => c.category === category).length;
    if (status === 'extracted' && !n) warnings.push(`分类 ${category} 标记为 extracted，但没有对应卡片。`);
    if (status !== 'extracted' && n) warnings.push(`分类 ${category} 有 ${n} 张卡片，但状态为 ${status}。`);
    if (status === 'absent' && result.report.processed_ranges.length === 0) warnings.push(`分类 ${category} 标记 absent，但没有声明已处理范围。`);
  }
}
function openZip(file) { return new Promise((resolve,reject) => yauzl.open(file,{lazyEntries:true,strictFileNames:true,validateEntrySizes:true},(e,z) => e ? reject(e) : resolve(z))); }
function safePath(name) {
  const normalized = name.endsWith('/') ? name.slice(0, -1) : name;
  if (!normalized || /[\\:\x00-\x1f]/u.test(name) || name.startsWith('/') ||
    normalized.split('/').some(part => !part || /[. ]$/.test(part))) return false;
  if (name.endsWith('/')) return normalized === 'assets' || normalized === 'source';
  return name === 'result.json' || name.startsWith('assets/') || name.startsWith('source/');
}
async function readEntry(zip, entry, cap, signal) {
  return new Promise((resolve,reject) => {
    zip.openReadStream(entry,(err,stream) => {
      if (err) return reject(err); const chunks=[]; let size=0;
      const abort = () => stream.destroy(signal.reason instanceof Error ? signal.reason : new Error('导入已取消'));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      stream.on('data',c => { size+=c.length; if(size>cap) { stream.destroy(new Error('entry size limit exceeded')); return; } chunks.push(c); });
      stream.on('error',reject); stream.on('end',() => resolve(Buffer.concat(chunks)));
      stream.on('close', () => signal?.removeEventListener('abort', abort));
    });
  });
}
function allowedResource(pathname,purpose) {
  const ext = path.posix.extname(pathname).toLowerCase();
  return purpose === 'image' ? pathname.startsWith('assets/') && ['.png','.jpg','.jpeg','.webp'].includes(ext) : pathname.startsWith('source/') && ['.txt','.epub'].includes(ext);
}

function validResourceBytes(resource, bytes) {
  const extension = path.posix.extname(resource.path).toLowerCase();
  if (extension === '.png') return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (['.jpg', '.jpeg'].includes(extension)) return bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  if (extension === '.webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (extension === '.epub') return bytes.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'));
  return bytes.length > 0 && bytes.toString('ascii', 0, 2) !== 'MZ';
}

export async function readResultPackage(filePath, lookup = {}, { signal } = {}) {
  signal?.throwIfAborted();
  const zip = await openZip(filePath), files = new Map(); let total=0, count=0;
  try {
    await new Promise((resolve,reject) => {
      zip.on('error',reject);
      zip.on('entry', async entry => {
        try {
          signal?.throwIfAborted();
          if (++count > MAX_ENTRIES) fail('ZIP_LIMIT','ZIP has too many entries');
          if (!safePath(entry.fileName)) fail('ZIP_PATH','ZIP contains an unsafe or unsupported path',{path:entry.fileName});
          const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
          const kind = mode & 0xf000;
          if (kind && kind !== 0x8000 && !(kind === 0x4000 && entry.fileName.endsWith('/'))) fail('ZIP_SPECIAL','ZIP 仅允许普通文件和目录',{path:entry.fileName});
          if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
          if (files.has(entry.fileName)) fail('ZIP_DUPLICATE','ZIP contains duplicate paths',{path:entry.fileName});
          const cap = entry.fileName === 'result.json' ? MAX_JSON : MAX_TOTAL - total;
          if (entry.uncompressedSize > cap || total + entry.uncompressedSize > MAX_TOTAL) fail('ZIP_LIMIT', 'ZIP 解压大小超限');
          if (entry.fileName !== 'result.json' && !['image', 'source'].some(purpose => allowedResource(entry.fileName, purpose))) fail('RESOURCE_TYPE', 'ZIP 包含不支持的文件类型', { path: entry.fileName });
          const b = await readEntry(zip,entry,cap,signal);
          total += b.length; if(total>MAX_TOTAL) fail('ZIP_LIMIT','ZIP expanded size exceeds limit');
          files.set(entry.fileName,b); zip.readEntry();
        } catch(e) { reject(e); }
      });
      zip.on('end',resolve); zip.readEntry();
    });
  } finally { zip.close(); }
  signal?.throwIfAborted();
  const jsonBytes = files.get('result.json'); if (!jsonBytes) fail('PACKAGE_FILE_MISSING','Missing result.json');
  let result; try { result=JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes)); } catch { fail('JSON_INVALID','result.json 不是有效的 UTF-8 JSON'); }
  if (!validateResult(result)) fail('SCHEMA_INVALID','result.json does not match draft-0.1 schema',validateResult.errors?.map(e=>({path:e.instancePath,keyword:e.keyword,message:e.message})));
  const declared = new Map();
  for (const res of result.resources) {
    if (!safePath(res.path) || res.path === 'result.json') fail('RESOURCE_PATH','Resource path is unsafe',{path:res.path});
    if (declared.has(res.path)) fail('RESOURCE_DUPLICATE','Resource path is declared more than once',{path:res.path});
    if (!allowedResource(res.path,res.purpose)) fail('RESOURCE_TYPE','Resource path or extension does not match purpose',{path:res.path,purpose:res.purpose});
    declared.set(res.path,res);
  }
  for (const pathname of files.keys()) if (pathname !== 'result.json' && !declared.has(pathname)) fail('RESOURCE_UNDECLARED','ZIP contains an undeclared file',{path:pathname});
  const assets = new Map();
  for (const [pathname,res] of declared) {
    const b=files.get(pathname); if (!b) fail('RESOURCE_MISSING','Declared resource is missing',{path:pathname});
    if (sha256(b)!==res.sha256) fail('RESOURCE_HASH','Resource SHA-256 mismatch',{path:pathname});
    if (!validResourceBytes(res,b)) fail('RESOURCE_TYPE','资源内容与声明格式不符',{path:pathname});
    assets.set(pathname,b);
  }
  const assetHashes = new Set([...declared.values()].filter(r=>r.purpose==='image').map(r=>r.sha256));
  for (const v of result.volumes) for (const [i,b] of v.normalized_payload.blocks.entries()) if (b.asset_sha256 && !assetHashes.has(b.asset_sha256)) fail('RESOURCE_REFERENCE','Image block references an undeclared asset hash',{volume_id:v.volume_id,paragraph_id:paragraphId(i+1),sha256:b.asset_sha256});
  const warnings=[]; validateSemantics(result,lookup,warnings);
  // Stable logical fingerprint: sorted-key compact JSON plus sorted path/hash pairs; ZIP metadata and compression are excluded.
  const digest=sha256(`${canonical(result)}\n${[...declared.keys()].sort().map(p=>`${p}\0${declared.get(p).sha256}`).join('\n')}`);
  return {result,digest,assets,warnings};
}

export function validateCard(card, workId, lookup = {}) {
  const warnings=[];
  if (!validateCardShape(card)) fail('CARD_SCHEMA_INVALID','卡片字段与 draft-0.1 不符',validateCardShape.errors?.map(e=>({path:e.instancePath,message:e.message})));
  if (!uuidRE.test(workId)) fail('CARD_WORK_INVALID','workId must be a UUID');
  const volumes=new Map();
  for (const evidence of card.evidence) rangeCheck(evidence,volumes,workId,lookup,`card ${card.card_id} evidence`);
  for (const id of card.related_card_ids ?? []) if (!lookup.card?.(workId,id)) warnings.push(`关联卡片 ${id} 不存在或不可用。`);
  return {card,warnings};
}
