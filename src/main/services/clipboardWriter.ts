import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ClipItem } from '@core/model'
import type { PasteFormat } from '@shared/ipc'
import type { Storage } from '../storage'
import type { Pasteboard } from './pasteboard'

/**
 * Writes a stored clip back onto the system pasteboard. "keep" restores every
 * representation (text + html + rtf, or the image/files); "plain" writes only
 * plain text. Returns the plain-text form written so the watcher can suppress
 * the resulting self-copy echo.
 *
 * Images are restored from the cached PNG blob (so a paste produces the real
 * image, not its description). Files are restored from cached bytes when the
 * original is gone, so a paste still works after the source file is deleted.
 */
export class ClipboardWriter {
  constructor(
    private readonly storage: Storage,
    private readonly pasteboard: Pasteboard,
    /** Directory used to materialise cached files for pasting. */
    private readonly restoreDir: string,
  ) {}

  async write(item: ClipItem, format: PasteFormat): Promise<string> {
    if (item.type === 'image' && item.contentRef) {
      const png = await this.storage.blobs.readBuffer(item.contentRef, 'image.png')
      if (png) {
        this.pasteboard.writeImagePng(png)
        return ''
      }
    }

    if (item.type === 'file' && item.metadata.kind === 'file') {
      const paths = await this.resolveFilePaths(item)
      if (paths.length > 0) {
        this.pasteboard.writeFiles(paths)
        return paths.join('\n')
      }
      // Nothing resolvable (original gone, nothing cached): fall back to the
      // path text so the user at least gets something.
      const text = item.metadata.paths.join('\n')
      this.pasteboard.writeText(text)
      return text
    }

    const ref = item.contentRef
    const text = ref
      ? ((await this.storage.blobs.readText(ref, 'text.txt')) ?? item.previewText)
      : item.previewText

    if (format === 'plain') {
      this.pasteboard.writeText(text)
      return text
    }

    const html = ref ? await this.storage.blobs.readText(ref, 'content.html') : null
    const rtf = ref ? await this.storage.blobs.readText(ref, 'content.rtf') : null
    this.pasteboard.writeRich({ text, html, rtf })
    return text
  }

  /**
   * Resolve the file paths to put on the pasteboard. Prefers the original path
   * when it still exists; otherwise materialises the cached copy to a temp file
   * so paste survives deletion of the source.
   */
  private async resolveFilePaths(item: ClipItem): Promise<string[]> {
    if (item.metadata.kind !== 'file') return []
    const { paths, names } = item.metadata
    const ref = item.contentRef
    const out: string[] = []

    for (let i = 0; i < paths.length; i++) {
      const original = paths[i]
      if (original && existsSync(original)) {
        out.push(original)
        continue
      }
      if (!ref) continue
      const cacheName = `f${i}`
      if (!this.storage.blobs.has(ref, cacheName)) continue
      const buf = await this.storage.blobs.readBuffer(ref, cacheName)
      if (!buf) continue
      const dir = join(this.restoreDir, item.id)
      await mkdir(dir, { recursive: true })
      const file = join(dir, names[i] ?? `file-${i}`)
      await writeFile(file, buf)
      out.push(file)
    }
    return out
  }
}
