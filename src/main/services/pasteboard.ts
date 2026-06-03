import { clipboard, nativeImage } from 'electron'
import { pathToFileURL } from 'node:url'
import { buildFilenamesPlist } from './filenamesPlist'

/**
 * Abstraction over the system pasteboard so the write logic (which
 * representation to put down for each item type, file-cache restoration, etc.)
 * is unit-testable without Electron. `ElectronPasteboard` is the real impl;
 * tests use a fake that records what was written.
 */
export interface Pasteboard {
  writeText(text: string): void
  writeRich(parts: { text: string; html?: string | null; rtf?: string | null }): void
  writeImagePng(png: Buffer): void
  /** Put one or more files on the pasteboard so a paste copies the file(s). */
  writeFiles(paths: string[]): void
}

export class ElectronPasteboard implements Pasteboard {
  writeText(text: string): void {
    clipboard.writeText(text)
  }

  writeRich(parts: { text: string; html?: string | null; rtf?: string | null }): void {
    clipboard.write({
      text: parts.text,
      ...(parts.html ? { html: parts.html } : {}),
      ...(parts.rtf ? { rtf: parts.rtf } : {}),
    })
  }

  writeImagePng(png: Buffer): void {
    clipboard.writeImage(nativeImage.createFromBuffer(png))
  }

  writeFiles(paths: string[]): void {
    if (paths.length === 0) return
    if (process.platform === 'darwin') {
      // NSFilenamesPboardType covers one-or-many files for Finder and most apps.
      clipboard.writeBuffer(
        'NSFilenamesPboardType',
        Buffer.from(buildFilenamesPlist(paths), 'utf8'),
      )
      const first = paths[0]
      if (first) {
        clipboard.writeBuffer(
          'public.file-url',
          Buffer.from(pathToFileURL(first).toString(), 'utf8'),
        )
      }
    } else {
      clipboard.writeText(paths.join('\n'))
    }
  }
}
