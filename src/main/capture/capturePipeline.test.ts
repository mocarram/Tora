import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Storage } from '../storage'
import { CapturePipeline } from './capturePipeline'

let dir: string
let storage: Storage
let pipeline: CapturePipeline

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tora-cap-'))
  storage = new Storage({ dbFile: join(dir, 'tora.db'), blobDir: join(dir, 'blobs') })
  await storage.init()
  pipeline = new CapturePipeline(storage)
})

afterEach(() => {
  storage.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('CapturePipeline', () => {
  it('ignores concealed content (passwords never stored)', async () => {
    const r = await pipeline.ingest({ text: 'hunter2', concealed: true })
    expect(r.kind).toBe('ignored')
    expect(storage.items.stats().itemCount).toBe(0)
  })

  it('ignores excluded source apps', async () => {
    const r = await pipeline.ingest({ text: 'secret', sourceBundleId: 'com.1password.1password' })
    expect(r.kind).toBe('ignored')
  })

  it('captures text and writes the blob to disk', async () => {
    const r = await pipeline.ingest({ text: 'a captured note', sourceApp: 'Notes' })
    expect(r.kind).toBe('added')
    expect(r.item?.type).toBe('text')
    expect(r.item?.contentRef).not.toBeNull()
    const blob = await storage.blobs.readText(r.item!.contentRef!, 'text.txt')
    expect(blob).toBe('a captured note')
  })

  it('dedups consecutive identical copies by bumping timestamp', async () => {
    const first = await pipeline.ingest({ text: 'same' })
    const second = await pipeline.ingest({ text: 'same' })
    expect(second.kind).toBe('deduped')
    expect(second.item?.id).toBe(first.item?.id)
    expect(storage.items.stats().itemCount).toBe(1)
    expect(second.item!.updatedAt).toBeGreaterThanOrEqual(first.item!.updatedAt)
  })

  it('stores rich text html alongside text', async () => {
    const r = await pipeline.ingest({ text: 'Hello there world', html: '<b>Hello</b>' })
    expect(r.item?.type).toBe('richText')
    expect(await storage.blobs.readText(r.item!.contentRef!, 'content.html')).toBe('<b>Hello</b>')
  })

  it('classifies urls, colours, and code', async () => {
    expect((await pipeline.ingest({ text: 'https://tora.app' })).item?.type).toBe('url')
    expect((await pipeline.ingest({ text: '#E8843C' })).item?.type).toBe('color')
    expect((await pipeline.ingest({ text: 'const f = () => {\n  return 1\n}' })).item?.type).toBe(
      'code',
    )
  })

  it('totals blob bytes on disk', async () => {
    await pipeline.ingest({ text: 'measure me please' })
    expect(await storage.blobs.totalBytes()).toBeGreaterThan(0)
  })
})
