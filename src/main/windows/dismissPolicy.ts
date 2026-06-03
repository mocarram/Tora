import type { AppSettings } from '@shared/ipc'

/**
 * Pure decision for panel auto-dismiss on blur. Kept Electron-free so it is unit
 * tested. The window only dismisses when it is a panel, nothing modal is open,
 * it is actually visible, and DevTools was not the thing that stole focus.
 */
export function shouldDismissOnBlur(opts: {
  mode: AppSettings['windowMode']
  hideSuppressed: boolean
  visible: boolean
  devToolsFocused: boolean
}): boolean {
  return opts.mode === 'panel' && !opts.hideSuppressed && opts.visible && !opts.devToolsFocused
}
