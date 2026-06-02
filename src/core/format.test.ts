import { describe, expect, it } from 'vitest'
import { countWords, formatBytes, relativeTime, toPreviewLine, truncateMiddle } from './format'

describe('formatBytes', () => {
  it('formats across units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 3)).toBe('3 GB')
  })
  it('guards bad input', () => {
    expect(formatBytes(-5)).toBe('0 B')
    expect(formatBytes(NaN)).toBe('0 B')
  })
})

describe('relativeTime', () => {
  const now = 1_000_000_000_000
  it('buckets deltas', () => {
    expect(relativeTime(now, now)).toBe('now')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5m')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h')
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2d')
    expect(relativeTime(now - 6 * 7 * 86_400_000, now)).toBe('6w')
  })
  it('never goes negative', () => {
    expect(relativeTime(now + 10_000, now)).toBe('now')
  })
})

describe('toPreviewLine', () => {
  it('collapses whitespace and trims', () => {
    expect(toPreviewLine('  a\n\n  b   c ')).toBe('a b c')
  })
  it('truncates with ellipsis', () => {
    expect(toPreviewLine('abcdef', 4)).toBe('abc…')
  })
})

describe('truncateMiddle', () => {
  it('keeps both ends', () => {
    expect(truncateMiddle('/Users/me/Documents/report.pdf', 16)).toContain('…')
    expect(truncateMiddle('short', 16)).toBe('short')
  })
})

describe('countWords', () => {
  it('counts words', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  one   two three ')).toBe(3)
  })
})
