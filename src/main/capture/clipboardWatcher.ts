import { clipboard, type NativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import { realpathSync, statSync } from 'node:fs'
import { hashBytes, hashBytes32, hashString } from '@core/hash'
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
  /**
   * Image + encoded PNG carried over from the snapshot that just captured, so
   * imageBlobs() does not re-read the clipboard and re-encode the same image
   * (readImage is an IPC round-trip; toPNG on a 4K screenshot is slow).
   */
  private pendingImage: { img: NativeImage; png: Buffer } | null = null

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
    const formats = clipboard.availableFormats()
    let imageSig = ''
    // Only touch the image pipeline when the pasteboard actually advertises an
    // image: readImage() is an IPC round-trip plus a native bitmap copy, far
    // too heavy for every 500ms tick of a text-only clipboard.
    if (!textOverride && formats.some((f) => f.startsWith('image/'))) {
      const img = clipboard.readImage()
      if (!img.isEmpty()) {
        const { width, height } = img.getSize()
        // Dimensions alone collide constantly (e.g. consecutive iPhone
        // screenshots share the same WxH), so a dimensions-only signature treats
        // the next one as "no change" and drops it. Fold in a hash of a
        // downscaled bitmap so different pixels yield a different signature. 256px
        // (not a tiny thumbnail) keeps enough detail that even similar-looking
        // screenshots differ. hashBytes32 (Math.imul, no per-byte BigInt) keeps
        // the tick sub-millisecond while an image sits on the clipboard; the
        // signature is ephemeral so the narrower hash is fine.
        const small = img.resize({ width: 256 })
        imageSig = `img:${width}x${height}:${hashBytes32(small.toBitmap())}`
      }
    }
    return hashString(`${text}|${imageSig}|${formats.join(',')}`)
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
    // Whatever the handler did (consumed it, deduped, errored), do not pin a
    // multi-megabyte PNG in memory past the tick that produced it.
    this.pendingImage = null
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
    this.pendingImage = null
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
        // Keep the decoded image + PNG for imageBlobs() so persisting the blob
        // does not read and encode the same clipboard image a second time.
        this.pendingImage = { img, png }
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

  /**
   * Capture the just-snapshotted image's buffers for blob persistence (full +
   * thumbnail). Prefers the image carried over from readSnapshot (no second
   * clipboard read / PNG encode); falls back to a fresh read if none is pending.
   */
  imageBlobs(): { ext: string; full: Uint8Array; thumbnail: Uint8Array } | null {
    const pending = this.pendingImage
    this.pendingImage = null
    const img = pending?.img ?? clipboard.readImage()
    if (img.isEmpty()) return null
    const full = pending?.png ?? img.toPNG()
    // Only downscale (never upscale, which would blur small images). A 1024px
    // cap keeps card thumbnails sharp on retina without storing the full asset.
    const { width } = img.getSize()
    const thumbnail = width > 1024 ? img.resize({ width: 1024, quality: 'best' }).toPNG() : full
    return { ext: 'png', full, thumbnail }
  }
}
