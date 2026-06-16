import { describe, expect, it } from 'vitest'
import { rankItems, termScore, type SearchCandidate } from './search'

describe('termScore', () => {
  // termScore takes already-case-normalised inputs and returns a number (best
  // occurrence score) or null when the term is absent under the wholeWord rule.
  it('returns null when the term is not a substring', () => {
    expect(termScore('cat', 'dog house', false)).toBeNull()
  })
  it('scores a substring match (non-null) anywhere by default', () => {
    expect(termScore('cat', 'category', false)).not.toBeNull()
    expect(termScore('cat', 'a scatter plot', false)).not.toBeNull()
  })
  it('whole-word: matches a standalone word, rejects mid-word', () => {
    expect(termScore('cat', 'the cat sat', true)).not.toBeNull()
    expect(termScore('cat', 'cat.', true)).not.toBeNull()
    expect(termScore('cat', 'category', true)).toBeNull()
    expect(termScore('cat', 'scatter', true)).toBeNull()
  })
  it('scores a start match above a word-boundary match above mid-word', () => {
    const start = termScore('re', 'release', false)!
    const boundary = termScore('re', 'the release', false)! // 're' after a space
    const mid = termScore('re', 'wires', false)! // mid-word
    expect(start).toBeGreaterThan(boundary)
    expect(boundary).toBeGreaterThan(mid)
  })
  it('scores an earlier occurrence at least as high as a later one', () => {
    const early = termScore('x', 'x________', false)!
    const late = termScore('x', '________x', false)!
    expect(early).toBeGreaterThan(late)
  })
})

describe('rankItems', () => {
  const items: SearchCandidate[] = [
    { id: '1', text: 'design tokens', secondary: 'Figma', updatedAt: 100 },
    { id: '2', text: 'const spring = 520', secondary: 'VS Code', updatedAt: 200 },
    { id: '3', text: 'warm amber accent', secondary: 'Notes', updatedAt: 300 },
  ]

  it('returns all by recency for an empty query', () => {
    expect(rankItems('', items).map((x) => x.id)).toEqual(['3', '2', '1'])
  })
  it('returns all by recency for a whitespace-only query', () => {
    expect(rankItems('   ', items).map((x) => x.id)).toEqual(['3', '2', '1'])
  })
  it('ranks the best textual match first', () => {
    expect(rankItems('spring', items)[0]?.id).toBe('2')
  })
  it('matches the secondary field (source app)', () => {
    expect(rankItems('figma', items).map((x) => x.id)).toContain('1')
  })
  it('excludes non-matches', () => {
    expect(rankItems('zzzz', items)).toHaveLength(0)
  })
  it('is case-insensitive by default', () => {
    expect(rankItems('AMBER', items).map((x) => x.id)).toContain('3')
  })

  it('multi-term requires every term, order-independent', () => {
    const c: SearchCandidate[] = [
      { id: 'both', text: 'wallet for eth staking', secondary: null, updatedAt: 1 },
      { id: 'rev', text: 'eth and a wallet', secondary: null, updatedAt: 2 },
      { id: 'one', text: 'just a wallet', secondary: null, updatedAt: 3 },
    ]
    const ids = rankItems('wallet eth', c).map((x) => x.id)
    expect(ids).toContain('both')
    expect(ids).toContain('rev')
    expect(ids).not.toContain('one')
  })

  it('a term may be satisfied by the secondary field', () => {
    const c: SearchCandidate[] = [
      { id: 'x', text: 'quarterly numbers', secondary: 'Excel', updatedAt: 1 },
    ]
    // "numbers" in text, "excel" in secondary - both terms satisfied.
    expect(rankItems('numbers excel', c).map((i) => i.id)).toEqual(['x'])
  })

  it('matchCase: rejects a differently-cased match', () => {
    const c: SearchCandidate[] = [{ id: 'x', text: 'Cat', secondary: null, updatedAt: 1 }]
    expect(rankItems('cat', c, { matchCase: true })).toHaveLength(0)
    expect(rankItems('Cat', c, { matchCase: true }).map((i) => i.id)).toEqual(['x'])
  })

  it('wholeWord: "cat" stops matching "category"', () => {
    const c: SearchCandidate[] = [
      { id: 'whole', text: 'the cat', secondary: null, updatedAt: 1 },
      { id: 'part', text: 'category list', secondary: null, updatedAt: 2 },
    ]
    const ids = rankItems('cat', c, { wholeWord: true }).map((i) => i.id)
    expect(ids).toEqual(['whole'])
  })

  it('breaks score ties by recency', () => {
    const tie: SearchCandidate[] = [
      { id: 'old', text: 'note', secondary: null, updatedAt: 1 },
      { id: 'new', text: 'note', secondary: null, updatedAt: 2 },
    ]
    expect(rankItems('note', tie)[0]?.id).toBe('new')
  })

  it('stays within budget on a large multi-term set', () => {
    const big: SearchCandidate[] = Array.from({ length: 10_000 }, (_, i) => ({
      id: String(i),
      text: `item number ${i} with some words`,
      secondary: 'App',
      updatedAt: i,
    }))
    const start = performance.now()
    rankItems('item words', big)
    expect(performance.now() - start).toBeLessThan(500)
  })
})
