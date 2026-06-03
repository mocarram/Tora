import { describe, expect, it } from 'vitest'
import { fuzzyScore, rankItems, type SearchCandidate } from './search'

describe('fuzzyScore', () => {
  it('matches subsequences case-insensitively', () => {
    expect(fuzzyScore('abc', 'aXbXc')).not.toBeNull()
    expect(fuzzyScore('ABC', 'aXbXc')).not.toBeNull()
  })
  it('returns null when not a subsequence', () => {
    expect(fuzzyScore('xyz', 'abc')).toBeNull()
    expect(fuzzyScore('abcd', 'abc')).toBeNull()
  })
  it('empty query scores zero', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })
  it('scores word-boundary matches higher than mid-word', () => {
    const boundary = fuzzyScore('rt', 'release time') // r at start, t at word boundary
    const midword = fuzzyScore('rt', 'cartwheel') // both mid-word
    expect(boundary).not.toBeNull()
    expect(midword).not.toBeNull()
    expect(boundary!).toBeGreaterThan(midword!)
  })
  it('scores contiguous higher than scattered', () => {
    const contig = fuzzyScore('abc', 'abcdef')!
    const scattered = fuzzyScore('abc', 'a_b_c_')!
    expect(contig).toBeGreaterThan(scattered)
  })
})

describe('rankItems', () => {
  const items: SearchCandidate[] = [
    { id: '1', text: 'design tokens', secondary: 'Figma', updatedAt: 100 },
    { id: '2', text: 'const spring = 520', secondary: 'VS Code', updatedAt: 200 },
    { id: '3', text: 'warm amber accent', secondary: 'Notes', updatedAt: 300 },
  ]

  it('returns all by recency for empty query', () => {
    const r = rankItems('', items)
    expect(r.map((x) => x.id)).toEqual(['3', '2', '1'])
  })

  it('ranks best textual match first', () => {
    const r = rankItems('spring', items)
    expect(r[0]?.id).toBe('2')
  })

  it('matches the secondary field (source app)', () => {
    const r = rankItems('figma', items)
    expect(r.map((x) => x.id)).toContain('1')
  })

  it('excludes non-matches', () => {
    const r = rankItems('zzzz', items)
    expect(r).toHaveLength(0)
  })

  it('breaks score ties by recency', () => {
    const tie: SearchCandidate[] = [
      { id: 'old', text: 'note', secondary: null, updatedAt: 1 },
      { id: 'new', text: 'note', secondary: null, updatedAt: 2 },
    ]
    expect(rankItems('note', tie)[0]?.id).toBe('new')
  })

  it('stays within budget on a large set', () => {
    const big: SearchCandidate[] = Array.from({ length: 10_000 }, (_, i) => ({
      id: String(i),
      text: `item number ${i} with some words`,
      secondary: 'App',
      updatedAt: i,
    }))
    const start = performance.now()
    rankItems('item words', big)
    expect(performance.now() - start).toBeLessThan(50)
  })
})
