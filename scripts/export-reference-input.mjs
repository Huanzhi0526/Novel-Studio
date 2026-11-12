import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { paragraphId } from '../app/main/protocol.mjs';
import { categoryLabels } from '../app/main/search-text.mjs';
import { databaseVersion } from '../app/main/store.mjs';

const [mode, filename, workId, out, ...selection] = process.argv.slice(2);
if (!filename || !['list', 'export'].includes(mode) ||
    (mode === 'list' && out) || (mode === 'export' && (!workId || !out || !selection.length))) {
  throw new Error('用法：export-reference-input.mjs list <library.sqlite> [work_id] 或 export <library.sqlite> <work_id> <新目录> <volume_id[@revision_id]> ...');
}

const dbUrl = pathToFileURL(realpathSync(filename));
dbUrl.searchParams.set('mode', 'ro');
const db = new DatabaseSync(dbUrl.href, { readOnly: true });
const extensions = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']]);
const sha256 = data => createHash('sha256').update(data).digest('hex');

try {
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000; BEGIN');
  if (db.prepare('PRAGMA user_version').get().user_version !== databaseVersion) {
    throw new Error('不支持的资料库版本');
  }
  if (mode === 'list' && !workId) {
    const works = db.prepare(`
      SELECT w.work_id, w.title, w.deleted IS NOT NULL AS archived, count(v.volume_id) AS volumes
      FROM reference_works w LEFT JOIN reference_volumes v USING(work_id)
      GROUP BY w.work_id ORDER BY w.deleted IS NOT NULL, w.title, w.work_id
    `).all();
    console.log(JSON.stringify(works, null, 2));
  } else {
    const work = db.prepare('SELECT work_id, title FROM reference_works WHERE work_id=?').get(workId);
    if (!work) throw new Error('指定作品不在参考库中');
    const revisions = db.prepare(`
      SELECT v.volume_id, v.title, r.revision_id, r.count
      FROM reference_volumes v JOIN reference_revisions r USING(volume_id)
      WHERE v.work_id=? ORDER BY v.title, v.volume_id, r.imported DESC, r.revision_id
    `).all(workId);
    if (mode === 'list') {
      console.log(JSON.stringify({ work, revisions }, null, 2));
    } else {
      exportWork(work, revisions);
    }
  }
} finally {
  db.close();
}

function exportWork(work, revisions) {
  const blockRows = db.prepare(`
    SELECT ordinal,kind,text,asset_sha256,note_target FROM reference_blocks
    WHERE volume_id=? AND revision_id=? ORDER BY ordinal
  `);
  const structureRows = db.prepare(`
    SELECT structure_id,volume_id,revision_id,parent_id,type,title,start,end FROM reference_structures
    WHERE volume_id=? AND revision_id=? ORDER BY start,end DESC,structure_id
  `);
  const selectedVolumes = new Set();
  const assets = new Set();
  const structures = [];
  const issues = ['同版正文输入，待按派工范围阅读与制卡。'];
  const volumes = selection.map(item => {
    const [volumeId, requestedRevision, ...extra] = item.split('@');
    const revision = revisions.find(row => row.volume_id === volumeId &&
      (requestedRevision === undefined || row.revision_id === requestedRevision));
    if (!revision || extra.length || selectedVolumes.has(volumeId)) throw new Error('卷或版本不存在或重复：' + item);
    selectedVolumes.add(volumeId);
    const { volume_id, title, revision_id, count } = revision;
    const rows = blockRows.all(volume_id, revision_id);
    if (rows.length !== count || rows.some((row, i) => row.ordinal !== i + 1)) throw new Error('正文段号不连续：' + item);
    const blocks = rows.map(({ kind, text, asset_sha256, note_target }) => {
      if (asset_sha256) assets.add(asset_sha256);
      return { kind, text, asset_sha256, note_target };
    });
    const normalized_payload = { volume_id, blocks };
    if (sha256(JSON.stringify(normalized_payload)) !== revision_id) throw new Error('正文摘要不符：' + item);
    structures.push(...structureRows.all(volume_id, revision_id).map(({ start, end, ...row }) => ({
      ...row, start: paragraphId(start), end: paragraphId(end)
    })));
    return { volume_id, title, revision_id, normalized_payload };
  });
  const getAsset = db.prepare('SELECT media_type,body FROM reference_assets WHERE work_id=? AND hash=?');
  const files = [...assets].sort().map(hash => {
    const asset = getAsset.get(work.work_id, hash);
    const extension = extensions.get(asset?.media_type);
    if (!extension || sha256(asset.body) !== hash) throw new Error('插图缺失、类型未知或摘要不符：' + hash);
    return { path: 'assets/' + hash + '.' + extension, sha256: hash, purpose: 'image', body: asset.body };
  });
  const result = {
    schema_version: 'draft-0.1', package_id: randomUUID(), work, volumes, structures, cards: [],
    report: { processed_ranges: [], category_status: Object.fromEntries(Object.keys(categoryLabels).map(key => [key, 'not_processed'])), issues },
    resources: files.map(({ body, ...resource }) => resource)
  };
  mkdirSync(out);
  if (files.length) mkdirSync(join(out, 'assets'));
  for (const file of files) writeFileSync(join(out, file.path), file.body, { flag: 'wx' });
  writeFileSync(join(out, 'result.json'), JSON.stringify(result), { flag: 'wx' });
  console.log(JSON.stringify({ work_id: work.work_id, volumes: volumes.length, blocks: volumes.reduce((n, vol) => n + vol.normalized_payload.blocks.length, 0), resources: files.length, cards: 0, out }));
}
