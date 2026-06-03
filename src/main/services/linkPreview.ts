import { nativeImage } from 'electron'
import { extractTitle, resolveFavicon } from './linkPreviewParse'

/**
 * Fetches a link's title and favicon for the URL card preview. Only ever called
 * when the user has opted in (settings.fetchLinkPreviews); off by default for
 * privacy. All network work is best-effort and time-boxed, returning nulls on
 * any failure so capture is never blocked or broken.
 *
 * The favicon is normalised to a small PNG and stored as a blob (served via
 * tora-blob://), because the renderer CSP forbids loading remote images.
 *
 * Pure parsers live in linkPreviewParse.ts (electron-free, unit-tested); the
 * network glue here is not runtime-verified on the Linux build host (GAPS.md).
 */

const TIMEOUT_MS = 6000
const MAX_HTML_BYTES = 512 * 1024
const FAVICON_PX = 32
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Tora/1.0 Safari/537.36'

export interface LinkPreview {
  title: string | null
  faviconPng: Buffer | null
}

const EMPTY: LinkPreview = { title: null, faviconPng: null }

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return EMPTY
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return EMPTY

  let title: string | null = null
  let faviconUrl = new URL('/favicon.ico', url.origin).href

  const page = await fetchBytes(url.href)
  if (page && /html/i.test(page.contentType)) {
    const html = page.buf.subarray(0, MAX_HTML_BYTES).toString('utf8')
    title = extractTitle(html)
    faviconUrl = resolveFavicon(html, url) ?? faviconUrl
  }

  const fav = await fetchBytes(faviconUrl)
  const faviconPng = fav ? toPng(fav.buf) : null
  return { title, faviconPng }
}

async function fetchBytes(href: string): Promise<{ buf: Buffer; contentType: string } | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(href, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,image/*,*/*' },
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return { buf, contentType: res.headers.get('content-type') ?? '' }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function toPng(buf: Buffer): Buffer | null {
  try {
    let img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) return null
    img = img.resize({ width: FAVICON_PX, height: FAVICON_PX, quality: 'best' })
    return img.toPNG()
  } catch {
    return null
  }
}
