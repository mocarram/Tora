/**
 * Pure presentation helpers. Platform-agnostic, unit-tested, reused by iOS.
 */

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

/** Human byte size with one decimal where it helps. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < KB) return `${bytes} B`
  if (bytes < MB) return `${round(bytes / KB)} KB`
  if (bytes < GB) return `${round(bytes / MB)} MB`
  return `${round(bytes / GB)} GB`
}

function round(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

const MIN = 60_000
const HOUR = MIN * 60
const DAY = HOUR * 24
const WEEK = DAY * 7

/** Compact relative time, e.g. "now", "5m", "3h", "2d", "6w". */
export function relativeTime(from: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - from)
  if (delta < 45_000) return 'now'
  if (delta < HOUR) return `${Math.round(delta / MIN)}m`
  if (delta < DAY) return `${Math.round(delta / HOUR)}h`
  if (delta < WEEK) return `${Math.round(delta / DAY)}d`
  if (delta < WEEK * 52) return `${Math.round(delta / WEEK)}w`
  return `${Math.round(delta / (WEEK * 52))}y`
}

/** Single-line, collapsed-whitespace summary capped at `max` chars. */
export function toPreviewLine(text: string, max = 280): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed
}

/** Truncate the middle of a long path/string, keeping both ends legible. */
export function truncateMiddle(value: string, max = 42): string {
  if (value.length <= max) return value
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (trimmed.length === 0) return 0
  return trimmed.split(/\s+/).length
}
