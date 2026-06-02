import type { ColorMetadata } from '../model'

/**
 * Parse a single CSS colour literal (hex, rgb/rgba, hsl/hsla) into normalised
 * metadata. Returns null when the trimmed text is not exactly one colour.
 */
export function parseColor(raw: string): ColorMetadata | null {
  const text = raw.trim()
  return parseHex(text) ?? parseRgb(text) ?? parseHsl(text)
}

function make(r: number, g: number, b: number, a: number): ColorMetadata {
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 1 ? toHex(Math.round(a * 255)) : ''}`
  return { kind: 'color', hex, rgba: { r, g, b, a: round2(a) } }
}

function toHex(n: number): string {
  return clampByte(n).toString(16).padStart(2, '0')
}
function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseHex(text: string): ColorMetadata | null {
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(text)
  if (!m) return null
  const h = m[1] as string
  if (h.length === 3 || h.length === 4) {
    const r = parseInt(h[0]! + h[0]!, 16)
    const g = parseInt(h[1]! + h[1]!, 16)
    const b = parseInt(h[2]! + h[2]!, 16)
    const a = h.length === 4 ? parseInt(h[3]! + h[3]!, 16) / 255 : 1
    return make(r, g, b, a)
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return make(r, g, b, a)
  }
  return null
}

function parseRgb(text: string): ColorMetadata | null {
  const m = /^rgba?\(\s*([^)]+)\)$/i.exec(text)
  if (!m) return null
  const parts = (m[1] as string).split(/[,/\s]+/).filter(Boolean)
  if (parts.length < 3 || parts.length > 4) return null
  const [rs, gs, bs, as] = parts
  const r = channel(rs!)
  const g = channel(gs!)
  const b = channel(bs!)
  if (r === null || g === null || b === null) return null
  const a = as === undefined ? 1 : alpha(as)
  if (a === null) return null
  return make(r, g, b, a)
}

function channel(token: string): number | null {
  if (token.endsWith('%')) {
    const pct = Number(token.slice(0, -1))
    return Number.isFinite(pct) ? (pct / 100) * 255 : null
  }
  const n = Number(token)
  return Number.isFinite(n) ? n : null
}

function alpha(token: string): number | null {
  if (token.endsWith('%')) {
    const pct = Number(token.slice(0, -1))
    return Number.isFinite(pct) ? pct / 100 : null
  }
  const n = Number(token)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null
}

function parseHsl(text: string): ColorMetadata | null {
  const m = /^hsla?\(\s*([^)]+)\)$/i.exec(text)
  if (!m) return null
  const parts = (m[1] as string).split(/[,/\s]+/).filter(Boolean)
  if (parts.length < 3 || parts.length > 4) return null
  const h = Number((parts[0] as string).replace('deg', ''))
  const s = pct(parts[1] as string)
  const l = pct(parts[2] as string)
  if (!Number.isFinite(h) || s === null || l === null) return null
  const a = parts[3] === undefined ? 1 : alpha(parts[3])
  if (a === null) return null
  const [r, g, b] = hslToRgb(((h % 360) + 360) % 360, s, l)
  return make(r, g, b, a)
}

function pct(token: string): number | null {
  if (!token.endsWith('%')) return null
  const n = Number(token.slice(0, -1))
  return Number.isFinite(n) ? n / 100 : null
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r: number
  let g: number
  let b: number
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}
