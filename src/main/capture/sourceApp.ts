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
 * Best-effort frontmost-application lookup on macOS. Cached briefly so rapid
 * clipboard polls do not spawn a subprocess repeatedly.
 *
 * Primary path is `lsappinfo`, which reads LaunchServices state and needs no
 * Automation (Apple Events) permission - so it works even before the user has
 * granted Tora the right to script System Events. It falls back to scripting
 * System Events when lsappinfo yields nothing.
 *
 * NOTE: macOS only. On other platforms (including this Linux build/CI host) it
 * returns nulls. Not runtime-verified here; see GAPS.md.
 */
export async function getFrontmostApp(): Promise<SourceApp> {
  if (process.platform !== 'darwin') return EMPTY
  const now = Date.now()
  if (now - cachedAt < TTL_MS) return cached

  try {
    const viaLs = await queryLaunchServices()
    cached = viaLs.bundleId ? viaLs : await querySystemEvents()
    cachedAt = now
  } catch {
    cached = EMPTY
  }
  return cached
}

/**
 * `lsappinfo front` returns the frontmost app's ASN; a second call reads its
 * bundle id and display name. No TCC permission required.
 */
function queryLaunchServices(): Promise<SourceApp> {
  return new Promise((resolve) => {
    execFile('lsappinfo', ['front'], { timeout: 1500 }, (err, stdout) => {
      // Guarded: a throw here is async and would escape getFrontmostApp's
      // try/catch, crashing the main process.
      try {
        const asn = (stdout || '').trim().replace(/^"|"$/g, '')
        if (err || !asn) {
          resolve(EMPTY)
          return
        }
        execFile(
          'lsappinfo',
          ['info', '-only', 'bundleid', '-only', 'name', asn],
          { timeout: 1500 },
          (err2, out2) => {
            try {
              if (err2) {
                resolve(EMPTY)
                return
              }
              const fields = parseLsappinfo(out2 || '')
              resolve({
                name: fields['LSDisplayName'] ?? fields['CFBundleName'] ?? null,
                bundleId: fields['CFBundleIdentifier'] ?? fields['LSBundleIdentifier'] ?? null,
              })
            } catch {
              resolve(EMPTY)
            }
          },
        )
      } catch {
        resolve(EMPTY)
      }
    })
  })
}

/** Parse lsappinfo's `"key"="value"` output into a map. */
function parseLsappinfo(out: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const re = /"([^"]+)"\s*=\s*"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(out)) !== null) {
    if (m[1] && m[2]) fields[m[1]] = m[2]
  }
  return fields
}

/** Fallback: ask System Events (needs the Automation permission). */
function querySystemEvents(): Promise<SourceApp> {
  const script =
    'tell application "System Events" to get {name, bundle identifier} of first application process whose frontmost is true'
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 1500 }, (err, stdout) => {
      try {
        if (err) {
          reject(new Error(err.message))
          return
        }
        const parts = (stdout || '').trim().split(', ')
        resolve({
          name: parts[0]?.trim() || null,
          bundleId: parts[1]?.trim() || null,
        })
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  })
}
