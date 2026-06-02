/**
 * Fuzzy search ranking. Pure and platform-agnostic so the same relevance logic
 * runs on macOS and iOS. Designed to rank a few thousand short candidate
 * strings in well under the 50ms budget: a single linear scan per candidate, no
 * allocations in the hot path beyond the score.
 *
 * Scoring favours: matches at the start of a word boundary, contiguous runs,
 * matches near the start of the string, and (as a tiebreak) more recent items.
 */

export interface SearchCandidate {
  id: string
  /** Primary text searched (clip preview). */
  text: string
  /** Secondary text searched with a lower weight (e.g. source app). */
  secondary?: string | null
  /** Recency, used only as a tiebreak. */
  updatedAt: number
}

export interface SearchResult {
  id: string
  score: number
}

const SCORE_START = 12
const SCORE_WORD_BOUNDARY = 9
const SCORE_CONSECUTIVE = 10
const SCORE_MATCH = 1
const PENALTY_LEADING = -0.5
const PENALTY_GAP = -0.5
const MAX_LEADING_PENALTY = -6
const SECONDARY_WEIGHT = 0.6

function isBoundary(ch: string): boolean {
  return ch === ' ' || ch === '-' || ch === '_' || ch === '/' || ch === '.' || ch === ':'
}

/**
 * Score a single query against a target. Returns null when the query is not a
 * subsequence of the target. Case-insensitive.
 */
export function fuzzyScore(query: string, target: string): number | null {
  if (query.length === 0) return 0
  if (target.length === 0) return null

  const q = query.toLowerCase()
  const t = target.toLowerCase()

  let score = 0
  let qi = 0
  let lastMatch = -1
  let firstMatch = -1

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue

    if (firstMatch === -1) {
      firstMatch = ti
      score += Math.max(MAX_LEADING_PENALTY, ti * PENALTY_LEADING)
    }

    if (ti === 0) score += SCORE_START
    else if (isBoundary(t[ti - 1] as string)) score += SCORE_WORD_BOUNDARY

    if (lastMatch === ti - 1 && lastMatch !== -1) score += SCORE_CONSECUTIVE
    else if (lastMatch !== -1) score += (ti - lastMatch - 1) * PENALTY_GAP

    score += SCORE_MATCH
    lastMatch = ti
    qi++
  }

  if (qi < q.length) return null
  return score
}

/**
 * Rank candidates against a query. An empty query returns everything ordered by
 * recency. Otherwise only matches are returned, ordered by score then recency.
 */
export function rankItems(query: string, candidates: readonly SearchCandidate[]): SearchResult[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return [...candidates]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({ id: c.id, score: 0 }))
  }

  const results: { id: string; score: number; updatedAt: number }[] = []
  for (const c of candidates) {
    const primary = fuzzyScore(trimmed, c.text)
    const secondary = c.secondary ? fuzzyScore(trimmed, c.secondary) : null
    const best = bestScore(primary, secondary)
    if (best !== null) results.push({ id: c.id, score: best, updatedAt: c.updatedAt })
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
