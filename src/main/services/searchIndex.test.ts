import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Storage } from '../storage'
import { CapturePipeline } from '../capture/capturePipeline'
import { SearchIndex } from './searchIndex'

let dir: string
let storage: Storage
let pipeline: CapturePipeline
let index: SearchIndex

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tora-idx-'))
  storage = new Storage({ dbFile: join(dir, 'tora.db'), blobDir: join(dir, 'blobs') })
  await storage.init()
  pipeline = new CapturePipeline(storage)
  index = new SearchIndex(storage)
})

afterEach(() => {
  storage.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('SearchIndex', () => {
  it('ranks matching items and excludes non-matches', async () => {
    await pipeline.ingest({ text: 'design tokens for tora', sourceApp: 'Figma' })
    await pipeline.ingest({ text: 'a shopping list', sourceApp: 'Notes' })
    await pipeline.ingest({ text: 'const spring = 520', sourceApp: 'VS Code' })

    const ids = index.search('tokens')
    expect(ids).toHaveLength(1)
    const item = storage.items.getById(ids[0]!)
    expect(item?.previewText).toContain('design tokens')
  })

  it('matches on source app (secondary field)', async () => {
    await pipeline.ingest({ text: 'whatever', sourceApp: 'Figma' })
    expect(index.search('figma').length).toBe(1)
  })

  it('rebuilds after new captures mark it stale', async () => {
    await pipeline.ingest({ text: 'first note' })
    expect(index.search('note')).toHaveLength(1)
    await pipeline.ingest({ text: 'second note' })
    index.markStale()
    expect(index.search('note')).toHaveLength(2)
  })
})
