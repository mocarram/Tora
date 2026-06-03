import type { AccentTheme, ThemePreference } from '@shared/ipc'

/**
 * Resolves a theme preference to a concrete light/dark value and applies it to
 * the document root. When set to "system" it tracks the OS via matchMedia.
 */

export type ResolvedTheme = 'light' | 'dark'

/** Applies the accent "vibe" via data-accent; tokens.css does the retinting. */
export function applyAccent(accent: AccentTheme): void {
  document.documentElement.dataset.accent = accent
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref
}

export function applyTheme(pref: ThemePreference): void {
  document.documentElement.dataset.theme = resolveTheme(pref)
}

/**
 * Keeps the document theme in sync while `pref` is "system". Returns an
 * unsubscribe function. No-op listener when pref is explicit.
 */
export function watchTheme(pref: ThemePreference): () => void {
  applyTheme(pref)
  if (pref !== 'system' || !window.matchMedia) return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = (): void => applyTheme('system')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
