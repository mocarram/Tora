import type { UrlMetadata } from '../model'

/**
 * Detect when the clipboard text is a single web URL. Uses the WHATWG URL
 * parser (available in Node, browsers, and React Native via Hermes/JSC).
 */
export function parseUrl(raw: string): UrlMetadata | null {
  const text = raw.trim()
  // Reject multi-token strings: a real link copy has no internal whitespace.
  if (text.length === 0 || /\s/.test(text)) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname.includes('.')) return null
  return {
    kind: 'url',
    url: url.toString(),
    host: stripWww(url.hostname),
  }
}

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host
}
