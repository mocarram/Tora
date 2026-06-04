import type { Database } from 'better-sqlite3'

/**
 * Versioned, forward-only schema migrations. The runner uses PRAGMA
 * user_version as the on-disk schema version and applies each pending step in a
 * transaction. Document every change in DATA.md.
 */
export interface Migration {
  version: number
  name: string
  up: (db: Database) => void
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE items (
          id            TEXT PRIMARY KEY,
          type          TEXT NOT NULL,
          created_at    INTEGER NOT NULL,
          updated_at    INTEGER NOT NULL,
          source_app    TEXT,
          source_bundle_id TEXT,
          preview_text  TEXT NOT NULL,
          content_ref   TEXT,
          content_hash  TEXT NOT NULL,
          is_pinned     INTEGER NOT NULL DEFAULT 0,
          byte_size     INTEGER NOT NULL DEFAULT 0,
          metadata      TEXT NOT NULL,
          deleted_at    INTEGER
        );
        CREATE INDEX idx_items_updated ON items (deleted_at, is_pinned, updated_at DESC);
        CREATE INDEX idx_items_hash ON items (content_hash);
        CREATE INDEX idx_items_type ON items (type, updated_at DESC);

        CREATE TABLE boards (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          sort_index  INTEGER NOT NULL,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL,
          is_smart    INTEGER NOT NULL DEFAULT 0,
          smart_query TEXT,
          deleted_at  INTEGER
        );

        CREATE TABLE board_items (
          board_id   TEXT NOT NULL,
          item_id    TEXT NOT NULL,
          sort_index INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (board_id, item_id)
        );
        CREATE INDEX idx_board_items ON board_items (board_id, sort_index);
        CREATE INDEX idx_board_items_item ON board_items (item_id);

        CREATE TABLE settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        -- Per-record change vectors for sync (last-writer-wins, tombstones).
        CREATE TABLE sync_state (
          record_type    TEXT NOT NULL,
          record_id      TEXT NOT NULL,
          rev            INTEGER NOT NULL DEFAULT 1,
          updated_at     INTEGER NOT NULL,
          deleted        INTEGER NOT NULL DEFAULT 0,
          dirty          INTEGER NOT NULL DEFAULT 1,
          last_synced_at INTEGER,
          PRIMARY KEY (record_type, record_id)
        );
        CREATE INDEX idx_sync_dirty ON sync_state (dirty, record_type);
      `)
    },
  },
  {
    version: 2,
    name: 'feed index ordering for flat pagination',
    up: (db) => {
      // The history feed sorts `is_pinned DESC, updated_at DESC`, but the
      // original index stored is_pinned ascending, so SQLite could not walk it
      // for the ORDER BY and fell back to "USE TEMP B-TREE" - a full sort of
      // every live row on every page load (O(n), ~100ms at 200k items). A
      // matching composite makes the first page an index walk (O(limit)) and
      // keeps pagination flat regardless of history size.
      db.exec(`
        DROP INDEX IF EXISTS idx_items_updated;
        CREATE INDEX idx_items_feed ON items (deleted_at, is_pinned DESC, updated_at DESC);
      `)
    },
  },
  {
    version: 3,
    name: 'user-editable clip title',
    up: (db) => {
      // Optional custom label the user types on a card to remember what a clip
      // is. NULL means "fall back to the source app / type label".
      db.exec('ALTER TABLE items ADD COLUMN title TEXT')
    },
  },
]

export function runMigrations(db: Database): number {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  )
  for (const migration of pending) {
    const tx = db.transaction(() => {
      migration.up(db)
      db.pragma(`user_version = ${migration.version}`)
    })
    tx()
  }
  return pending.length > 0 ? (pending[pending.length - 1] as Migration).version : current
}
