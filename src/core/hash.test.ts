import { describe, expect, it } from 'vitest'
import { hashBytes, hashBytes32, hashParts, hashString } from './hash'

describe('hashString', () => {
  it('is deterministic and 16 hex chars', () => {
    const h = hashString('tora')
    expect(h).toMatch(/^[0-9a-f]{16}$/)
    expect(hashString('tora')).toBe(h)
  })
  it('differs for different input', () => {
    expect(hashString('a')).not.toBe(hashString('b'))
    expect(hashString('ab')).not.toBe(hashString('ba'))
  })
  it('distinguishes unicode', () => {
    expect(hashString('é')).not.toBe(hashString('e'))
  })
})

describe('hashBytes', () => {
  it('hashes byte arrays deterministically', () => {
    const a = hashBytes(new Uint8Array([1, 2, 3]))
    expect(a).toBe(hashBytes(new Uint8Array([1, 2, 3])))
    expect(a).not.toBe(hashBytes(new Uint8Array([3, 2, 1])))
  })
})

describe('hashBytes32', () => {
  it('is deterministic, 8 hex chars, and content-sensitive', () => {
    const a = hashBytes32(new Uint8Array([1, 2, 3]))
    expect(a).toMatch(/^[0-9a-f]{8}$/)
    expect(hashBytes32(new Uint8Array([1, 2, 3]))).toBe(a)
    expect(hashBytes32(new Uint8Array([3, 2, 1]))).not.toBe(a)
    expect(hashBytes32(new Uint8Array([1, 2, 3, 0]))).not.toBe(a)
  })
  it('matches the FNV-1a 32-bit reference vector', () => {
    // FNV-1a("a") = 0xe40c292c - pins the algorithm so a refactor cannot
    // silently change the watcher signature scheme.
    expect(hashBytes32(new TextEncoder().encode('a'))).toBe('e40c292c')
  })
})

describe('hashParts', () => {
  it('is order sensitive', () => {
    expect(hashParts(['a', 'b'])).not.toBe(hashParts(['b', 'a']))
  })
})
