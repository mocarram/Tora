import type { Database } from 'better-sqlite3'

export type SyncRecordType = 'item' | 'board' | 'board_item'

/**
 * Records a local change in sync_state so the sync layer can push it later.
 * Bumps the revision, refreshes updated_at, and marks the row dirty. Deletes
 * are tombstoned (deleted = 1) rather than removed, so other devices learn of
 * them. Call this from every mutating repo method.
 */
export function markChange(
  db: Database,
  type: SyncRecordType,
  id: string,
  options: { deleted?: boolean; at?: number } = {},
): void {
  const at = options.at ?? Date.now()
  const deleted = options.deleted ? 1 : 0
  db.prepare(
    `INSERT INTO sync_state (record_type, record_id, rev, updated_at, deleted, dirty, last_synced_at)
     VALUES (?, ?, 1, ?, ?, 1, NULL)
     ON CONFLICT(record_type, record_id) DO UPDATE SET
       rev = rev + 1,
       updated_at = excluded.updated_at,
       deleted = excluded.deleted,
       dirty = 1`,
  ).run(type, id, at, deleted)
}
