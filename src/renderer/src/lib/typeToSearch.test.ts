import { describe, expect, it } from 'vitest'
import { isTypeToSearchKey } from './typeToSearch'

const key = (
  k: string,
  mods: Partial<{ metaKey: boolean; ctrlKey: boolean; isComposing: boolean }> = {},
) => ({ key: k, metaKey: false, ctrlKey: false, ...mods })

describe('isTypeToSearchKey', () => {
  it('accepts letters, digits, and symbols', () => {
    for (const k of ['a', 'Z', '5', '.', '-', '/', 'é', 'ß', '€']) {
      expect(isTypeToSearchKey(key(k))).toBe(true)
    }
  })

  it('rejects named keys (Enter, arrows, Escape, Backspace, F-keys)', () => {
    for (const k of ['Enter', 'Escape', 'ArrowRight', 'Backspace', 'Delete', 'F5', 'Tab']) {
      expect(isTypeToSearchKey(key(k))).toBe(false)
    }
  })

  it('rejects the leading space (Space stays expand-preview)', () => {
    expect(isTypeToSearchKey(key(' '))).toBe(false)
  })

  it('rejects Cmd/Ctrl shortcuts but allows Option-produced characters', () => {
    expect(isTypeToSearchKey(key('c', { metaKey: true }))).toBe(false)
    expect(isTypeToSearchKey(key('f', { ctrlKey: true }))).toBe(false)
    // macOS Option+q arrives as the printable 'œ' with only altKey set.
    expect(isTypeToSearchKey(key('œ'))).toBe(true)
  })

  it('rejects IME composition keystrokes', () => {
    expect(isTypeToSearchKey(key('a', { isComposing: true }))).toBe(false)
  })
})
