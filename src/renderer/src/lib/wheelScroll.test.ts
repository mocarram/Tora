import { describe, it, expect } from 'vitest'
import { normalizeDelta, computeHorizontalScroll } from './wheelScroll'

describe('normalizeDelta', () => {
  it('passes pixel deltas through unchanged', () => {
    expect(normalizeDelta(120, 0)).toBe(120)
    expect(normalizeDelta(-40, 0)).toBe(-40)
  })

  it('scales line deltas to pixels', () => {
    expect(normalizeDelta(3, 1)).toBe(48)
    expect(normalizeDelta(-1, 1)).toBe(-16)
  })

  it('scales page deltas to pixels', () => {
    expect(normalizeDelta(1, 2)).toBe(400)
  })
})

describe('computeHorizontalScroll', () => {
  const base = { deltaX: 0, deltaMode: 0, scrollLeft: 200, maxScrollLeft: 1000 }

  it('converts a vertical-dominant wheel into horizontal movement', () => {
    const r = computeHorizontalScroll({ ...base, deltaY: 120 })
    expect(r.handled).toBe(true)
    expect(r.nextScrollLeft).toBe(320)
  })

  it('scrolls left on negative vertical delta', () => {
    const r = computeHorizontalScroll({ ...base, deltaY: -50 })
    expect(r.handled).toBe(true)
    expect(r.nextScrollLeft).toBe(150)
  })

  it('ignores a horizontal-dominant gesture so the browser handles it', () => {
    expect(computeHorizontalScroll({ ...base, deltaX: 120, deltaY: 10 }).handled).toBe(false)
  })

  it('ignores equal-magnitude deltas (diagonal/ambiguous)', () => {
    expect(computeHorizontalScroll({ ...base, deltaX: 50, deltaY: 50 }).handled).toBe(false)
  })

  it('ignores a no-op wheel', () => {
    expect(computeHorizontalScroll({ ...base, deltaY: 0 }).handled).toBe(false)
  })

  it('clamps to the end and stays handled when partway into the last stride', () => {
    const r = computeHorizontalScroll({ ...base, scrollLeft: 950, deltaY: 120 })
    expect(r.handled).toBe(true)
    expect(r.nextScrollLeft).toBe(1000)
  })

  it('clamps to zero scrolling up near the start', () => {
    const r = computeHorizontalScroll({ ...base, scrollLeft: 30, deltaY: -120 })
    expect(r.handled).toBe(true)
    expect(r.nextScrollLeft).toBe(0)
  })

  it('does not consume the event at the end scrolling further right', () => {
    expect(computeHorizontalScroll({ ...base, scrollLeft: 1000, deltaY: 120 }).handled).toBe(false)
  })

  it('does not consume the event at the start scrolling further left', () => {
    expect(computeHorizontalScroll({ ...base, scrollLeft: 0, deltaY: -120 }).handled).toBe(false)
  })

  it('does nothing when the deck does not overflow', () => {
    expect(
      computeHorizontalScroll({
        deltaX: 0,
        deltaY: 120,
        deltaMode: 0,
        scrollLeft: 0,
        maxScrollLeft: 0,
      }).handled,
    ).toBe(false)
  })

  it('treats a negative maxScrollLeft (sub-viewport content) as no overflow', () => {
    expect(
      computeHorizontalScroll({
        deltaX: 0,
        deltaY: 120,
        deltaMode: 0,
        scrollLeft: 0,
        maxScrollLeft: -50,
      }).handled,
    ).toBe(false)
  })

  it('normalises line-mode deltas before applying', () => {
    const r = computeHorizontalScroll({ ...base, deltaY: 3, deltaMode: 1 })
    expect(r.handled).toBe(true)
    expect(r.nextScrollLeft).toBe(248) // 200 + 3*16
  })
})
