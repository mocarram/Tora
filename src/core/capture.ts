/**
 * Capture classification. Given a normalised snapshot of the system pasteboard,
 * decide the item type, build its metadata, preview, and dedup hash. Pure and
 * platform-agnostic: the macOS pasteboard reading lives in main/, the iOS
 * UIPasteboard reading will live in the RN app, both feeding this same function.
 */
import type { ClipItemMetadata, ClipItemType } from './model'
import { hashParts, hashString } from './hash'
import { detectCode } from './parse/code'
import { parseColor } from './parse/color'
import { parseUrl } from './parse/url'
import { toPreviewLine } from './format'

export interface CaptureImage {
  format: string
  width: number
  height: number
  byteLength: number
  /** Hash of the raw image bytes, computed by the capturing platform. */
  hash: string
}

export interface CaptureInput {
  text?: string | null
  html?: string | null
  rtf?: string | null
  image?: CaptureImage | null
  filePaths?: string[] | null
  fileSizes?: number[] | null
  /** Set when the source marked the pasteboard concealed/transient. */
  concealed?: boolean
  sourceApp?: string | null
  sourceBundleId?: string | null
}

export interface ClassifiedClip {
  type: ClipItemType
  previewText: string
  contentHash: string
  byteSize: number
  metadata: ClipItemMetadata
  /** Canonical payload parts main should persist to the blob store. */
  blob: {
    text?: string
    html?: string
    rtf?: string
  }
}

/** UTF-8 byte length without needing TextEncoder (RN-safe fallback). */
export function utf8ByteLength(s: string): number {
  let bytes = 0
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i++ // surrogate pair
    } else bytes += 3
  }
  return bytes
}

function hasText(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0
}

/**
 * Classify a pasteboard snapshot. Returns null when there is nothing worth
 * capturing, or when the content is concealed (passwords are never stored).
 */
export function classifyCapture(input: CaptureInput): ClassifiedClip | null {
  if (input.concealed) return null

  // 1. Files take priority over any text representation Finder also writes.
  if (input.filePaths && input.filePaths.length > 0) {
    const paths = [...input.filePaths]
    const names = paths.map((p) => p.split('/').pop() ?? p)
    const byteSize = (input.fileSizes ?? []).reduce((a, b) => a + b, 0)
    return {
      type: 'file',
      previewText: names.join(', '),
      contentHash: hashParts(['file', ...paths]),
      byteSize,
      metadata: { kind: 'file', paths, names },
      blob: {},
    }
  }

  const text = input.text ?? null

  // 2. Image (only when there is no meaningful text representation).
  if (input.image && !hasText(text)) {
    const img = input.image
    return {
      type: 'image',
      previewText: `${img.width}x${img.height} ${img.format.toUpperCase()}`,
      contentHash: `image:${img.hash}`,
      byteSize: img.byteLength,
      metadata: { kind: 'image', width: img.width, height: img.height, format: img.format },
      blob: {},
    }
  }

  // 3. Text-derived types.
  if (hasText(text)) {
    const trimmed = text.trim()

    const color = parseColor(trimmed)
    if (color) {
      return {
        type: 'color',
        previewText: color.hex.toUpperCase(),
        contentHash: hashString(`color:${color.hex}`),
        byteSize: utf8ByteLength(trimmed),
        metadata: color,
        blob: { text },
      }
    }

    const url = parseUrl(trimmed)
    if (url) {
      return {
        type: 'url',
        previewText: url.url,
        contentHash: hashString(`url:${url.url}`),
        byteSize: utf8ByteLength(text),
        metadata: url,
        blob: { text },
      }
    }

    const code = detectCode(text)
    if (code) {
      return {
        type: 'code',
        previewText: toPreviewLine(text),
        contentHash: hashString(text),
        byteSize: utf8ByteLength(text),
        metadata: code,
        blob: {
          text,
          ...(hasText(input.html) ? { html: input.html } : {}),
        },
      }
    }

    if (hasText(input.html) || hasText(input.rtf)) {
      return {
        type: 'richText',
        previewText: toPreviewLine(text),
        // Hash over the rich payload, not just the plain text: two clips with
        // the same words but different formatting (e.g. <b>Hi</b> vs <i>Hi</i>)
        // are distinct clips and must not dedup into one.
        contentHash: hashString(`rich:${text}:${input.html ?? ''}:${input.rtf ?? ''}`),
        byteSize:
          utf8ByteLength(text) + utf8ByteLength(input.html ?? '') + utf8ByteLength(input.rtf ?? ''),
        metadata: { kind: 'richText', hasHtml: hasText(input.html), hasRtf: hasText(input.rtf) },
        blob: {
          text,
          ...(hasText(input.html) ? { html: input.html } : {}),
          ...(hasText(input.rtf) ? { rtf: input.rtf } : {}),
        },
      }
    }

    return {
      type: 'text',
      previewText: toPreviewLine(text),
      contentHash: hashString(text),
      byteSize: utf8ByteLength(text),
      metadata: {
        kind: 'text',
        charCount: text.length,
        wordCount: text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length,
      },
      blob: { text },
    }
  }

  return null
}

/** True when a new capture is identical to the most recent one (dedup). */
export function isDuplicate(previousHash: string | null, nextHash: string): boolean {
  return previousHash !== null && previousHash === nextHash
}
