import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Storage } from '../storage'
import { CapturePipeline } from '../capture/capturePipeline'
import { ICloudDriveController } from './icloudDrive'
import { generateKey } from './crypto'
import type { AppSettings } from '@shared/ipc'
import { DEFAULT_SETTINGS } from '../storage/settingsRepo'

/**
 * Verifies file-based sync between TWO instances pointed at one shared folder
 * (the local stand-in for iCloud Drive). This is a real, runnable check on any
 * host; true cross-device iCloud propagation is unverified (see GAPS.md).
 */
let root: string
let shared: string
let key: Buffer
const settings: AppSettings = { ...DEFAULT_SETTINGS, syncProvider: 'icloud' }

interface Instance {
  storage: Storage
  pipeline: CapturePipeline
  sync: ICloudDriveController
  dir: string
}

function makeInstance(deviceId: string): Instance {
  const dir = mkdtempSync(join(root, `dev-${deviceId}-`))
  const storage = new Storage({ dbFile: join(dir, 'tora.db'), blobDir: join(dir, 'blobs') })
  const pipeline = new CapturePipeline(storage)
  const sync = new ICloudDriveController(storage, shared, key, deviceId, () => settings)
  return { storage, pipeline, sync, dir }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tora-sync-'))
  shared = join(root, 'shared')
  key = generateKey()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('ICloudDriveController (two instances, shared folder)', () => {
  it('propagates a captured item from A to B with its blob', async () => {
    const a = makeInstance('A')
    const b = makeInstance('B')
    await a.storage.init()
    await b.storage.init()
    await a.sync.start()
    await b.sync.start()

    const added = (await a.pipeline.ingest({ text: 'shared across devices' })).item!
    await a.sync.syncNow() // push from A
    await b.sync.syncNow() // pull into B

    const onB = b.storage.items.getById(added.id)
    expect(onB?.previewText).toBe('shared across devices')
    expect(await b.storage.blobs.readText(onB!.contentRef!, 'text.txt')).toBe(
      'shared across devices',
    )

    a.storage.close()
    b.storage.close()
  })

  it('writes only ciphertext to the shared folder', async () => {
    const a = makeInstance('A')
    await a.storage.init()
    await a.sync.start()
    await a.pipeline.ingest({ text: 'topsecretmarker' })
    await a.sync.syncNow()

    const { readFileSync, readdirSync } = await import('node:fs')
    const files = readdirSync(join(shared, 'records'))
    const blob = readFileSync(join(shared, 'records', files[0]!))
    expect(blob.includes(Buffer.from('topsecretmarker'))).toBe(false)
    a.storage.close()
  })

  it('resolves deletes as tombstones across devices', async () => {
    const a = makeInstance('A')
    const b = makeInstance('B')
    await a.storage.init()
    await b.storage.init()
    await a.sync.start()
    await b.sync.start()

    const item = (await a.pipeline.ingest({ text: 'delete me' })).item!
    await a.sync.syncNow()
    await b.sync.syncNow()
    expect(b.storage.items.getById(item.id)).not.toBeNull()

    a.storage.items.softDelete(item.id)
    a.storage.items.hardDelete(item.id)
    await a.sync.syncNow()
    await b.sync.syncNow()

    expect(b.storage.items.getById(item.id)).toBeNull()
    a.storage.close()
    b.storage.close()
  })

  it('last-writer-wins on concurrent edits', async () => {
    const a = makeInstance('A')
    const b = makeInstance('B')
    await a.storage.init()
    await b.storage.init()
    await a.sync.start()
    await b.sync.start()

    const item = (await a.pipeline.ingest({ text: 'original' })).item!
    await a.sync.syncNow()
    await b.sync.syncNow()

    // Both edit; B's change is stamped later, so B should win everywhere.
    const base = Date.now()
    a.storage.items.touch(item.id, base + 10_000)
    b.storage.items.updateText(item.id, {
      type: 'text',
      previewText: 'edited on B',
      contentHash: 'hb',
      byteSize: 11,
      metadata: { kind: 'text', charCount: 11, wordCount: 3 },
    })
    a.storage.db
      .prepare('UPDATE sync_state SET updated_at = ? WHERE record_type = ? AND record_id = ?')
      .run(base + 10_000, 'item', item.id)
    b.storage.db
      .prepare('UPDATE sync_state SET updated_at = ? WHERE record_type = ? AND record_id = ?')
      .run(base + 20_000, 'item', item.id)

    await a.sync.syncNow()
    await b.sync.syncNow()
    await a.sync.syncNow()

    expect(a.storage.items.getById(item.id)?.previewText).toBe('edited on B')
    a.storage.close()
    b.storage.close()
  })
})
