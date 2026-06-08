import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BlobStore, isSafeBlobSegment } from './blobStore'

let dir: string
let blobs: BlobStore

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tora-blob-'))
  blobs = new BlobStore(join(dir, 'blobs'))
  await blobs.init()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('isSafeBlobSegment', () => {
  it('accepts generated ids and allow-listed blob names', () => {
    for (const ok of ['abc123XYZ_-0', 'text.txt', 'content.html', 'image.png', 'thumb.png', 'f0']) {
      expect(isSafeBlobSegment(ok)).toBe(true)
    }
  })

  it('rejects anything that could escape the blob root', () => {
    for (const bad of ['', '.', '..', '../x', 'a/b', 'a\\b', '/abs', 'a\0b']) {
      expect(isSafeBlobSegment(bad)).toBe(false)
    }
  })
})

describe('BlobStore path-traversal guard', () => {
  it('round-trips a normal ref', async () => {
    await blobs.writeText('item123', 'text.txt', 'hello')
    expect(blobs.has('item123', 'text.txt')).toBe(true)
    expect(await blobs.readText('item123', 'text.txt')).toBe('hello')
  })

  it('refuses to write outside the base dir via a crafted ref', async () => {
    const escapeRef = join('..', '..', 'escaped')
    await expect(blobs.writeBuffer(escapeRef, 'text.txt', Buffer.from('x'))).rejects.toThrow()
    // Nothing must have been written above the blob root.
    expect(existsSync(join(dir, 'escaped'))).toBe(false)
  })

  it('refuses a crafted name as well', async () => {
    await expect(blobs.writeText('item123', '../escaped.txt', 'x')).rejects.toThrow()
    expect(existsSync(join(dir, 'escaped.txt'))).toBe(false)
  })
})
