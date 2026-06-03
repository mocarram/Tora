/**
 * Pure HTML parsing helpers for link previews. Kept free of any electron import
 * so they are unit-testable in the node test environment.
 */

/** The page title, preferring og:title, decoded and length-capped. */
export function extractTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
  const tag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const raw = (og ?? tag ?? '').trim()
  if (!raw) return null
  return decodeEntities(raw).replace(/\s+/g, ' ').slice(0, 200)
}

/**
 * The best favicon URL declared in <head>, resolved to absolute against the
 * page URL. Returns null when none is declared (caller falls back to
 * /favicon.ico). Prefers a standard icon over apple-touch-icon.
 */
export function resolveFavicon(html: string, base: URL): string | null {
  const links = html.match(/<link\b[^>]*>/gi) ?? []
  let appleTouch: string | null = null
  for (const link of links) {
    const rel = link.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase()
    if (!rel || !rel.includes('icon')) continue
    const href = link.match(/\bhref=["']([^"']+)["']/i)?.[1]
    if (!href) continue
    let abs: string
    try {
      abs = new URL(href, base).href
    } catch {
      continue
    }
    if (rel.includes('apple-touch-icon')) appleTouch = abs
    else return abs
  }
  return appleTouch
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

/** Decode the handful of HTML entities common in titles, plus numeric ones. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
}
