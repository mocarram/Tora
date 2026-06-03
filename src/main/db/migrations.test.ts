import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { MIGRATIONS, runMigrations } from './migrations'

/**
 * Guards the data-layer performance contract. The history feed sorts
 * `is_pinned DESC, updated_at DESC`; if the backing index ever stops matching
 * that order, SQLite falls back to a full "USE TEMP B-TREE" sort of every row
 * on every page load (O(n)). These tests pin the schema so that regression
 * cannot land unnoticed.
 */

const FEED_SQL =
  'SELECT i.* FROM items i WHERE i.deleted_at IS NULL ORDER BY i.is_pinned DESC, i.updated_at DESC LIMIT 120 OFFSET 0'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

function seed(db: Database.Database, n: number): void {
  const ins = db.prepare(
    `INSERT INTO items (id, type, created_at, updated_at, source_app, preview_text, content_hash, is_pinned, byte_size, metadata)
     VALUES (?, 'text', ?, ?, 'App', ?, ?, 0, 0, '{}')`,
  )
  const tx = db.transaction(() => {
    for (let i = 0; i < n; i++) ins.run(`i${i}`, i, i, `text ${i}`, `h${i}`)
  })
  tx()
}

describe('schema migrations', () => {
  it('applies every migration and reports the latest version', () => {
    const db = freshDb()
    const latest = MIGRATIONS[MIGRATIONS.length - 1]?.version
    expect(db.pragma('user_version', { simple: true })).toBe(latest)
    db.close()
  })

  it('feed query uses the index instead of a full temp-b-tree sort', () => {
    const db = freshDb()
    seed(db, 2000)
    const plan = (db.prepare(`EXPLAIN QUERY PLAN ${FEED_SQL}`).all() as { detail: string }[])
      .map((r) => r.detail)
      .join('\n')
    expect(plan).toContain('idx_items_feed')
    expect(plan).not.toMatch(/TEMP B-TREE/i)
    db.close()
  })

  it('returns pinned items first, then most-recent', () => {
    const db = freshDb()
    seed(db, 10)
    db.prepare('UPDATE items SET is_pinned = 1 WHERE id = ?').run('i3')
    const rows = db.prepare(FEED_SQL).all() as { id: string; is_pinned: number }[]
    expect(rows[0]?.id).toBe('i3') // pinned floats to the top
    expect(rows[1]?.id).toBe('i9') // then newest (highest updated_at) first
    db.close()
  })
})
