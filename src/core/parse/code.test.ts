import { describe, expect, it } from 'vitest'
import { detectCode } from './code'

describe('detectCode', () => {
  it('detects typescript', () => {
    const r = detectCode('interface Foo {\n  bar: string\n}\nconst x = 1')
    expect(r?.language).toBe('typescript')
  })
  it('detects python', () => {
    const r = detectCode('def hello(name):\n    print(name)\n    return self')
    expect(r?.language).toBe('python')
    expect(r?.lineCount).toBe(3)
  })
  it('detects sql', () => {
    expect(detectCode('SELECT id FROM users WHERE active = 1')?.language).toBe('sql')
  })
  it('detects json', () => {
    expect(detectCode('{\n  "a": 1,\n  "b": 2\n}')?.language).toBe('json')
  })
  it('does not flag prose as code', () => {
    expect(detectCode('Hello there, this is a normal sentence about a cat.')).toBeNull()
    expect(detectCode('Meeting at 3pm; bring notes.')).toBeNull()
  })
  it('ignores trivially short input', () => {
    expect(detectCode('a;')).toBeNull()
  })
})
