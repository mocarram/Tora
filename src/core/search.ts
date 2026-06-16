/**
 * Search ranking. Pure and platform-agnostic so the same relevance logic runs
 * on macOS and iOS. Default matching is case-insensitive, multi-term substring
 * (every space-separated term must appear). Two refinements mirror VS Code:
 * matchCase (case-sensitive) and wholeWord (terms bounded by non-word chars).
 *
 * Designed to rank a few thousand short candidates well under the 50ms budget:
 * a few indexOf scans per candidate, no allocations in the hot path beyond the
 * collected results.
 */

export interface SearchCandidate {
  id: string
  /** Primary text searched (clip preview, optionally prefixed by the title). */
  text: string
  /** Secondary text searched at a lower weight (e.g. source app). */
  secondary?: string | null
  /** Recency, used only as a tiebreak. */
  updatedAt: number
}

export interface SearchResult {
  id: string
  score: number
}

export interface SearchOptions {
  /** Case-sensitive comparison when true. Default false. */
  matchCase?: boolean
  /** Each term must match as a whole word when true. Default false. */
  wholeWord?: boolean
}

const SCORE_BASE = 1
const SCORE_START = 12
const SCORE_BOUNDARY = 9
const EARLY_BONUS_MAX = 6
const EARLY_FALLOFF = 0.5
const SECONDARY_WEIGHT = 0.6

/** A "word" character; a whole-word match must be bounded by non-word chars. */
function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch)
}

/**
 * Score one (already case-normalised) term against one target. Returns the best
 * occurrence's score, or null when the term is absent (respecting wholeWord).
 */
export function termScore(term: string, target: string, wholeWord: boolean): number | null {
  if (term.length === 0) return 0
  let best: number | null = null
  let from = 0
  for (;;) {
    const idx = target.indexOf(term, from)
    if (idx === -1) break
    const end = idx + term.length
    if (wholeWord) {
      const beforeOk = idx === 0 || !isWordChar(target[idx - 1] as string)
      const afterOk = end >= target.length || !isWordChar(target[end] as string)
      if (!beforeOk || !afterOk) {
        from = idx + 1
        continue
      }
    }
    const placement =
      idx === 0 ? SCORE_START : !isWordChar(target[idx - 1] as string) ? SCORE_BOUNDARY : 0
    const early = Math.max(0, EARLY_BONUS_MAX - idx * EARLY_FALLOFF)
    const s = SCORE_BASE + placement + early
    if (best === null || s > best) best = s
    from = idx + 1
  }
  return best
}

/**
 * Rank candidates against a query. Empty/whitespace query returns everything by
 * recency. Otherwise every space-separated term must be satisfied by the primary
 * OR secondary text; results are ordered by summed score, then recency.
 */
export function rankItems(
  query: string,
  candidates: readonly SearchCandidate[],
  options: SearchOptions = {},
): SearchResult[] {
  const { matchCase = false, wholeWord = false } = options
  const norm = (s: string): string => (matchCase ? s : s.toLowerCase())
  const terms = query.trim().split(/\s+/).filter(Boolean).map(norm)

  if (terms.length === 0) {
    return [...candidates]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({ id: c.id, score: 0 }))
  }

  const results: { id: string; score: number; updatedAt: number }[] = []
  for (const c of candidates) {
    const text = norm(c.text)
    const sec = c.secondary ? norm(c.secondary) : null
    let total = 0
    let matched = true
    for (const term of terms) {
      const primary = termScore(term, text, wholeWord)
      const secondary = sec ? termScore(term, sec, wholeWord) : null
      const best = bestScore(primary, secondary)
      if (best === null) {
        matched = false
        break
      }
      total += best
    }
    if (matched) results.push({ id: c.id, score: total, updatedAt: c.updatedAt })
  }

  results.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
  return results.map((r) => ({ id: r.id, score: r.score }))
}

function bestScore(primary: number | null, secondary: number | null): number | null {
  const sec = secondary === null ? null : secondary * SECONDARY_WEIGHT
  if (primary === null) return sec
  if (sec === null) return primary
  return Math.max(primary, sec)
}
