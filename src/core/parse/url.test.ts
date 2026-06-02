import { describe, expect, it } from 'vitest'
import { parseUrl } from './url'

describe('parseUrl', () => {
  it('parses http(s) urls and strips www', () => {
    expect(parseUrl('https://www.figma.com/file/x')?.host).toBe('figma.com')
    expect(parseUrl('http://example.com')?.host).toBe('example.com')
  })
  it('keeps the full normalised url', () => {
    expect(parseUrl('https://a.com/p?q=1#h')?.url).toBe('https://a.com/p?q=1#h')
  })
  it('rejects non-urls and multi-token text', () => {
    expect(parseUrl('just text')).toBeNull()
    expect(parseUrl('https://a.com and more')).toBeNull()
    expect(parseUrl('mailto:a@b.com')).toBeNull()
    expect(parseUrl('localhost')).toBeNull()
    expect(parseUrl('ftp://a.com')).toBeNull()
  })
})
