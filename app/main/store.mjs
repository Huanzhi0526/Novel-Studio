import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const databaseVersion = 1;

const schema = `
CREATE TABLE original_works (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, created INTEGER NOT NULL
) STRICT;
CREATE TABLE original_volumes (
  id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES original_works(id),
  title TEXT NOT NULL, position INTEGER NOT NULL,
  UNIQUE (work_id, id)
) STRICT;
CREATE TABLE original_docs (
  id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES original_works(id),
  volume_id TEXT, kind TEXT NOT NULL CHECK(kind IN ('chapter','outline','character','setting')),
  title TEXT NOT NULL, position INTEGER NOT NULL, body TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, deleted INTEGER,
  FOREIGN KEY (work_id, volume_id) REFERENCES original_volumes(work_id, id),
  CHECK ((kind = 'chapter') = (volume_id IS NOT NULL))
) STRICT;
CREATE INDEX original_docs_order ON original_docs(work_id, volume_id, position);
CREATE TABLE original_drafts (
  doc_id TEXT PRIMARY KEY REFERENCES original_docs(id) ON DELETE CASCADE,
  base INTEGER NOT NULL, body TEXT NOT NULL, edits TEXT, updated INTEGER NOT NULL
) STRICT;
CREATE TABLE original_history (
  doc_id TEXT NOT NULL REFERENCES original_docs(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, body TEXT NOT NULL, saved INTEGER NOT NULL,
  PRIMARY KEY (doc_id, revision)
) STRICT;
CREATE TABLE original_marks (
  id TEXT PRIMARY KEY, doc_id TEXT NOT NULL REFERENCES original_docs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('foreshadow','setup','key','other')),
  start INTEGER NOT NULL, end INTEGER NOT NULL, quote TEXT NOT NULL,
  prefix TEXT NOT NULL, suffix TEXT NOT NULL, note TEXT NOT NULL, invalid INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX original_marks_doc ON original_marks(doc_id);

CREATE TABLE reference_works (
  work_id TEXT PRIMARY KEY, title TEXT NOT NULL, deleted INTEGER
) STRICT;
CREATE TABLE reference_volumes (
  volume_id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES reference_works(work_id),
  title TEXT NOT NULL
) STRICT;
CREATE INDEX reference_volumes_work ON reference_volumes(work_id);
CREATE TABLE reference_revisions (
  volume_id TEXT NOT NULL REFERENCES reference_volumes(volume_id),
  revision_id TEXT NOT NULL, count INTEGER NOT NULL CHECK(count > 0), imported INTEGER NOT NULL,
  PRIMARY KEY (volume_id, revision_id)
) STRICT;
CREATE TABLE reference_blocks (
  volume_id TEXT NOT NULL, revision_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('text','image','note')),
  text TEXT NOT NULL, asset_sha256 TEXT, note_target TEXT,
  PRIMARY KEY (volume_id, revision_id, ordinal),
  FOREIGN KEY (volume_id, revision_id) REFERENCES reference_revisions(volume_id, revision_id)
) STRICT;
CREATE INDEX reference_note_targets ON reference_blocks(volume_id, revision_id, note_target) WHERE note_target IS NOT NULL;
CREATE TABLE reference_structures (
  volume_id TEXT NOT NULL, revision_id TEXT NOT NULL, structure_id TEXT NOT NULL,
  parent_id TEXT, type TEXT NOT NULL, title TEXT, start INTEGER NOT NULL, end INTEGER NOT NULL,
  PRIMARY KEY (volume_id, revision_id, structure_id),
  FOREIGN KEY (volume_id, revision_id) REFERENCES reference_revisions(volume_id, revision_id)
) STRICT;
CREATE INDEX reference_structure_ranges ON reference_structures(volume_id, revision_id, start, end);
CREATE TABLE reference_assets (
  work_id TEXT NOT NULL REFERENCES reference_works(work_id),
  hash TEXT NOT NULL, media_type TEXT NOT NULL, body BLOB NOT NULL,
  PRIMARY KEY (work_id, hash)
) STRICT;
CREATE TABLE reference_cards (
  id INTEGER PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES reference_works(work_id),
  card_id TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
  content TEXT NOT NULL, claim_type TEXT NOT NULL, aliases TEXT NOT NULL, related_card_ids TEXT NOT NULL,
  search_text TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE (work_id, card_id)
) STRICT;
CREATE INDEX reference_cards_work_category ON reference_cards(work_id, category, id);
CREATE TABLE reference_evidence (
  card_row INTEGER NOT NULL REFERENCES reference_cards(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, volume_id TEXT NOT NULL, revision_id TEXT NOT NULL,
  start INTEGER NOT NULL, end INTEGER NOT NULL CHECK(end >= start),
  PRIMARY KEY (card_row, position),
  FOREIGN KEY (volume_id, revision_id, start) REFERENCES reference_blocks(volume_id, revision_id, ordinal),
  FOREIGN KEY (volume_id, revision_id, end) REFERENCES reference_blocks(volume_id, revision_id, ordinal)
) STRICT;
CREATE VIRTUAL TABLE reference_fts USING fts5(tokens, tokenize='unicode61 remove_diacritics 0');
CREATE TABLE reference_vectors (
  card_row INTEGER NOT NULL REFERENCES reference_cards(id) ON DELETE CASCADE,
  card_revision INTEGER NOT NULL, model_id TEXT NOT NULL, template TEXT NOT NULL,
  dimension INTEGER NOT NULL, data BLOB NOT NULL,
  PRIMARY KEY(card_row, model_id, template)
) STRICT;
CREATE TABLE reference_imports (
  package_id TEXT PRIMARY KEY, digest TEXT NOT NULL UNIQUE,
  work_id TEXT NOT NULL REFERENCES reference_works(work_id),
  approved INTEGER NOT NULL, report TEXT NOT NULL, stats TEXT NOT NULL
) STRICT;`;

export function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export class Store {
  constructor(filename) {
    this.filename = filename;
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.open();
  }

  open() {
    this.db = new DatabaseSync(this.filename, { enableForeignKeyConstraints: true });
    try {
      this.db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;');
      const { user_version: version } = this.db.prepare('PRAGMA user_version').get();
      if (version === 0) {
        this.transaction(() => this.db.exec(schema + `PRAGMA user_version=${databaseVersion};`));
      } else if (version !== databaseVersion) {
        fail('DATABASE_VERSION', `当前应用不支持资料库版本 ${version}`);
      }
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
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
}
