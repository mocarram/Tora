import { execFile } from 'node:child_process'

/**
 * Direct paste into the previously focused app by synthesising Cmd+V through
 * macOS Accessibility (AppleScript System Events). Requires the user to have
 * granted Accessibility permission (see permissions.ts / onboarding).
 *
 * macOS only and not runtime-verified on this Linux host; see GAPS.md.
 */
export function pasteIntoFrontApp(): Promise<void> {
  if (process.platform !== 'darwin') return Promise.resolve()
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to keystroke "v" using command down'],
      { timeout: 2000 },
      (err) => (err ? reject(new Error(err.message)) : resolve()),
    )
  })
}
