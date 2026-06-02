import { describe, expect, it } from 'vitest'
import { parseColor } from './color'

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#E8843C')?.hex).toBe('#e8843c')
    expect(parseColor('#e8843c')?.rgba).toEqual({ r: 232, g: 132, b: 60, a: 1 })
  })
  it('parses 3-digit hex', () => {
    expect(parseColor('#fff')?.rgba).toEqual({ r: 255, g: 255, b: 255, a: 1 })
  })
  it('parses 8-digit hex with alpha', () => {
    const c = parseColor('#00000080')
    expect(c?.rgba.a).toBe(0.5)
  })
  it('parses rgb and rgba', () => {
    expect(parseColor('rgb(232, 132, 60)')?.hex).toBe('#e8843c')
    expect(parseColor('rgba(0,0,0,0.5)')?.rgba.a).toBe(0.5)
  })
  it('parses hsl', () => {
    const red = parseColor('hsl(0, 100%, 50%)')
    expect(red?.rgba).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })
  it('rejects non-colours', () => {
    expect(parseColor('hello')).toBeNull()
    expect(parseColor('#xyz')).toBeNull()
    expect(parseColor('rgb(1,2)')).toBeNull()
    expect(parseColor('#e8843c and more')).toBeNull()
  })
})
