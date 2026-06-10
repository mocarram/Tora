import type { Database, Statement } from 'better-sqlite3'
import type { ClipItem, ClipItemMetadata, ClipItemType, QuickFilter } from '@core/model'
import { markChange } from './syncState'

interface ItemRow {
  id: string
  type: string
  created_at: number
  updated_at: number
  source_app: string | null
  source_bundle_id: string | null
  title: string | null
  preview_text: string
  content_ref: string | null
  content_hash: string
  is_pinned: number
  byte_size: number
  metadata: string
  deleted_at: number | null
}

/** Lightweight projection used to build the in-memory search index. */
export interface SearchRow {
  id: string
  title: string | null
  previewText: string
  sourceApp: string | null
  type: ClipItemType
  updatedAt: number
  isPinned: boolean
}

export interface NewItem {
  id: string
  type: ClipItemType
  createdAt: number
  sourceApp: string | null
  sourceBundleId: string | null
  previewText: string
  contentRef: string | null
  contentHash: string
  byteSize: number
  metadata: ClipItemMetadata
}

const FILTER_TYPES: Record<Exclude<QuickFilter, 'all'>, ClipItemType[]> = {
  text: ['text', 'richText', 'code'],
  images: ['image'],
  links: ['url'],
  files: ['file'],
}

/** Whether an item type belongs to a quick filter. */
export function matchesQuickFilter(type: ClipItemType, filter: QuickFilter): boolean {
  if (filter === 'all') return true
  return FILTER_TYPES[filter].includes(type)
}

function mapRow(row: ItemRow): ClipItem {
  return {
    id: row.id,
    type: row.type as ClipItemType,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceApp: row.source_app,
    sourceBundleId: row.source_bundle_id,
    title: row.title,
    previewText: row.preview_text,
    contentRef: row.content_ref,
    contentHash: row.content_hash,
    isPinned: row.is_pinned === 1,
    byteSize: row.byte_size,
    metadata: JSON.parse(row.metadata) as ClipItemMetadata,
    deletedAt: row.deleted_at,
  }
}

export class ItemsRepo {
  // Hot-path statements are prepared once. better-sqlite3 compiles SQL on every
  // prepare() call, and these run on every capture / dedup / mutation, so an
  // inline prepare per call is wasted work on the busiest paths.
  private readonly getStmt: Statement
  private readonly hashStmt: Statement
  private readonly insertStmt: Statement
  private readonly touchStmt: Statement
  private readonly pinStmt: Statement
  private readonly updateTextStmt: Statement
  private readonly setMetadataStmt: Statement
  private readonly setContentRefStmt: Statement
  private readonly softDeleteStmt: Statement
  private readonly setTitleStmt: Statement
  private readonly hardDeleteStmt: Statement
  private readonly deleteBoardItemsStmt: Statement

  constructor(private readonly db: Database) {
    this.getStmt = db.prepare('SELECT * FROM items WHERE id = ?')
    this.hashStmt = db.prepare(
      'SELECT * FROM items WHERE content_hash = ? AND deleted_at IS NULL LIMIT 1',
    )
    this.insertStmt = db.prepare(
      `INSERT INTO items
        (id, type, created_at, updated_at, source_app, source_bundle_id,
         preview_text, content_ref, content_hash, is_pinned, byte_size, metadata, deleted_at)
       VALUES (@id, @type, @created_at, @updated_at, @source_app, @source_bundle_id,
         @preview_text, @content_ref, @content_hash, 0, @byte_size, @metadata, NULL)`,
    )
    this.touchStmt = db.prepare('UPDATE items SET updated_at = ? WHERE id = ?')
    this.pinStmt = db.prepare('UPDATE items SET is_pinned = ?, updated_at = ? WHERE id = ?')
    this.updateTextStmt = db.prepare(
      `UPDATE items SET type = ?, preview_text = ?, content_hash = ?, byte_size = ?, metadata = ?, updated_at = ?
       WHERE id = ?`,
    )
    this.setMetadataStmt = db.prepare('UPDATE items SET metadata = ? WHERE id = ?')
    this.setContentRefStmt = db.prepare('UPDATE items SET content_ref = ? WHERE id = ?')
    this.softDeleteStmt = db.prepare('UPDATE items SET deleted_at = ? WHERE id = ?')
    this.setTitleStmt = db.prepare('UPDATE items SET title = ? WHERE id = ?')
    this.hardDeleteStmt = db.prepare('DELETE FROM items WHERE id = ?')
    this.deleteBoardItemsStmt = db.prepare('DELETE FROM board_items WHERE item_id = ?')
  }

  insert(item: NewItem): ClipItem {
    const now = item.createdAt
    this.insertStmt.run({
      id: item.id,
      type: item.type,
      created_at: now,
      updated_at: now,
      source_app: item.sourceApp,
      source_bundle_id: item.sourceBundleId,
      preview_text: item.previewText,
      content_ref: item.contentRef,
      content_hash: item.contentHash,
      byte_size: item.byteSize,
      metadata: JSON.stringify(item.metadata),
    })
    markChange(this.db, 'item', item.id, { at: now })
    return this.getById(item.id) as ClipItem
  }

  getById(id: string): ClipItem | null {
    const row = this.getStmt.get(id) as ItemRow | undefined
    return row ? mapRow(row) : null
  }

  /** Find a live item with the same content hash (consecutive-copy dedup). */
  findByHash(hash: string): ClipItem | null {
    const row = this.hashStmt.get(hash) as ItemRow | undefined
    return row ? mapRow(row) : null
  }

  /** Bump an existing item to "now" (dedup hit). Returns the updated item. */
  touch(id: string, at: number = Date.now()): ClipItem | null {
    this.touchStmt.run(at, id)
    markChange(this.db, 'item', id, { at })
    return this.getById(id)
  }

  setPinned(id: string, pinned: boolean): void {
    const at = Date.now()
    this.pinStmt.run(pinned ? 1 : 0, at, id)
    markChange(this.db, 'item', id, { at })
  }

  updateText(
    id: string,
    fields: {
      type: ClipItemType
      previewText: string
      contentHash: string
      byteSize: number
      metadata: ClipItemMetadata
    },
  ): ClipItem | null {
    const at = Date.now()
    this.updateTextStmt.run(
      fields.type,
      fields.previewText,
      fields.contentHash,
      fields.byteSize,
      JSON.stringify(fields.metadata),
      at,
      id,
    )
    markChange(this.db, 'item', id, { at })
    return this.getById(id)
  }

  /** Replace an item's metadata JSON (used to attach image thumbnail refs). */
  setMetadata(id: string, metadata: ClipItemMetadata): void {
    this.setMetadataStmt.run(JSON.stringify(metadata), id)
  }

  /** Set the on-disk blob reference (so blob cleanup on delete works). */
  setContentRef(id: string, ref: string): void {
    this.setContentRefStmt.run(ref, id)
  }

  softDelete(id: string): void {
    // One transaction: a crash between the row update and the sync tombstone
    // would otherwise leave a deleted-looking item with no tombstone, which a
    // sync peer would happily push right back (deleted items resurrecting).
    const at = Date.now()
    this.db.transaction(() => {
      this.softDeleteStmt.run(at, id)
      this.deleteBoardItemsStmt.run(id)
      markChange(this.db, 'item', id, { deleted: true, at })
    })()
  }

  /**
   * Page items for the history list. Search is handled separately (in-memory
   * ranking via core), so this is pure filter + sort + window.
   */
  query(opts: {
    filter: QuickFilter
    boardId: string | null
    pinnedOnly: boolean
    limit: number
    offset: number
  }): { items: ClipItem[]; total: number } {
    const where: string[] = ['i.deleted_at IS NULL']
    const params: Record<string, unknown> = {}

    if (opts.filter !== 'all') {
      const types = FILTER_TYPES[opts.filter]
      where.push(`i.type IN (${types.map((_, n) => `@t${n}`).join(',')})`)
      types.forEach((t, n) => (params[`t${n}`] = t))
    }
    if (opts.pinnedOnly) where.push('i.is_pinned = 1')

    const join = opts.boardId
      ? 'JOIN board_items bi ON bi.item_id = i.id AND bi.board_id = @boardId'
      : ''
    if (opts.boardId) params.boardId = opts.boardId

    const order = opts.boardId
      ? 'ORDER BY bi.sort_index ASC'
      : 'ORDER BY i.is_pinned DESC, i.updated_at DESC'

    const whereSql = where.join(' AND ')
    const total = (
      this.db
        .prepare(`SELECT COUNT(*) AS c FROM items i ${join} WHERE ${whereSql}`)
        .get(params) as { c: number }
    ).c

    const rows = this.db
      .prepare(
        `SELECT i.* FROM items i ${join} WHERE ${whereSql} ${order} LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: opts.limit, offset: opts.offset }) as ItemRow[]

    return { items: rows.map(mapRow), total }
  }

  /** All live rows projected for the search index. */
  allSearchRows(): SearchRow[] {
    const rows = this.db
      .prepare(
        'SELECT id, title, preview_text, source_app, type, updated_at, is_pinned FROM items WHERE deleted_at IS NULL',
      )
      .all() as Pick<
      ItemRow,
      'id' | 'title' | 'preview_text' | 'source_app' | 'type' | 'updated_at' | 'is_pinned'
    >[]
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      previewText: r.preview_text,
      sourceApp: r.source_app,
      type: r.type as ClipItemType,
      updatedAt: r.updated_at,
      isPinned: r.is_pinned === 1,
    }))
  }

  /** Set or clear (null) the user's custom title. Does not change ordering. */
  setTitle(id: string, title: string | null): void {
    this.setTitleStmt.run(title, id)
    markChange(this.db, 'item', id)
  }

  getMany(ids: string[]): ClipItem[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT * FROM items WHERE id IN (${placeholders}) AND deleted_at IS NULL`)
      .all(...ids) as ItemRow[]
    const byId = new Map(rows.map((r) => [r.id, mapRow(r)]))
    return ids.map((id) => byId.get(id)).filter((x): x is ClipItem => x !== undefined)
  }

  /**
   * Minimal projection (id, type, pinned) preserving input order. The search
   * path filters and counts potentially thousands of ranked candidates; doing
   * that over this 3-column projection avoids loading full rows and parsing
   * metadata JSON for every candidate just to keep one page.
   */
  getManyLite(ids: string[]): { id: string; type: ClipItemType; isPinned: boolean }[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT id, type, is_pinned FROM items WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      )
      .all(...ids) as { id: string; type: string; is_pinned: number }[]
    const byId = new Map(
      rows.map((r) => [
        r.id,
        { id: r.id, type: r.type as ClipItemType, isPinned: r.is_pinned === 1 },
      ]),
    )
    return ids
      .map((id) => byId.get(id))
      .filter((x): x is { id: string; type: ClipItemType; isPinned: boolean } => x !== undefined)
  }

  /**
   * Live items older than the cutoff (for retention pruning). Pinned items and
   * items that belong to at least one board are kept regardless of the window;
   * an item only becomes prunable again once removed from all boards.
   */
  expiredRefs(cutoff: number): { id: string; contentRef: string | null }[] {
    return this.db
      .prepare(
        `SELECT id, content_ref AS contentRef FROM items
         WHERE deleted_at IS NULL AND is_pinned = 0 AND updated_at < ?
           AND id NOT IN (SELECT item_id FROM board_items)`,
      )
      .all(cutoff) as { id: string; contentRef: string | null }[]
  }

  /**
   * Re-check a single expiredRefs candidate just before pruning it. The
   * retention loop awaits blob I/O between deletes, so the user can pin an item
   * (or add it to a board) after the snapshot was taken - without this check
   * that item would still be deleted.
   */
  stillExpirable(id: string, cutoff: number): boolean {
    return (
      this.db
        .prepare(
          `SELECT 1 FROM items
           WHERE id = ? AND deleted_at IS NULL AND is_pinned = 0 AND updated_at < ?
             AND id NOT IN (SELECT item_id FROM board_items)`,
        )
        .get(id, cutoff) !== undefined
    )
  }

  /** Hard-remove a tombstoned/expired row. Blob removal is the caller's job. */
  hardDelete(id: string): void {
    this.hardDeleteStmt.run(id)
    this.deleteBoardItemsStmt.run(id)
  }

  stats(): { itemCount: number; totalBytes: number; oldestItemAt: number | null } {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS bytes, MIN(created_at) AS oldest
         FROM items WHERE deleted_at IS NULL`,
      )
      .get() as { count: number; bytes: number; oldest: number | null }
    return { itemCount: row.count, totalBytes: row.bytes, oldestItemAt: row.oldest }
  }
}
