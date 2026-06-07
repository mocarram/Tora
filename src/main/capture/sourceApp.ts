import { execFile } from 'node:child_process'

export interface SourceApp {
  name: string | null
  bundleId: string | null
}

const EMPTY: SourceApp = { name: null, bundleId: null }

let cached: SourceApp = EMPTY
let cachedAt = 0
const TTL_MS = 800

/**
 * Best-effort frontmost-application lookup on macOS via AppleScript. Cached
 * briefly so rapid clipboard polls do not spawn osascript repeatedly.
 *
 * NOTE: macOS only. On other platforms (including this Linux build/CI host) it
 * returns nulls. Not runtime-verified here; see GAPS.md. A native helper would
 * be faster than osascript but AppleScript avoids a compiled dependency.
 */
export async function getFrontmostApp(): Promise<SourceApp> {
  if (process.platform !== 'darwin') return EMPTY
  const now = Date.now()
  if (now - cachedAt < TTL_MS) return cached

  try {
    cached = await query()
    cachedAt = now
  } catch {
    cached = EMPTY
  }
  return cached
}

function query(): Promise<SourceApp> {
  const script =
    'tell application "System Events" to get {name, bundle identifier} of first application process whose frontmost is true'
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 1500 }, (err, stdout) => {
      if (err) {
        reject(new Error(err.message))
        return
      }
      const parts = stdout.trim().split(', ')
      resolve({
        name: parts[0]?.trim() || null,
        bundleId: parts[1]?.trim() || null,
      })
    })
  })
}
