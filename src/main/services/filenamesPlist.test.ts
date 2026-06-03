import { describe, expect, it } from 'vitest'
import { buildFilenamesPlist, parseFilenamesPlist } from './filenamesPlist'

describe('filenames plist', () => {
  it('round-trips a single path', () => {
    const xml = buildFilenamesPlist(['/Users/me/report.pdf'])
    expect(parseFilenamesPlist(xml)).toEqual(['/Users/me/report.pdf'])
  })

  it('round-trips multiple paths', () => {
    const paths = ['/a/one.txt', '/b/two.png', '/c/three.mov']
    expect(parseFilenamesPlist(buildFilenamesPlist(paths))).toEqual(paths)
  })

  it('escapes and unescapes XML-special characters in paths', () => {
    const paths = ['/tmp/a & b/<weird> "name".txt']
    const xml = buildFilenamesPlist(paths)
    expect(xml).not.toContain('& b/<weird>') // raw specials must be escaped
    expect(parseFilenamesPlist(xml)).toEqual(paths)
  })

  it('parses an empty array to no paths', () => {
    expect(parseFilenamesPlist(buildFilenamesPlist([]))).toEqual([])
  })
})
