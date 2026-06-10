import type { Database, Statement } from 'better-sqlite3'
import type { Board } from '@core/model'
import { FAVOURITES_BOARD_ID } from '@core/model'
import { markChange } from './syncState'

interface BoardRow {
  id: string
  name: string
  sort_index: number
  created_at: number
  updated_at: number
  is_smart: number
  smart_query: string | null
  deleted_at: number | null
}

function mapRow(row: BoardRow): Board {
  return {
    id: row.id,
    name: row.name,
    sortIndex: row.sort_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isSmart: row.is_smart === 1,
    smartQuery: row.smart_query,
    deletedAt: row.deleted_at,
  }
}

export class BoardsRepo {
  private readonly getStmt: Statement

  constructor(
    private readonly db: Database,
    private readonly genId: () => string,
  ) {
    this.getStmt = db.prepare('SELECT * FROM boards WHERE id = ?')
  }

  /** Create the default Favourites board if it does not exist. */
  ensureDefaults(): void {
    const exists = this.getStmt.get(FAVOURITES_BOARD_ID) as BoardRow | undefined
    if (exists) return
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO boards (id, name, sort_index, created_at, updated_at, is_smart, smart_query, deleted_at)
         VALUES (?, 'Favourites', 0, ?, ?, 0, NULL, NULL)`,
      )
      .run(FAVOURITES_BOARD_ID, now, now)
    markChange(this.db, 'board', FAVOURITES_BOARD_ID, { at: now })
  }

  list(): Board[] {
    const rows = this.db
      .prepare('SELECT * FROM boards WHERE deleted_at IS NULL ORDER BY sort_index ASC')
      .all() as BoardRow[]
    return rows.map(mapRow)
  }

  getById(id: string): Board | null {
    const row = this.getStmt.get(id) as BoardRow | undefined
    return row ? mapRow(row) : null
  }

  create(name: string): Board {
    const id = this.genId()
    const now = Date.now()
    const nextIndex =
      ((
        this.db
          .prepare('SELECT MAX(sort_index) AS m FROM boards WHERE deleted_at IS NULL')
          .get() as {
          m: number | null
        }
      ).m ?? -1) + 1
    this.db
      .prepare(
        `INSERT INTO boards (id, name, sort_index, created_at, updated_at, is_smart, smart_query, deleted_at)
         VALUES (?, ?, ?, ?, ?, 0, NULL, NULL)`,
      )
      .run(id, name.trim() || 'Untitled', nextIndex, now, now)
    markChange(this.db, 'board', id, { at: now })
    return this.getById(id) as Board
  }

  rename(id: string, name: string): void {
    if (id === FAVOURITES_BOARD_ID) return // the default board name is permanent
    const at = Date.now()
    this.db
      .prepare('UPDATE boards SET name = ?, updated_at = ? WHERE id = ?')
      .run(name.trim() || 'Untitled', at, id)
    markChange(this.db, 'board', id, { at })
  }

  remove(id: string): void {
    if (id === FAVOURITES_BOARD_ID) return // the default board is permanent
    // One transaction: orphaned board_items rows from a crash mid-delete would
    // permanently exempt their items from retention (the expiry query skips
    // anything with a board membership).
    const at = Date.now()
    this.db.transaction(() => {
      this.db.prepare('UPDATE boards SET deleted_at = ? WHERE id = ?').run(at, id)
      this.db.prepare('DELETE FROM board_items WHERE board_id = ?').run(id)
      markChange(this.db, 'board', id, { deleted: true, at })
    })()
  }

  reorder(orderedIds: string[]): void {
    const at = Date.now()
    const stmt = this.db.prepare('UPDATE boards SET sort_index = ?, updated_at = ? WHERE id = ?')
    const tx = this.db.transaction(() => {
      orderedIds.forEach((id, index) => {
        stmt.run(index, at, id)
        markChange(this.db, 'board', id, { at })
      })
    })
    tx()
  }

  addItem(boardId: string, itemId: string): void {
    const now = Date.now()
    const nextIndex =
      ((
        this.db
          .prepare('SELECT MAX(sort_index) AS m FROM board_items WHERE board_id = ?')
          .get(boardId) as { m: number | null }
      ).m ?? -1) + 1
    this.db
      .prepare(
        `INSERT INTO board_items (board_id, item_id, sort_index, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(board_id, item_id) DO NOTHING`,
      )
      .run(boardId, itemId, nextIndex, now)
    markChange(this.db, 'board_item', `${boardId}:${itemId}`, { at: now })
  }

  removeItem(boardId: string, itemId: string): void {
    this.db
      .prepare('DELETE FROM board_items WHERE board_id = ? AND item_id = ?')
      .run(boardId, itemId)
    markChange(this.db, 'board_item', `${boardId}:${itemId}`, { deleted: true })
  }

  reorderItems(boardId: string, orderedItemIds: string[]): void {
    const at = Date.now()
    const stmt = this.db.prepare(
      'UPDATE board_items SET sort_index = ? WHERE board_id = ? AND item_id = ?',
    )
    const tx = this.db.transaction(() => {
      orderedItemIds.forEach((itemId, index) => {
        stmt.run(index, boardId, itemId)
        markChange(this.db, 'board_item', `${boardId}:${itemId}`, { at })
      })
    })
    tx()
  }

  itemIdsInBoard(boardId: string): Set<string> {
    const rows = this.db
      .prepare('SELECT item_id FROM board_items WHERE board_id = ?')
      .all(boardId) as { item_id: string }[]
    return new Set(rows.map((r) => r.item_id))
  }

  boardsForItem(itemId: string): string[] {
    const rows = this.db
      .prepare('SELECT board_id FROM board_items WHERE item_id = ?')
      .all(itemId) as { board_id: string }[]
    return rows.map((r) => r.board_id)
  }
}
