import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { paragraphId, validateCard } from '../app/main/protocol.mjs';

const [dbPath, reportPath] = process.argv.slice(2);
if (!dbPath || !reportPath) throw new Error('Usage: node scripts/audit-reference-cards.mjs <library.sqlite> <report.json>');
const database = resolve(dbPath);
const output = resolve(reportPath);
if (output === database || !output.endsWith('.json')) throw new Error('The report must be a separate JSON file');
const db = new DatabaseSync(database, { readOnly: true });

function histogram(records, key) {
  return Object.fromEntries(Object.entries(Object.groupBy(records, key)).map(([label, rows]) => [label, rows.length]));
}

function normalize(text) {
  return text.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu, '').toLowerCase();
}

function measure(rows) {
  if (!rows.length) return { count: 0 };
  const lengths = rows.map(row => row.contentChars).sort((a, b) => a - b);
  return {
    count: rows.length,
    charsMin: lengths[0],
    charsP50: lengths[Math.floor(lengths.length / 2)],
    charsP95: lengths[Math.floor(lengths.length * .95)],
    charsMax: lengths.at(-1),
    charsMean: Number((lengths.reduce((a, b) => a + b) / lengths.length).toFixed(1)),
    below100: lengths.filter(n => n < 100).length,
    below150: lengths.filter(n => n < 150).length,
    evidence: rows.reduce((sum, row) => sum + row.evidence.length, 0),
    oneSpan: rows.filter(row => row.evidence.length === 1).length,
    crossVolume: rows.filter(row => new Set(row.evidence.map(e => e.volume_id)).size > 1).length,
    elevatedRevision: rows.filter(row => row.revision > 1).length,
    noRelated: rows.filter(row => row.relatedCount === 0).length,
    withoutExplicitStructure: rows.filter(row => !row.hasStructuredHeadings).length,
    structuralErrors: rows.filter(row => row.structuralError != null).length,
  };
}

const all = (sql) => db.prepare(sql).all();
const groupBy = Map.groupBy;
try {
  db.exec('BEGIN');
  const works = all('SELECT work_id,title,deleted IS NOT NULL AS hidden FROM reference_works ORDER BY title');
  const volumes = all('SELECT work_id,volume_id,title FROM reference_volumes ORDER BY work_id,title,volume_id');
  const revisions = all('SELECT volume_id,revision_id,count AS block_count FROM reference_revisions ORDER BY volume_id,revision_id');
  const cards = all('SELECT id,work_id,card_id,category,title,content,claim_type,aliases,related_card_ids,revision FROM reference_cards ORDER BY id');
  const ftsRows = new Set(all('SELECT rowid FROM reference_fts').map(row => row.rowid));
  const evidence = all([
    'SELECT e.*, b0.kind AS start_kind, b1.kind AS end_kind,',
    '(SELECT count(*) FROM reference_blocks b WHERE b.volume_id=e.volume_id AND b.revision_id=e.revision_id',
    'AND b.ordinal BETWEEN e.start AND e.end AND b.kind = \'text\' AND trim(b.text)<>\'\') AS text_blocks,',
    '(SELECT s.title FROM reference_structures s WHERE s.volume_id=e.volume_id AND s.revision_id=e.revision_id',
    'AND s.start<=e.start AND s.end>=e.end AND s.type NOT IN (\'volume\',\'scene\') ORDER BY s.end-s.start LIMIT 1) AS section',
    'FROM reference_evidence e',
    'LEFT JOIN reference_blocks b0 ON b0.volume_id=e.volume_id AND b0.revision_id=e.revision_id AND b0.ordinal=e.start',
    'LEFT JOIN reference_blocks b1 ON b1.volume_id=e.volume_id AND b1.revision_id=e.revision_id AND b1.ordinal=e.end',
    'ORDER BY e.card_row,e.position',
  ].join('\n'));
  const evidenceByCard = groupBy(evidence, row => row.card_row);
  const evidenceByVolume = groupBy(evidence, row => row.volume_id);
  const cardByRow = new Map(cards.map(row => [row.id, row]));
  const cardsByWork = groupBy(cards, row => row.work_id);
  const revisionsByVolume = groupBy(revisions, row => row.volume_id);
  const volumesByWork = groupBy(volumes, row => row.work_id);
  const volumeById = new Map(volumes.map(row => [row.volume_id, row]));
  const cardKeySet = new Set(cards.map(row => row.work_id + '/' + row.card_id));
  const revisionsByKey = new Map(revisions.map(row => [row.volume_id + '/' + row.revision_id, row]));
  const issues = new Map();
  const lookup = {
    volumeOwner: volumeId => volumeById.get(volumeId)?.work_id,
    revision: (workId, volumeId, revisionId) => {
      const volume = volumeById.get(volumeId);
      const revision = revisionsByKey.get(volumeId + '/' + revisionId);
      if (volume?.work_id === workId && revision) return { count: revision.block_count };
    },
    card: (workId, cardId) => cardKeySet.has(workId + '/' + cardId),
  };
  const byCard = cards.map(row => {
    const { id, work_id, card_id, category, title, content, claim_type, revision } = row;
    const aliases = JSON.parse(row.aliases);
    const related_card_ids = JSON.parse(row.related_card_ids);
    const spans = (evidenceByCard.get(id) ?? []).map(({ volume_id, revision_id, start, end, start_kind, end_kind, text_blocks, section }) => ({
      volume_id, revision_id, start: paragraphId(start), end: paragraphId(end), start_kind, end_kind, text_blocks, section,
      blocks: end - start + 1,
    }));
    const sourceRanges = spans.map(({ volume_id, revision_id, start, end }) => ({ volume_id, revision_id, start, end }));
    let structuralError = null;
    let warnings = [];
    try {
      ({ warnings } = validateCard({ card_id, category, title, content, claim_type, aliases, related_card_ids, evidence: sourceRanges }, work_id, lookup));
    } catch (error) {
      structuralError = error.code ?? error.name;
    }
    const flags = [];
    if (revision > 1) flags.push('protect-existing-edit');
    if (Array.from(content.trim()).length < 100) flags.push('thin-under-100');
    if (spans.length === 1) flags.push('single-evidence-span');
    if (spans.some(span => span.text_blocks === 0)) flags.push('nontext-or-empty-evidence');
    if (spans.some(span => span.start_kind == null || span.end_kind == null)) flags.push('missing-evidence-endpoint');
    if (spans.some(span => span.blocks > 30)) flags.push('wide-evidence-over-30');
    if (new Set(sourceRanges.map(range => JSON.stringify(range))).size !== sourceRanges.length) flags.push('duplicate-evidence-span');
    if (warnings.length) flags.push('missing-related-card');
    if (!ftsRows.has(id)) flags.push('missing-fts-row');
    if (category === 'technique' && claim_type === 'fact') flags.push('technique-marked-fact-review');
    if (structuralError) flags.push('protocol-invalid');
    for (const flag of flags) issues.set(flag, (issues.get(flag) ?? 0) + 1);
    return {
      row: id, work_id, card_id, category, title, claim_type, revision, contentChars: Array.from(content.trim()).length,
      aliasCount: aliases.length, relatedCount: related_card_ids.length,
      hasStructuredHeadings: /(?:^|\n)\s*(?:#{1,6}\s|【[^】]+】|[^\r\n：:]{2,16}[:：])/u.test(content),
      evidence: spans, flags, structuralError,
    };
  });

  function duplicateGroups(key) {
    return [...groupBy(cards, key).values()].filter(rows => rows.length > 1)
      .map(rows => rows.map(({ id, card_id, title }) => ({ row: id, card_id, title })));
  }

  const duplicateTitles = duplicateGroups(row => [row.work_id, row.category, normalize(row.title)].join('/'));
  const duplicateContent = duplicateGroups(row => [row.work_id, row.category, normalize(row.content)].join('/'));
  const characterAliases = [];
  for (const work of works) {
    const groups = new Map();
    for (const card of cardsByWork.get(work.work_id) ?? []) {
      if (card.category !== 'character') continue;
      for (const alias of new Set([card.title, ...JSON.parse(card.aliases)])) {
        const key = normalize(alias);
        if (key.length < 2) continue;
        if (!groups.has(key)) groups.set(key, { alias, cards: new Map() });
        groups.get(key).cards.set(card.id, { row: card.id, card_id: card.card_id, title: card.title });
      }
    }
    const top = [...groups.values()].filter(group => group.cards.size > 1).sort((a, b) => b.cards.size - a.cards.size);
    for (const { alias, cards: groupedCards } of top) {
      characterAliases.push({ work_id: work.work_id, work_title: work.title, alias, cards: [...groupedCards.values()] });
    }
  }

  const measuredByWork = groupBy(byCard, row => row.work_id);
  const stats = {
    workCount: works.length,
    volumeCount: volumes.length,
    revisionCount: revisions.length,
    ...measure(byCard),
    byCategory: Object.fromEntries([...groupBy(byCard, row => row.category)].map(([key, rows]) => [key, measure(rows)])),
    evidenceWidth: { max: evidence.reduce((max, row) => Math.max(max, row.end - row.start + 1), 0), over30: evidence.filter(row => row.end - row.start >= 30).length,
      over80: evidence.filter(row => row.end - row.start >= 80).length, over120: evidence.filter(row => row.end - row.start >= 120).length },
    flags: Object.fromEntries(issues),
    duplicateTitleGroups: duplicateTitles.length,
    duplicateContentGroups: duplicateContent.length,
    characterAliasOverlapGroups: characterAliases.length,
    works: works.map(work => ({
      ...work, ...measure(measuredByWork.get(work.work_id) ?? []),
      byCategory: histogram(measuredByWork.get(work.work_id) ?? [], row => row.category),
      volumes: (volumesByWork.get(work.work_id) ?? []).map(volume => {
        const volumeEvidence = evidenceByVolume.get(volume.volume_id) ?? [];
        const supported = [...new Set(volumeEvidence.map(row => row.card_row))].map(id => cardByRow.get(id));
        return { ...volume, revisions: revisionsByVolume.get(volume.volume_id) ?? [], evidence: volumeEvidence.length,
          cards: supported.length, byCategory: histogram(supported, row => row.category) };
      }),
    })),
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ stats, cards: byCard, duplicateTitles, duplicateContent, characterAliases }, null, 2) + '\n');
  console.log(JSON.stringify({ ...stats, works: stats.works.map(({ title, count, crossVolume, volumes }) => ({
    title, count, crossVolume, volumes: volumes.length,
    volumesWithoutCards: volumes.filter(volume => !volume.cards).length,
    volumesWithoutCharacter: volumes.filter(volume => !volume.byCategory.character).length,
  })) }, null, 2));
} finally {
  db.close();
}


