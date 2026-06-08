import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { secureDir } from './dataSecurity'

/**
 * A blob ref is a generated nanoid and a name is from a fixed allowlist, so any
 * value carrying a path separator, "." or ".." is hostile - and a ref can reach
 * here from a sync peer's records. Validate before it is joined into a path so a
 * crafted ref cannot escape the blob root (e.g. "../../Library/...").
 */
export function isSafeBlobSegment(seg: string): boolean {
  return seg.length > 0 && seg !== '.' && seg !== '..' && /^[A-Za-z0-9_.-]+$/.test(seg)
}

function assertSafeSegments(ref: string, name?: string): void {
  if (!isSafeBlobSegment(ref) || (name !== undefined && !isSafeBlobSegment(name))) {
    throw new Error('Unsafe blob path segment')
  }
}

/**
 * On-disk blob store. Large payloads (full text, HTML, RTF, images, thumbnails)
 * live here and are referenced from SQLite by a relative ref. Blobs are NEVER
 * inlined in the database. Each item owns a subdirectory named by its id.
 */
export class BlobStore {
  constructor(private readonly baseDir: string) {}

  async init(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true })
    // Blobs are clipboard payloads (images, full text); keep the tree owner-only.
    await secureDir(this.baseDir)
  }

  private dirFor(ref: string): string {
    assertSafeSegments(ref)
    return join(this.baseDir, ref)
  }

  /** Absolute path of a named file within an item's blob dir. */
  filePath(ref: string, name: string): string {
    assertSafeSegments(ref, name)
    return join(this.baseDir, ref, name)
  }

  async writeText(ref: string, name: string, content: string): Promise<void> {
    await mkdir(this.dirFor(ref), { recursive: true })
    await writeFile(this.filePath(ref, name), content, 'utf8')
  }

  async writeBuffer(ref: string, name: string, data: Uint8Array): Promise<void> {
    await mkdir(this.dirFor(ref), { recursive: true })
    await writeFile(this.filePath(ref, name), data)
  }

  async readText(ref: string, name: string): Promise<string | null> {
    try {
      return await readFile(this.filePath(ref, name), 'utf8')
    } catch {
      return null
    }
  }

  async readBuffer(ref: string, name: string): Promise<Buffer | null> {
    try {
      return await readFile(this.filePath(ref, name))
    } catch {
      return null
    }
  }

  has(ref: string, name: string): boolean {
    return existsSync(this.filePath(ref, name))
  }

  /** Remove an item's entire blob directory. */
  async remove(ref: string): Promise<void> {
    await rm(this.dirFor(ref), { recursive: true, force: true })
  }

  /** Remove every blob. Used by the full data wipe; the dir is recreated empty. */
  async clear(): Promise<void> {
    await rm(this.baseDir, { recursive: true, force: true })
    await mkdir(this.baseDir, { recursive: true })
  }

  /** Total bytes used by all blobs (walks one level of item dirs). */
  async totalBytes(): Promise<number> {
    let total = 0
    let entries: string[]
    try {
      entries = await readdir(this.baseDir)
    } catch {
      return 0
    }
    for (const entry of entries) {
      const dir = join(this.baseDir, entry)
      let files: string[]
      try {
        files = await readdir(dir)
      } catch {
        continue
      }
      for (const f of files) {
        try {
          total += (await stat(join(dir, f))).size
        } catch {
          // ignore vanished files
        }
      }
    }
    return total
  }
}
