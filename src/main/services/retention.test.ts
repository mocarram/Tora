import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Storage } from '../storage'
import { CapturePipeline } from '../capture/capturePipeline'
import { RetentionService } from './retention'

let dir: string
let storage: Storage
let pipeline: CapturePipeline

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tora-ret-'))
  storage = new Storage({ dbFile: join(dir, 'tora.db'), blobDir: join(dir, 'blobs') })
  await storage.init()
  pipeline = new CapturePipeline(storage)
})

afterEach(() => {
  storage.close()
  rmSync(dir, { recursive: true, force: true })
})

function ageItem(id: string, days: number): void {
  const ts = Date.now() - days * 86_400_000
  storage.db.prepare('UPDATE items SET updated_at = ?, created_at = ? WHERE id = ?').run(ts, ts, id)
}

describe('RetentionService', () => {
  it('prunes expired non-pinned items and their blobs', async () => {
    storage.settings.update({ retentionDays: 30 })
    const old = (await pipeline.ingest({ text: 'old note' })).item!
    const fresh = (await pipeline.ingest({ text: 'fresh note' })).item!
    ageItem(old.id, 40)

    const service = new RetentionService(storage)
    const pruned = await service.runOnce()

    expect(pruned).toBe(1)
    expect(storage.items.getById(old.id)).toBeNull()
    expect(storage.items.getById(fresh.id)).not.toBeNull()
    expect(storage.blobs.has(old.contentRef!, 'text.txt')).toBe(false)

    // A prune must leave a sync tombstone so a peer does not resurrect the item.
    const tombstone = storage.db
      .prepare('SELECT deleted FROM sync_state WHERE record_type = ? AND record_id = ?')
      .get('item', old.id) as { deleted: number } | undefined
    expect(tombstone?.deleted).toBe(1)
  })

  it('keeps pinned items past the window', async () => {
    storage.settings.update({ retentionDays: 7 })
    const pinned = (await pipeline.ingest({ text: 'keep me' })).item!
    storage.items.setPinned(pinned.id, true)
    ageItem(pinned.id, 100)
    expect(await new RetentionService(storage).runOnce()).toBe(0)
    expect(storage.items.getById(pinned.id)).not.toBeNull()
  })

  it('keeps items that belong to a board, then prunes once removed', async () => {
    storage.settings.update({ retentionDays: 30 })
    const item = (await pipeline.ingest({ text: 'on a board' })).item!
    const board = storage.boards.create('Keep')
    storage.boards.addItem(board.id, item.id)
    ageItem(item.id, 40)

    // Board membership exempts the item from retention.
    expect(await new RetentionService(storage).runOnce()).toBe(0)
    expect(storage.items.getById(item.id)).not.toBeNull()

    // Once removed from all boards it follows the normal retention schedule.
    storage.boards.removeItem(board.id, item.id)
    expect(await new RetentionService(storage).runOnce()).toBe(1)
    expect(storage.items.getById(item.id)).toBeNull()
  })

  it('re-checks each candidate before pruning (pin landed mid-loop survives)', async () => {
    storage.settings.update({ retentionDays: 30 })
    const a = (await pipeline.ingest({ text: 'expired A' })).item!
    const b = (await pipeline.ingest({ text: 'expired B' })).item!
    ageItem(a.id, 40)
    ageItem(b.id, 40)

    // The loop awaits blob removal between deletes; simulate the user pinning
    // the OTHER item during that window. Without the stillExpirable re-check
    // the stale snapshot would delete it anyway.
    const byRef = new Map([
      [a.contentRef!, b.id],
      [b.contentRef!, a.id],
    ])
    const realRemove = storage.blobs.remove.bind(storage.blobs)
    vi.spyOn(storage.blobs, 'remove').mockImplementation(async (ref: string) => {
      const other = byRef.get(ref)
      if (other && storage.items.getById(other)) storage.items.setPinned(other, true)
      return realRemove(ref)
    })

    const pruned = await new RetentionService(storage).runOnce()
    expect(pruned).toBe(1)
    // Exactly one survived: the one pinned while the loop was running.
    const survivors = [a.id, b.id].filter((id) => storage.items.getById(id) !== null)
    expect(survivors).toHaveLength(1)
    expect(storage.items.getById(survivors[0]!)?.isPinned).toBe(true)
  })

  it('is a no-op when retention is unlimited', async () => {
    storage.settings.update({ retentionDays: null })
    const item = (await pipeline.ingest({ text: 'forever' })).item!
    ageItem(item.id, 9999)
    expect(await new RetentionService(storage).runOnce()).toBe(0)
    expect(storage.items.getById(item.id)).not.toBeNull()
  })
})
