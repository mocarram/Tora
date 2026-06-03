import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Storage } from './index'

let dir: string
let storage: Storage

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tora-test-'))
  storage = new Storage({ dbFile: join(dir, 'tora.db'), blobDir: join(dir, 'blobs') })
  await storage.init()
})

afterEach(() => {
  storage.close()
  rmSync(dir, { recursive: true, force: true })
})

function addText(text: string, hash: string): string {
  const id = storage.newId()
  storage.items.insert({
    id,
    type: 'text',
    createdAt: Date.now(),
    sourceApp: 'Test',
    sourceBundleId: null,
    previewText: text,
    contentRef: null,
    contentHash: hash,
    byteSize: text.length,
    metadata: { kind: 'text', charCount: text.length, wordCount: 1 },
  })
  return id
}

describe('migrations', () => {
  it('sets the schema version', () => {
    expect(storage.db.pragma('user_version', { simple: true })).toBe(1)
  })
  it('creates the default Favourites board', () => {
    const boards = storage.boards.list()
    expect(boards).toHaveLength(1)
    expect(boards[0]?.name).toBe('Favourites')
  })
})

describe('ItemsRepo', () => {
  it('inserts and reads items back', () => {
    const id = addText('hello', 'h1')
    const item = storage.items.getById(id)
    expect(item?.previewText).toBe('hello')
    expect(item?.metadata.kind).toBe('text')
  })

  it('finds by hash and touches', () => {
    const id = addText('dup', 'hdup')
    const found = storage.items.findByHash('hdup')
    expect(found?.id).toBe(id)
    const before = storage.items.getById(id)!.updatedAt
    const touched = storage.items.touch(id, before + 1000)
    expect(touched?.updatedAt).toBe(before + 1000)
  })

  it('filters by quick filter', () => {
    addText('a note', 'a')
    const id = storage.newId()
    storage.items.insert({
      id,
      type: 'url',
      createdAt: Date.now(),
      sourceApp: null,
      sourceBundleId: null,
      previewText: 'https://x.com',
      contentRef: null,
      contentHash: 'u',
      byteSize: 10,
      metadata: { kind: 'url', url: 'https://x.com', host: 'x.com' },
    })
    expect(
      storage.items.query({
        filter: 'links',
        boardId: null,
        pinnedOnly: false,
        limit: 10,
        offset: 0,
      }).total,
    ).toBe(1)
    expect(
      storage.items.query({
        filter: 'text',
        boardId: null,
        pinnedOnly: false,
        limit: 10,
        offset: 0,
      }).total,
    ).toBe(1)
    expect(
      storage.items.query({ filter: 'all', boardId: null, pinnedOnly: false, limit: 10, offset: 0 })
        .total,
    ).toBe(2)
  })

  it('orders pinned first then recent', () => {
    const a = addText('old', 'a')
    const b = addText('new', 'b')
    storage.items.touch(b, Date.now() + 5000)
    storage.items.setPinned(a, true)
    const { items } = storage.items.query({
      filter: 'all',
      boardId: null,
      pinnedOnly: false,
      limit: 10,
      offset: 0,
    })
    expect(items[0]?.id).toBe(a)
  })

  it('a copied (touched) item jumps to the front, after pinned items', () => {
    // Models clicking the copy icon: copyItem touches the item, which must move
    // it to the front of the list but never ahead of a pinned item.
    const pin = addText('pin', 'p')
    const x = addText('x', 'x')
    const y = addText('y', 'y')
    storage.items.setPinned(pin, true)
    // Distinct recency, x oldest then y.
    storage.items.touch(x, 1000)
    storage.items.touch(y, 2000)
    // Copying x touches it to "now"; it should pass y but stay behind the pin.
    storage.items.touch(x, 3000)
    const { items } = storage.items.query({
      filter: 'all',
      boardId: null,
      pinnedOnly: false,
      limit: 10,
      offset: 0,
    })
    expect(items.map((i) => i.id)).toEqual([pin, x, y])
  })

  it('soft deletes and excludes from queries', () => {
    const id = addText('bye', 'x')
    storage.items.softDelete(id)
    expect(
      storage.items.query({ filter: 'all', boardId: null, pinnedOnly: false, limit: 10, offset: 0 })
        .total,
    ).toBe(0)
    expect(storage.items.getById(id)?.deletedAt).not.toBeNull()
  })

  it('reports stats', () => {
    addText('aaaa', 'a')
    addText('bb', 'b')
    const stats = storage.items.stats()
    expect(stats.itemCount).toBe(2)
    expect(stats.totalBytes).toBe(6)
  })

  it('updateText reclassifies the type (edit a note into a url)', () => {
    const id = addText('a plain note', 'h')
    const updated = storage.items.updateText(id, {
      type: 'url',
      previewText: 'https://tora.app',
      contentHash: 'url:https://tora.app',
      byteSize: 16,
      metadata: { kind: 'url', url: 'https://tora.app', host: 'tora.app' },
    })
    expect(updated?.type).toBe('url')
    expect(updated?.metadata.kind).toBe('url')
  })

  it('records sync state on insert', () => {
    const id = addText('synced', 'h')
    const row = storage.db
      .prepare('SELECT dirty, deleted FROM sync_state WHERE record_type = ? AND record_id = ?')
      .get('item', id) as { dirty: number; deleted: number }
    expect(row.dirty).toBe(1)
    expect(row.deleted).toBe(0)
  })
})

describe('BoardsRepo', () => {
  it('creates, renames, and reorders boards', () => {
    const b = storage.boards.create('Snippets')
    expect(b.name).toBe('Snippets')
    storage.boards.rename(b.id, 'Code')
    expect(storage.boards.getById(b.id)?.name).toBe('Code')
    const c = storage.boards.create('Design')
    storage.boards.reorder([c.id, b.id])
    const list = storage.boards.list().filter((x) => x.id !== 'board-favourites')
    expect(list.map((x) => x.id)).toEqual([c.id, b.id])
  })

  it('cannot delete the favourites board', () => {
    storage.boards.remove('board-favourites')
    expect(storage.boards.getById('board-favourites')?.deletedAt).toBeNull()
  })

  it('adds, queries, and reorders board items', () => {
    const board = storage.boards.create('B')
    const i1 = addText('one', '1')
    const i2 = addText('two', '2')
    storage.boards.addItem(board.id, i1)
    storage.boards.addItem(board.id, i2)
    storage.boards.addItem(board.id, i1) // dedup, no-op
    const inBoard = storage.items.query({
      filter: 'all',
      boardId: board.id,
      pinnedOnly: false,
      limit: 10,
      offset: 0,
    })
    expect(inBoard.total).toBe(2)
    storage.boards.reorderItems(board.id, [i2, i1])
    const reordered = storage.items.query({
      filter: 'all',
      boardId: board.id,
      pinnedOnly: false,
      limit: 10,
      offset: 0,
    })
    expect(reordered.items[0]?.id).toBe(i2)
    expect(storage.boards.boardsForItem(i1)).toContain(board.id)
  })
})

describe('SettingsRepo', () => {
  it('returns defaults then merges patches', () => {
    expect(storage.settings.get().theme).toBe('system')
    const next = storage.settings.update({ theme: 'dark', captureEnabled: false })
    expect(next.theme).toBe('dark')
    expect(next.captureEnabled).toBe(false)
    expect(storage.settings.get().globalHotkey).toBe('CommandOrControl+Shift+V')
  })
})
