import { describe, expect, it } from 'vitest'
import { shouldDismissOnBlur } from './dismissPolicy'

const base = {
  mode: 'panel' as const,
  hideSuppressed: false,
  visible: true,
  devToolsFocused: false,
}

describe('shouldDismissOnBlur', () => {
  it('dismisses a visible panel with nothing modal open', () => {
    expect(shouldDismissOnBlur(base)).toBe(true)
  })

  it('never dismisses in window mode (stays open like a normal window)', () => {
    expect(shouldDismissOnBlur({ ...base, mode: 'window' })).toBe(false)
  })

  it('does not dismiss while a modal/overlay is open', () => {
    expect(shouldDismissOnBlur({ ...base, hideSuppressed: true })).toBe(false)
  })

  it('does not dismiss when DevTools took focus', () => {
    expect(shouldDismissOnBlur({ ...base, devToolsFocused: true })).toBe(false)
  })

  it('does not dismiss an already-hidden window', () => {
    expect(shouldDismissOnBlur({ ...base, visible: false })).toBe(false)
  })
})
