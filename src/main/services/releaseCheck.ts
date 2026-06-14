import type { ReleaseCheck } from '@shared/ipc'

/**
 * Manual "is a newer Tora out?" check for the Homebrew distribution.
 *
 * The cask is unsigned, so the app cannot self-update (electron-updater /
 * Squirrel.Mac refuses unsigned bundles) and must not - replacing the bundle in
 * place would desync `brew`. Instead this queries the public Releases API for
 * the latest tag and lets the renderer surface the `brew upgrade` command.
 *
 * Degrades honestly: while the tap repo is private (or the user is offline /
 * rate-limited) the API returns non-200, so `latest` is null and the UI shows
 * the upgrade command without a version comparison. Goes live automatically
 * once the repo is public - no app change needed.
 */

const RELEASE_REPO = 'mocarram/homebrew-tora'
const API_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`
export const RELEASES_URL = `https://github.com/${RELEASE_REPO}/releases`
const TIMEOUT_MS = 6000

/**
 * Compare two dotted numeric versions (a leading "v" and any "-prerelease"
 * suffix are ignored). Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('-')[0]!
      .split('.')
      .map((n) => {
        // A malformed segment parses to NaN; treat it as 0 rather than letting
        // NaN poison every later comparison (NaN > x and NaN < x are both false).
        const parsed = parseInt(n, 10)
        return Number.isNaN(parsed) ? 0 : parsed
      })
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

export async function checkLatestRelease(current: string): Promise<ReleaseCheck> {
  const base: ReleaseCheck = {
    current,
    latest: null,
    isOutdated: false,
    releasesUrl: RELEASES_URL,
  }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const res = await fetch(API_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Tora' },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))
    if (!res.ok) return base
    const data = (await res.json()) as { tag_name?: unknown }
    const tag = typeof data.tag_name === 'string' ? data.tag_name : null
    if (!tag) return base
    return { ...base, latest: tag, isOutdated: compareVersions(tag, current) > 0 }
  } catch {
    // Offline, aborted, rate-limited, or private repo: degrade to "unknown".
    return base
  }
}
