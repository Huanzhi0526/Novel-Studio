import { createHash } from 'node:crypto';
import { readFile, stat, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { ReferenceService } from '../app/main/reference.mjs';
import { validateCard } from '../app/main/protocol.mjs';
import { Store } from '../app/main/store.mjs';

const [mode, dbPath, patchPath, backupPath, ...extra] = process.argv.slice(2);
if (extra.length || !dbPath || !patchPath ||
    (mode !== '--check' && mode !== '--apply') ||
    (mode === '--apply') !== Boolean(backupPath)) {
  throw new Error('Usage: node scripts/revise-reference-cards.mjs --check <db> <patch.json> or --apply <db> <patch.json> <new-backup.sqlite>');
}
if (!(await stat(dbPath)).isFile()) throw new Error('Database must be an existing file');
const patchBytes = await readFile(patchPath);
const patch = JSON.parse(patchBytes);
if (!Array.isArray(patch.cards) || patch.cards.length === 0) throw new Error('Patch must contain reviewed cards');

const store = mode === '--apply' ? new Store(resolve(dbPath)) : {
  db: new DatabaseSync(resolve(dbPath), { readOnly: true })
};
const reference = new ReferenceService(store);
const seen = new Set();
function audit() {
  seen.clear();
  const changes = [];
  let unchanged = 0;
  for (const entry of patch.cards) {
    const key = `${entry.workId}/${entry.cardId}`;
    if (seen.has(key)) throw new Error('Duplicate work/card ID');
    seen.add(key);
    const row = reference.cardRow(entry.workId, entry.cardId);
    const adding = entry.id === null && entry.expectedRevision === 0;
    if (!adding && (!Number.isSafeInteger(entry.id) || row?.id !== entry.id)) {
      throw new Error(`Card identity does not match row ${entry.id}`);
    }
    const current = row && reference.cardDetails(row);
    const next = {
      card_id: entry.cardId, category: entry.category ?? row?.category,
      title: entry.title, content: entry.content,
      claim_type: entry.claimType ?? row?.claim_type,
      aliases: entry.aliases ?? current?.aliases ?? [],
      related_card_ids: entry.relatedCardIds ?? current?.related_card_ids ?? [],
      evidence: entry.evidence
    };
    if (adding && row && entry.category !== row.category) throw new Error(`Card ID already exists in a different category: ${key}`);
    validateCard(next, entry.workId, reference.lookup);
    if (!row) {
      changes.push({ row, workId: entry.workId, next });
      continue;
    }
    const priorEvidence = current.evidence.map(({ volume_id, revision_id, start, end }) => ({ volume_id, revision_id, start, end }));
    const previous = {
      ...next, category: row.category, title: row.title, content: row.content, claim_type: row.claim_type,
      aliases: current.aliases, related_card_ids: current.related_card_ids, evidence: priorEvidence
    };
    if (JSON.stringify(previous) === JSON.stringify(next)) {
      unchanged++;
      continue;
    }
    // A published first-pass card may be recategorized only when its complete
    // current content and evidence still match the reviewed card.
    const categoryOnly = entry.expectedRevision === 2 && row.revision === 2 &&
      entry.previousCategory === previous.category &&
      typeof entry.claimType === 'string' && Array.isArray(entry.aliases) && Array.isArray(entry.relatedCardIds) &&
      JSON.stringify({ ...previous, category: next.category }) === JSON.stringify(next);
    if (!categoryOnly && (entry.expectedRevision !== 1 || row.revision !== 1)) {
      throw new Error(`Card row ${entry.id} has a protected or stale revision (${row.revision})`);
    }
    changes.push({ row, workId: entry.workId, next });
  }
  return { changes, unchanged };
}

try {
  let checked = audit();
  if (mode === '--apply' && checked.changes.length) {
    // Reserve a unique output path without overwriting a prior backup.
    const reservation = await open(backupPath, 'wx');
    await reservation.close();
    await backup(store.db, resolve(backupPath));
    const saved = new DatabaseSync(resolve(backupPath), { readOnly: true });
    try {
      if (saved.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Backup failed integrity check');
    } finally {
      saved.close();
    }
    checked = store.transaction(() => {
      const current = audit();
      for (const { row, workId, next } of current.changes) reference.writeCard(workId, next, row);
      return current;
    });
  }
  console.log(JSON.stringify({
    mode, patchSha256: createHash('sha256').update(patchBytes).digest('hex'),
    checked: patch.cards.length, unchanged: checked.unchanged,
    changes: checked.changes.map(({ row, workId, next }) => ({
      id: row?.id ?? null, workId, cardId: next.card_id, from: row?.revision ?? 0
    })),
    backup: mode === '--apply' && checked.changes.length ? resolve(backupPath) : null
  }, null, 2));
} finally {
  if (mode === '--apply') store.close();
  else store.db.close();
}
