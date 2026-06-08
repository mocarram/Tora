// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createFocusTrap } from './focusTrap'

afterEach(() => {
  document.body.innerHTML = ''
})

function setup(): { outside: HTMLElement; dialog: HTMLElement; a: HTMLElement; b: HTMLElement } {
  document.body.innerHTML = `
    <button id="outside">outside</button>
    <div id="dialog" tabindex="-1">
      <button id="a">a</button>
      <button id="b">b</button>
    </div>`
  return {
    outside: document.getElementById('outside')!,
    dialog: document.getElementById('dialog')!,
    a: document.getElementById('a')!,
    b: document.getElementById('b')!,
  }
}

const tab = (el: HTMLElement, shiftKey = false): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }))
}

describe('createFocusTrap', () => {
  it('pulls focus into the container on creation', () => {
    const { outside, dialog, a } = setup()
    outside.focus()
    expect(document.activeElement).toBe(outside)
    createFocusTrap(dialog)
    expect(document.activeElement).toBe(a)
  })

  it('cycles Tab from last back to first and Shift+Tab from first to last', () => {
    const { dialog, a, b } = setup()
    createFocusTrap(dialog)
    b.focus()
    tab(b)
    expect(document.activeElement).toBe(a)
    a.focus()
    tab(a, true)
    expect(document.activeElement).toBe(b)
  })

  it('restores focus to the previously focused element on release', () => {
    const { outside, dialog } = setup()
    outside.focus()
    const trap = createFocusTrap(dialog)
    expect(document.activeElement).not.toBe(outside)
    trap.release()
    expect(document.activeElement).toBe(outside)
  })

  it('does not steal focus that is already inside the container', () => {
    const { dialog, b } = setup()
    b.focus()
    createFocusTrap(dialog)
    expect(document.activeElement).toBe(b)
  })
})
