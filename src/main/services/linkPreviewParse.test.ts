import { describe, it, expect } from 'vitest'
import { extractTitle, resolveFavicon, decodeEntities } from './linkPreviewParse'

describe('decodeEntities', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &lt;3 &quot;hi&quot;')).toBe('Tom & Jerry <3 "hi"')
  })
  it('decodes numeric and hex entities', () => {
    expect(decodeEntities('caf&#233; &#x2764;')).toBe('café ❤')
  })
  it('leaves unknown entities untouched', () => {
    expect(decodeEntities('a &unknown; b')).toBe('a &unknown; b')
  })
})

describe('extractTitle', () => {
  it('reads the <title> tag and collapses whitespace', () => {
    expect(extractTitle('<head><title>  Hello\n  World </title></head>')).toBe('Hello World')
  })
  it('prefers og:title over <title>', () => {
    const html = '<meta property="og:title" content="OG Title"><title>Tag Title</title>'
    expect(extractTitle(html)).toBe('OG Title')
  })
  it('decodes entities in the title', () => {
    expect(extractTitle('<title>Tom &amp; Jerry</title>')).toBe('Tom & Jerry')
  })
  it('returns null when there is no title', () => {
    expect(extractTitle('<p>no title here</p>')).toBeNull()
  })
})

describe('resolveFavicon', () => {
  const base = new URL('https://example.com/path/page.html')

  it('resolves a relative icon href against the page URL', () => {
    const html = '<link rel="icon" href="/assets/fav.png">'
    expect(resolveFavicon(html, base)).toBe('https://example.com/assets/fav.png')
  })
  it('keeps an absolute icon href', () => {
    const html = '<link rel="shortcut icon" href="https://cdn.example.com/f.ico">'
    expect(resolveFavicon(html, base)).toBe('https://cdn.example.com/f.ico')
  })
  it('prefers a standard icon over apple-touch-icon', () => {
    const html = '<link rel="apple-touch-icon" href="/apple.png"><link rel="icon" href="/icon.png">'
    expect(resolveFavicon(html, base)).toBe('https://example.com/icon.png')
  })
  it('falls back to apple-touch-icon when no standard icon exists', () => {
    expect(resolveFavicon('<link rel="apple-touch-icon" href="/apple.png">', base)).toBe(
      'https://example.com/apple.png',
    )
  })
  it('returns null when no icon link is declared', () => {
    expect(resolveFavicon('<link rel="stylesheet" href="/s.css">', base)).toBeNull()
  })
})
