import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  })

  it('keeps pinned items past the window', async () => {
    storage.settings.update({ retentionDays: 7 })
    const pinned = (await pipeline.ingest({ text: 'keep me' })).item!
    storage.items.setPinned(pinned.id, true)
    ageItem(pinned.id, 100)
    expect(await new RetentionService(storage).runOnce()).toBe(0)
    expect(storage.items.getById(pinned.id)).not.toBeNull()
  })

  it('is a no-op when retention is unlimited', async () => {
    storage.settings.update({ retentionDays: null })
    const item = (await pipeline.ingest({ text: 'forever' })).item!
    ageItem(item.id, 9999)
    expect(await new RetentionService(storage).runOnce()).toBe(0)
    expect(storage.items.getById(item.id)).not.toBeNull()
  })
})
