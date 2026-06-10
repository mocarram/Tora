/**
 * Type-to-search: decides whether a keydown (seen by the GLOBAL handler while
 * the deck has focus) should be forwarded to the search field.
 *
 * Printable characters qualify: `key` is a single character for those, and
 * anything modified by Cmd/Ctrl is a shortcut, not typing. Alt stays allowed -
 * on macOS Option+letter produces real printable characters. The leading
 * space is excluded so Space keeps meaning "expand preview" from the deck
 * (a query never usefully starts with a space), and IME composition events
 * are never forwarded.
 */
export interface TypeToSearchKey {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  isComposing?: boolean
}

export function isTypeToSearchKey(e: TypeToSearchKey): boolean {
  if (e.metaKey || e.ctrlKey || e.isComposing) return false
  if (e.key.length !== 1) return false // named keys: Enter, Escape, F5, arrows...
  if (e.key === ' ') return false // Space stays "expand preview"
  return true
}
