import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Storage } from '../storage'
import { CapturePipeline } from '../capture/capturePipeline'
import { ClipboardWriter } from './clipboardWriter'
import type { Pasteboard } from './pasteboard'

class FakePasteboard implements Pasteboard {
  text: string | null = null
  rich: { text: string; html?: string | null; rtf?: string | null } | null = null
  imagePng: Buffer | null = null
  files: string[] | null = null
  writeText(t: string): void {
    this.text = t
  }
  writeRich(p: { text: string; html?: string | null; rtf?: string | null }): void {
    this.rich = p
  }
  writeImagePng(b: Buffer): void {
    this.imagePng = b
  }
  writeFiles(p: string[]): void {
    this.files = p
  }
}

let dir: string
let storage: Storage
let pipeline: CapturePipeline
let pb: FakePasteboard
let writer: ClipboardWriter

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tora-writer-'))
  storage = new Storage({ dbFile: join(dir, 'tora.db'), blobDir: join(dir, 'blobs') })
  await storage.init()
  pipeline = new CapturePipeline(storage)
  pb = new FakePasteboard()
  writer = new ClipboardWriter(storage, pb, join(dir, 'restore'))
})

afterEach(() => {
  storage.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('ClipboardWriter - text', () => {
  it('writes rich (text + html) for keep format', async () => {
    const item = (await pipeline.ingest({ text: 'Hello there', html: '<b>Hello there</b>' })).item!
    await writer.write(item, 'keep')
    expect(pb.rich?.text).toBe('Hello there')
    expect(pb.rich?.html).toBe('<b>Hello there</b>')
    expect(pb.text).toBeNull()
  })

  it('writes only plain text for plain format', async () => {
    const item = (await pipeline.ingest({ text: 'Hello there', html: '<b>x</b>' })).item!
    await writer.write(item, 'plain')
    expect(pb.text).toBe('Hello there')
    expect(pb.rich).toBeNull()
  })
})

describe('ClipboardWriter - image', () => {
  it('writes the real image bytes, not the preview text', async () => {
    const png = Buffer.from('89504e470d0a1a0a-fake-png-bytes', 'utf8')
    const result = await pipeline.ingest({
      image: { format: 'png', width: 703, height: 81, byteLength: png.length, hash: 'img1' },
    })
    const item = result.item!
    expect(item.contentRef).not.toBeNull() // regression: image must reference its blob
    await pipeline.attachImage(item.id, { ext: 'png', full: png, thumbnail: png })

    await writer.write(item, 'keep')
    expect(pb.imagePng?.equals(png)).toBe(true)
    expect(pb.text).toBeNull()
    expect(pb.rich).toBeNull()
  })
})

describe('ClipboardWriter - files', () => {
  it('uses the original path when it still exists', async () => {
    const src = join(dir, 'doc.txt')
    writeFileSync(src, 'file contents')
    const item = (await pipeline.ingest({ filePaths: [src], fileSizes: [13] })).item!
    await writer.write(item, 'keep')
    expect(pb.files).toEqual([src])
  })

  it('restores the cached copy when the original is deleted (paste survives deletion)', async () => {
    const src = join(dir, 'gone.txt')
    writeFileSync(src, 'precious bytes')
    const item = (await pipeline.ingest({ filePaths: [src], fileSizes: [14] })).item!
    expect(item.contentRef).not.toBeNull() // file bytes were cached

    rmSync(src) // user deletes the source file
    await writer.write(item, 'keep')

    expect(pb.files).toHaveLength(1)
    const restored = pb.files![0]!
    expect(restored).not.toBe(src)
    expect(existsSync(restored)).toBe(true)
    expect(readFileSync(restored, 'utf8')).toBe('precious bytes')
  })

  it('falls back to path text when original is gone and nothing was cached', async () => {
    // Capture a path that does not exist, so nothing is cached.
    const missing = join(dir, 'never.txt')
    const item = (await pipeline.ingest({ filePaths: [missing], fileSizes: [0] })).item!
    await writer.write(item, 'keep')
    expect(pb.files).toBeNull()
    expect(pb.text).toBe(missing)
  })
})
