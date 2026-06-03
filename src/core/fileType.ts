/**
 * Lightweight file-type helpers. Pure and platform-agnostic (reused by iOS).
 */

const PREVIEWABLE_IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'heic',
  'heif',
  'tiff',
  'tif',
  'ico',
  'avif',
])

export function fileExtension(nameOrPath: string): string {
  const base = nameOrPath.split('/').pop() ?? nameOrPath
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/** Whether a file can be rendered as a raster image thumbnail. */
export function isPreviewableImage(nameOrPath: string): boolean {
  return PREVIEWABLE_IMAGE_EXTS.has(fileExtension(nameOrPath))
}
