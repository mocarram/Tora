import { shell, systemPreferences } from 'electron'
import type { PermissionStatus } from '@shared/ipc'

/**
 * Wraps the macOS-specific permission and biometric APIs. On non-macOS hosts
 * everything degrades gracefully (accessibility reported true so the app stays
 * usable in development; biometrics false). Not runtime-verified on Linux; see
 * GAPS.md.
 */

export function getPermissions(): PermissionStatus {
  if (process.platform !== 'darwin') {
    return { accessibility: true, biometricsAvailable: false }
  }
  let biometricsAvailable: boolean
  try {
    biometricsAvailable = systemPreferences.canPromptTouchID()
  } catch {
    biometricsAvailable = false
  }
  return {
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
    biometricsAvailable,
  }
}

/** Prompt for Accessibility and open the relevant System Settings pane. */
export async function requestAccessibility(): Promise<void> {
  if (process.platform !== 'darwin') return
  // Passing true shows the system prompt the first time.
  systemPreferences.isTrustedAccessibilityClient(true)
  await shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  )
}

/** App lock via Touch ID. Resolves true when unlocked (or no biometric needed). */
export async function biometricUnlock(reason: string): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  try {
    await systemPreferences.promptTouchID(reason)
    return true
  } catch {
    return false
  }
}
