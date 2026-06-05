import { app } from 'electron'
import { execFile } from 'node:child_process'

/**
 * Resolves the icon of the application a clip was copied from, so a card can
 * show "where this came from" (like Paste). Keyed by bundle id and cached for
 * the process lifetime - there are only a handful of source apps, and an app's
 * icon does not change while Tora runs. Negative results are cached too, so a
 * missing app is not re-resolved on every card render.
 *
 * macOS only and best-effort: returns null on other platforms (including the
 * Linux build/CI host), on an unresolvable bundle id, or on any failure. The
 * card falls back to its type glyph. Not runtime-verified here; see GAPS.md.
 */

const ICON_PX = 32
const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

// Bundle ids are reverse-DNS: letters, digits, dot, hyphen. Anything else is
// rejected before it reaches osascript, so the value can never break out of the
// AppleScript string literal (no quotes, backslashes, or newlines get through).
const BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]*$/

export async function getAppIconDataUrl(bundleId: string): Promise<string | null> {
  if (process.platform !== 'darwin') return null
  if (!bundleId || !BUNDLE_ID.test(bundleId)) return null
  if (cache.has(bundleId)) return cache.get(bundleId) ?? null

  let pending = inflight.get(bundleId)
  if (!pending) {
    pending = resolve(bundleId).then((url) => {
      cache.set(bundleId, url)
      inflight.delete(bundleId)
      return url
    })
    inflight.set(bundleId, pending)
  }
  return pending
}

async function resolve(bundleId: string): Promise<string | null> {
  try {
    const path = await appPath(bundleId)
    if (!path) return null
    // `POSIX path of` an .app bundle ends in a slash; strip it so getFileIcon
    // reads the application icon rather than a generic folder icon.
    const icon = await app.getFileIcon(path.replace(/\/$/, ''), { size: 'normal' })
    if (icon.isEmpty()) return null
    const png = icon.resize({ width: ICON_PX, height: ICON_PX, quality: 'best' }).toPNG()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

function appPath(bundleId: string): Promise<string | null> {
  const script = `POSIX path of (path to application id "${bundleId}")`
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 1500 }, (err, stdout) => {
      if (err) {
        resolve(null)
        return
      }
      const path = stdout.trim()
      resolve(path.length > 0 ? path : null)
    })
  })
}
