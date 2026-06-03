/**
 * Wheel-to-horizontal-scroll math for the panel deck (the single horizontal row
 * of cards). A plain mouse wheel only emits vertical delta, and Chromium does
 * not translate that into horizontal scroll for a horizontal-only scroller, so
 * the deck would be unreachable with a mouse. This converts a vertical-dominant
 * wheel into horizontal movement while leaving genuine horizontal gestures
 * (trackpad swipes, Shift+wheel) to the browser.
 *
 * Pure and DOM-free so it is unit-testable; the component supplies the live
 * scroll geometry and applies the result.
 */

// Wheel deltas arrive in pixels (deltaMode 0), lines (1), or pages (2). Mice on
// Windows/Linux often report lines; macOS reports pixels. Normalise to pixels.
const LINE_PX = 16
const PAGE_PX = 400

export function normalizeDelta(value: number, deltaMode: number): number {
  if (deltaMode === 1) return value * LINE_PX
  if (deltaMode === 2) return value * PAGE_PX
  return value
}

export interface HorizontalScrollInput {
  deltaX: number
  deltaY: number
  /** WheelEvent.deltaMode (0 px, 1 line, 2 page). */
  deltaMode: number
  /** Current element.scrollLeft. */
  scrollLeft: number
  /** element.scrollWidth - element.clientWidth. */
  maxScrollLeft: number
}

export interface HorizontalScrollResult {
  /** True when the deck should consume the event (preventDefault + apply). */
  handled: boolean
  /** Clamped scrollLeft to apply when handled. */
  nextScrollLeft: number
}

const IGNORE: HorizontalScrollResult = { handled: false, nextScrollLeft: 0 }

/**
 * Decide whether a wheel event should scroll the deck horizontally, and to where.
 *
 * Rules:
 * - Only a vertical-dominant gesture is converted; horizontal-dominant gestures
 *   (and the no-delta case) are left to the browser so trackpad swipes and
 *   Shift+wheel keep working and we never double-scroll.
 * - At a boundary (already at the start and scrolling up, or at the end and
 *   scrolling down) the event is not consumed, so it bubbles and nothing feels
 *   stuck.
 * - When the deck does not overflow there is nothing to do.
 */
export function computeHorizontalScroll(input: HorizontalScrollInput): HorizontalScrollResult {
  const dx = normalizeDelta(input.deltaX, input.deltaMode)
  const dy = normalizeDelta(input.deltaY, input.deltaMode)

  // Horizontal intent dominates (or there is no vertical intent): let it be.
  if (Math.abs(dx) >= Math.abs(dy)) return IGNORE

  const max = Math.max(0, input.maxScrollLeft)
  const current = Math.max(0, Math.min(max, input.scrollLeft))

  const atStart = current <= 0 && dy < 0
  const atEnd = current >= max && dy > 0
  if (atStart || atEnd) return IGNORE

  const next = Math.max(0, Math.min(max, current + dy))
  return { handled: true, nextScrollLeft: next }
}
