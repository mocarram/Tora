import { describe, expect, it } from 'vitest'
import { classifyCapture, isDuplicate, utf8ByteLength } from './capture'

describe('utf8ByteLength', () => {
  it('counts ascii, multibyte, and emoji', () => {
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('é')).toBe(2)
    expect(utf8ByteLength('好')).toBe(3)
    expect(utf8ByteLength('🐯')).toBe(4)
  })
})

describe('classifyCapture', () => {
  it('never stores concealed content', () => {
    expect(classifyCapture({ text: 'hunter2', concealed: true })).toBeNull()
  })

  it('classifies files first', () => {
    const r = classifyCapture({
      filePaths: ['/a/b/report.pdf', '/a/c/photo.png'],
      fileSizes: [100, 200],
      text: 'report.pdf',
    })
    expect(r?.type).toBe('file')
    expect(r?.byteSize).toBe(300)
    expect(r?.metadata).toMatchObject({ kind: 'file', names: ['report.pdf', 'photo.png'] })
  })

  it('classifies image when there is no text', () => {
    const r = classifyCapture({
      image: { format: 'png', width: 800, height: 600, byteLength: 1234, hash: 'abc' },
    })
    expect(r?.type).toBe('image')
    expect(r?.byteSize).toBe(1234)
    expect(r?.contentHash).toBe('image:abc')
  })

  it('classifies colour, url, and code from text', () => {
    expect(classifyCapture({ text: '#E8843C' })?.type).toBe('color')
    expect(classifyCapture({ text: 'https://tora.app' })?.type).toBe('url')
    expect(classifyCapture({ text: 'const x = () => {\n  return 1\n}' })?.type).toBe('code')
  })

  it('classifies rich text when html present', () => {
    const r = classifyCapture({ text: 'Hello there friend', html: '<b>Hello</b>' })
    expect(r?.type).toBe('richText')
    expect(r?.metadata).toMatchObject({ kind: 'richText', hasHtml: true })
    expect(r?.blob.html).toBe('<b>Hello</b>')
  })

  it('does not dedup rich clips that share plain text but differ in formatting', () => {
    const a = classifyCapture({ text: 'Hello there friend', html: '<b>Hello there friend</b>' })
    const b = classifyCapture({ text: 'Hello there friend', html: '<i>Hello there friend</i>' })
    expect(a?.type).toBe('richText')
    expect(b?.type).toBe('richText')
    expect(isDuplicate(a?.contentHash ?? null, b!.contentHash)).toBe(false)
  })

  it('falls back to plain text', () => {
    const r = classifyCapture({ text: 'just a normal note' })
    expect(r?.type).toBe('text')
    expect(r?.metadata).toMatchObject({ kind: 'text', wordCount: 4 })
    expect(r?.blob.text).toBe('just a normal note')
  })

  it('returns null for empty input', () => {
    expect(classifyCapture({})).toBeNull()
    expect(classifyCapture({ text: '   ' })).toBeNull()
  })

  it('produces stable dedup hashes for identical text', () => {
    const a = classifyCapture({ text: 'same content' })
    const b = classifyCapture({ text: 'same content' })
    expect(a?.contentHash).toBe(b?.contentHash)
    expect(isDuplicate(a?.contentHash ?? null, b!.contentHash)).toBe(true)
  })

  it('distinguishes different content', () => {
    const a = classifyCapture({ text: 'one' })
    const b = classifyCapture({ text: 'two' })
    expect(isDuplicate(a?.contentHash ?? null, b!.contentHash)).toBe(false)
  })
})
