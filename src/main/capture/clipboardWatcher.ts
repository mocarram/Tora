import { clipboard } from 'electron'
import { fileURLToPath } from 'node:url'
import { realpathSync, statSync } from 'node:fs'
import { hashBytes, hashString } from '@core/hash'
import type { CaptureInput } from '@core/capture'
import { parseFilenamesPlist } from '../services/filenamesPlist'

/**
 * Low-frequency pasteboard observer. Polls at a relaxed interval (event-driven
 * change notifications are not exposed cross-platform by Electron) and only does
 * real work when a cheap signature changes, so idle CPU stays near zero.
 *
 * Honours macOS concealed/transient markers and suppresses the app's own writes
 * to avoid a copy/paste feedback loop. macOS pasteboard specifics are not
 * runtime-verified on this Linux host; see GAPS.md.
 */
const CONCEALED_TYPES = ['org.nspasteboard.ConcealedType', 'org.nspasteboard.TransientType']

export type CaptureHandler = (input: CaptureInput) => void | Promise<void>

export class ClipboardWatcher {
  private timer: NodeJS.Timeout | null = null
  private lastSignature = ''
  private selfWriteSignature: string | null = null
  private enabled = true

  constructor(
    private readonly onCapture: CaptureHandler,
    private readonly intervalMs = 500,
  ) {}

  start(): void {
    if (this.timer) return
    // Seed the signature so we do not capture whatever predates app launch.
    this.lastSignature = this.signature()
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    if (this.timer.unref) this.timer.unref()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    // Re-seed so resuming does not capture clipboard changes made while paused.
    if (enabled) this.lastSignature = this.signature()
  }

  /** Tell the watcher we just wrote this text, so it skips the echo. */
  markSelfCopy(text: string): void {
    this.selfWriteSignature = this.signature(text)
  }

  private signature(textOverride?: string): string {
    const text = textOverride ?? clipboard.readText()
    let imageSig = ''
    if (!textOverride) {
      const img = clipboard.readImage()
      if (!img.isEmpty()) {
        const { width, height } = img.getSize()
        imageSig = `img:${width}x${height}`
      }
    }
    const formats = clipboard.availableFormats().join(',')
    return hashString(`${text}|${imageSig}|${formats}`)
  }

  private isConcealed(): boolean {
    return CONCEALED_TYPES.some((t) => {
      try {
        return clipboard.has(t)
      } catch {
        return false
      }
    })
  }

  private async tick(): Promise<void> {
    if (!this.enabled) return
    const sig = this.signature()
    if (sig === this.lastSignature) return
    this.lastSignature = sig
    if (sig === this.selfWriteSignature) {
      this.selfWriteSignature = null
      return
    }

    const input = this.readSnapshot()
    if (input) await this.onCapture(input)
  }

  /** Build a CaptureInput from the current pasteboard. */
  private readSnapshot(): CaptureInput | null {
    if (this.isConcealed()) return { concealed: true }

    const text = clipboard.readText() || null
    // macOS synthesises an HTML (and sometimes RTF) representation of plain text
    // on read, so readHTML()/readRTF() return a phantom copy of the text even
    // when no rich flavour was ever placed on the pasteboard. Trust them only
    // when the pasteboard actually advertises the format, otherwise every plain
    // copy would be misclassified as richText and the `text` type never appears.
    const formats = clipboard.availableFormats()
    const html = formats.includes('text/html') ? clipboard.readHTML() || null : null
    const rtf = formats.includes('text/rtf') ? clipboard.readRTF() || null : null
    const filePaths = this.readFilePaths()

    let image: CaptureInput['image'] = null
    if (!text && (!filePaths || filePaths.length === 0)) {
      const img = clipboard.readImage()
      if (!img.isEmpty()) {
        const png = img.toPNG()
        const { width, height } = img.getSize()
        image = {
          format: 'png',
          width,
          height,
          byteLength: png.byteLength,
          hash: hashBytes(png),
        }
      }
    }

    if (!text && !html && !rtf && !image && (!filePaths || filePaths.length === 0)) {
      return null
    }

    return {
      text,
      html,
      rtf,
      image,
      filePaths,
      fileSizes: filePaths ? this.fileSizes(filePaths) : null,
    }
  }

  /**
   * macOS file copy. Reads the NSFilenamesPboardType plist for one-or-many real
   * paths, falling back to a single public.file-url. macOS often hands over an
   * opaque file-reference URL (file:///.file/id=...), so each path is resolved
   * to its real on-disk location via realpath.
   */
  private readFilePaths(): string[] | null {
    if (process.platform !== 'darwin') return null
    const fromPlist = this.readFilenamesPlist()
    if (fromPlist && fromPlist.length > 0) return fromPlist.map((p) => this.resolveRealPath(p))
    try {
      const url = clipboard.read('public.file-url')
      if (!url) return null
      return [this.resolveRealPath(fileURLToPath(url.trim()))]
    } catch {
      return null
    }
  }

  private readFilenamesPlist(): string[] | null {
    try {
      const buf = clipboard.readBuffer('NSFilenamesPboardType')
      if (!buf || buf.length === 0) return null
      const paths = parseFilenamesPlist(buf.toString('utf8'))
      return paths.length > 0 ? paths : null
    } catch {
      return null
    }
  }

  private resolveRealPath(p: string): string {
    try {
      return realpathSync(p)
    } catch {
      return p
    }
  }

  private fileSizes(paths: string[]): number[] {
    return paths.map((p) => {
      try {
        return statSync(p).size
      } catch {
        return 0
      }
    })
  }

  /** Capture a NativeImage's buffers for blob persistence (full + thumbnail). */
  static imageBlobs(): { ext: string; full: Uint8Array; thumbnail: Uint8Array } | null {
    const img = clipboard.readImage()
    if (img.isEmpty()) return null
    // Only downscale (never upscale, which would blur small images). A 1024px
    // cap keeps card thumbnails sharp on retina without storing the full asset.
    const { width } = img.getSize()
    const thumb = width > 1024 ? img.resize({ width: 1024, quality: 'best' }) : img
    return { ext: 'png', full: img.toPNG(), thumbnail: thumb.toPNG() }
  }
}
