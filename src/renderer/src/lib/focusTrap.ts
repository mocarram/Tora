/**
 * Framework-agnostic focus management for modal overlays. Keeps keyboard focus
 * inside a container, cycles Tab/Shift+Tab among its focusable descendants, and
 * restores focus to whatever was focused before when released. Kept free of
 * React so the (bug-prone) trap/restore logic can be unit-tested in a DOM.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface FocusTrap {
  release(): void
}

export function createFocusTrap(container: HTMLElement): FocusTrap {
  const previouslyFocused = document.activeElement as HTMLElement | null

  const focusables = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))

  // Pull focus into the overlay if it is not already there (so the first Tab
  // moves within it and screen-reader focus lands on the dialog content).
  if (!container.contains(document.activeElement)) {
    const first = focusables()[0]
    ;(first ?? container).focus?.()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return
    // Own Tab within this container so an outer trap (e.g. a confirm dialog
    // nested inside settings) does not also act on the same keypress.
    e.stopPropagation()
    const items = focusables()
    const first = items[0]
    const last = items.at(-1)
    if (!first || !last) {
      e.preventDefault()
      return
    }
    const active = document.activeElement
    if (!container.contains(active)) {
      // Focus escaped the overlay; pull it back to the appropriate edge.
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
    } else if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  container.addEventListener('keydown', onKeyDown)

  return {
    release(): void {
      container.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    },
  }
}
