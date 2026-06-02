import type { Database } from 'better-sqlite3'
import { recordKey, type SyncRecord } from '@core/sync'

/**
 * Raw record export/import for sync. Unlike the feature repos, these methods
 * bypass change-tracking: applying a remote record writes the row AND sets
 * sync_state to exactly match the remote version (clean, not dirty), so merges
 * do not loop. Used only by the sync controllers.
 */
export class SyncRepo {
  constructor(private readonly db: Database) {}

  /** All syncable records (live + tombstones) keyed for merge. */
  localSnapshot(): Map<string, SyncRecord> {
    const out = new Map<string, SyncRecord>()
    const states = this.db
      .prepare('SELECT record_type, record_id, rev, updated_at, deleted FROM sync_state')
      .all() as {
      record_type: SyncRecord['type']
      record_id: string
      rev: number
      updated_at: number
      deleted: number
    }[]

    for (const st of states) {
      const data = st.deleted ? null : this.loadData(st.record_type, st.record_id)
      // A row that vanished without a tombstone is skipped.
      if (!st.deleted && !data) continue
      const record: SyncRecord = {
        type: st.record_type,
        id: st.record_id,
        rev: st.rev,
        updatedAt: st.updated_at,
        deleted: st.deleted === 1 || (!st.deleted && !data),
        data,
      }
      out.set(recordKey(record), record)
    }
    return out
  }

  private loadData(type: SyncRecord['type'], id: string): Record<string, unknown> | null {
    if (type === 'item') {
      return (
        (this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as
          | Record<string, unknown>
          | undefined) ?? null
      )
    }
    if (type === 'board') {
      return (
        (this.db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as
          | Record<string, unknown>
          | undefined) ?? null
      )
    }
    // board_item id is "boardId:itemId"
    const [boardId, itemId] = id.split(':')
    return (
      (this.db
        .prepare('SELECT * FROM board_items WHERE board_id = ? AND item_id = ?')
        .get(boardId, itemId) as Record<string, unknown> | undefined) ?? null
    )
  }

  /** Apply one remote record locally and pin sync_state to the remote version. */
  applyRemote(rec: SyncRecord): void {
    const tx = this.db.transaction(() => {
      if (rec.deleted || !rec.data) this.deleteLocal(rec)
      else this.upsertLocal(rec)
      this.db
        .prepare(
          `INSERT INTO sync_state (record_type, record_id, rev, updated_at, deleted, dirty, last_synced_at)
           VALUES (?, ?, ?, ?, ?, 0, ?)
           ON CONFLICT(record_type, record_id) DO UPDATE SET
             rev = excluded.rev, updated_at = excluded.updated_at,
             deleted = excluded.deleted, dirty = 0, last_synced_at = excluded.last_synced_at`,
        )
        .run(rec.type, rec.id, rec.rev, rec.updatedAt, rec.deleted ? 1 : 0, Date.now())
    })
    tx()
  }

  private deleteLocal(rec: SyncRecord): void {
    if (rec.type === 'item') {
      this.db.prepare('DELETE FROM items WHERE id = ?').run(rec.id)
      this.db.prepare('DELETE FROM board_items WHERE item_id = ?').run(rec.id)
    } else if (rec.type === 'board') {
      this.db.prepare('DELETE FROM boards WHERE id = ?').run(rec.id)
      this.db.prepare('DELETE FROM board_items WHERE board_id = ?').run(rec.id)
    } else {
      const [boardId, itemId] = rec.id.split(':')
      this.db
        .prepare('DELETE FROM board_items WHERE board_id = ? AND item_id = ?')
        .run(boardId, itemId)
    }
  }

  private upsertLocal(rec: SyncRecord): void {
    const d = rec.data as Record<string, unknown>
    if (rec.type === 'item') {
      this.db
        .prepare(
          `INSERT INTO items
            (id, type, created_at, updated_at, source_app, source_bundle_id, preview_text,
             content_ref, content_hash, is_pinned, byte_size, metadata, deleted_at)
           VALUES (@id,@type,@created_at,@updated_at,@source_app,@source_bundle_id,@preview_text,
             @content_ref,@content_hash,@is_pinned,@byte_size,@metadata,@deleted_at)
           ON CONFLICT(id) DO UPDATE SET
             type=excluded.type, updated_at=excluded.updated_at, source_app=excluded.source_app,
             source_bundle_id=excluded.source_bundle_id, preview_text=excluded.preview_text,
             content_ref=excluded.content_ref, content_hash=excluded.content_hash,
             is_pinned=excluded.is_pinned, byte_size=excluded.byte_size, metadata=excluded.metadata,
             deleted_at=excluded.deleted_at`,
        )
        .run(d)
    } else if (rec.type === 'board') {
      this.db
        .prepare(
          `INSERT INTO boards (id, name, sort_index, created_at, updated_at, is_smart, smart_query, deleted_at)
           VALUES (@id,@name,@sort_index,@created_at,@updated_at,@is_smart,@smart_query,@deleted_at)
           ON CONFLICT(id) DO UPDATE SET
             name=excluded.name, sort_index=excluded.sort_index, updated_at=excluded.updated_at,
             is_smart=excluded.is_smart, smart_query=excluded.smart_query, deleted_at=excluded.deleted_at`,
        )
        .run(d)
    } else {
      this.db
        .prepare(
          `INSERT INTO board_items (board_id, item_id, sort_index, created_at)
           VALUES (@board_id,@item_id,@sort_index,@created_at)
           ON CONFLICT(board_id, item_id) DO UPDATE SET sort_index=excluded.sort_index`,
        )
        .run(d)
    }
  }

  dirtyCount(): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS c FROM sync_state WHERE dirty = 1').get() as {
        c: number
      }
    ).c
  }

  markAllSynced(at: number): void {
    this.db.prepare('UPDATE sync_state SET dirty = 0, last_synced_at = ? WHERE dirty = 1').run(at)
  }
}
