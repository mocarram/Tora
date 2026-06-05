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
 * card simply shows nothing in that case. Not runtime-verified here; see
 * GAPS.md.
 */

const ICON_PX = 32
const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

// Bundle ids are reverse-DNS: letters, digits, dot, hyphen. Anything else is
// rejected before it reaches a subprocess, so the value cannot break out of the
// mdfind query or the AppleScript string (no quotes, backslashes, or newlines).
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
    const path = (await appPathViaSpotlight(bundleId)) ?? (await appPathViaOsascript(bundleId))
    if (!path) return null
    // A larger source icon downsamples to a crisp 32px tile.
    const icon = await app.getFileIcon(path, { size: 'large' })
    if (icon.isEmpty()) return null
    const png = icon.resize({ width: ICON_PX, height: ICON_PX, quality: 'best' }).toPNG()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Resolve the app bundle path from its id via Spotlight. Permission-free and
 * returns the real on-disk .app, unlike `path to application id`, which can hand
 * back a path whose icon resolves to the generic placeholder.
 */
function appPathViaSpotlight(bundleId: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'mdfind',
      [`kMDItemCFBundleIdentifier == '${bundleId}'`],
      { timeout: 1500 },
      (err, stdout) => {
        // Guarded: a throw inside this callback is async and would escape the
        // surrounding try/catch, crashing the main process.
        try {
          if (err) {
            resolve(null)
            return
          }
          const hit = (stdout || '')
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.endsWith('.app'))
          resolve(hit ?? null)
        } catch {
          resolve(null)
        }
      },
    )
  })
}

/** Fallback for apps Spotlight does not index (e.g. some system apps). */
function appPathViaOsascript(bundleId: string): Promise<string | null> {
  const script = `POSIX path of (path to application id "${bundleId}")`
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 1500 }, (err, stdout) => {
      try {
        if (err) {
          resolve(null)
          return
        }
        const path = (stdout || '').trim().replace(/\/$/, '')
        resolve(path.length > 0 ? path : null)
      } catch {
        resolve(null)
      }
    })
  })
}
