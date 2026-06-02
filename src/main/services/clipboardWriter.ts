import { clipboard, nativeImage } from 'electron'
import { pathToFileURL } from 'node:url'
import type { ClipItem } from '@core/model'
import type { PasteFormat } from '@shared/ipc'
import type { Storage } from '../storage'

/**
 * Writes a stored clip back onto the system clipboard. "keep" restores every
 * representation (text + html + rtf, or the image/files); "plain" writes only
 * the plain-text form. Returns the plain text written so the watcher can
 * suppress the resulting self-copy echo.
 */
export class ClipboardWriter {
  constructor(private readonly storage: Storage) {}

  async write(item: ClipItem, format: PasteFormat): Promise<string> {
    const ref = item.contentRef

    if (item.type === 'image' && ref) {
      const buf = await this.storage.blobs.readBuffer(ref, 'image.png')
      if (buf) {
        clipboard.writeImage(nativeImage.createFromBuffer(buf))
        return ''
      }
    }

    if (item.type === 'file' && item.metadata.kind === 'file') {
      const first = item.metadata.paths[0]
      if (first && process.platform === 'darwin') {
        clipboard.writeBuffer('public.file-url', Buffer.from(pathToFileURL(first).toString()))
      }
      clipboard.writeText(item.metadata.paths.join('\n'))
      return item.metadata.paths.join('\n')
    }

    const text = ref
      ? ((await this.storage.blobs.readText(ref, 'text.txt')) ?? item.previewText)
      : item.previewText

    if (format === 'plain') {
      clipboard.writeText(text)
      return text
    }

    const html = ref ? await this.storage.blobs.readText(ref, 'content.html') : null
    const rtf = ref ? await this.storage.blobs.readText(ref, 'content.rtf') : null

    clipboard.write({
      text,
      ...(html ? { html } : {}),
      ...(rtf ? { rtf } : {}),
    })
    return text
  }
}
