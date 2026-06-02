import { describe, expect, it } from 'vitest'
import { hashBytes, hashParts, hashString } from './hash'

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

describe('hashParts', () => {
  it('is order sensitive', () => {
    expect(hashParts(['a', 'b'])).not.toBe(hashParts(['b', 'a']))
  })
})
