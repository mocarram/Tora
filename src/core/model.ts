/**
 * Core domain model. Pure, platform-agnostic TypeScript.
 * No Electron, no Node built-ins. Reused by the future React Native iOS app.
 */

export type ClipItemType = 'text' | 'richText' | 'image' | 'file' | 'url' | 'color' | 'code'

/**
 * A single captured clipboard entry.
 *
 * Large payloads (images, file copies, full RTF/HTML) are NEVER inlined here.
 * They live on disk and are referenced by `contentRef`. `previewText` is a
 * short, cheap-to-render summary safe to keep in the row.
 */
export interface ClipItem {
  id: string
  type: ClipItemType
  createdAt: number
  updatedAt: number
  /** Human-readable source application name, if known. */
  sourceApp: string | null
  /** macOS bundle id of the source app, if known. */
  sourceBundleId: string | null
  /** User-set custom title shown on the card; null falls back to source/type. */
  title: string | null
  /** Short preview string shown in list rows. */
  previewText: string
  /** On-disk reference (relative blob path) for the full payload, if any. */
  contentRef: string | null
  /** Stable hash of the canonical content, used for dedup. */
  contentHash: string
  isPinned: boolean
  /** Size of the underlying content in bytes. */
  byteSize: number
  /** Type-specific structured metadata. */
  metadata: ClipItemMetadata
  /** Soft-delete tombstone timestamp for sync; null when live. */
  deletedAt: number | null
}

export interface ColorMetadata {
  kind: 'color'
  /** Normalised lowercase hex, e.g. "#1f6feb". */
  hex: string
  rgba: { r: number; g: number; b: number; a: number }
}

export interface UrlMetadata {
  kind: 'url'
  url: string
  host: string
  /** Fetched lazily, only when the privacy toggle allows it. */
  title?: string
  faviconRef?: string
}

export interface ImageMetadata {
  kind: 'image'
  width: number
  height: number
  format: string
  thumbnailRef?: string
}

export interface FileMetadata {
  kind: 'file'
  paths: string[]
  names: string[]
  /** Set when the file is an image and a thumbnail blob was generated. */
  thumbnailRef?: string
}

export interface CodeMetadata {
  kind: 'code'
  language: string | null
  lineCount: number
}

export interface RichTextMetadata {
  kind: 'richText'
  hasHtml: boolean
  hasRtf: boolean
}

export interface TextMetadata {
  kind: 'text'
  charCount: number
  wordCount: number
}

export type ClipItemMetadata =
  | TextMetadata
  | RichTextMetadata
  | ImageMetadata
  | FileMetadata
  | UrlMetadata
  | ColorMetadata
  | CodeMetadata

export interface Board {
  id: string
  name: string
  sortIndex: number
  createdAt: number
  updatedAt: number
  isSmart: boolean
  /** Serialized smart-query (type filter / search) when isSmart. */
  smartQuery: string | null
  deletedAt: number | null
}

export interface BoardItem {
  boardId: string
  itemId: string
  sortIndex: number
  createdAt: number
}

export type QuickFilter = 'all' | 'text' | 'images' | 'links' | 'files'

export const FAVOURITES_BOARD_ID = 'board-favourites'

/** Retention setting in days; null means unlimited. */
export type RetentionDays = number | null
