import type { AppSettings } from '@shared/ipc'

/**
 * Runtime validation for settings patches arriving over IPC. The TypeScript
 * types only constrain OUR renderer; the wire carries whatever the sender put
 * there, and applySettings feeds these values into the hotkey registrar, the
 * capture exclusion list, retention math, and the sync-provider switch. Every
 * field is checked; invalid or unknown fields are silently dropped (the rest
 * of the patch still applies).
 */

const THEMES = new Set(['system', 'light', 'dark'])
const ACCENTS = new Set(['amber', 'rose', 'violet', 'ocean', 'forest', 'graphite'])
const PASTE_FORMATS = new Set(['keep', 'plain'])
const SYNC_PROVIDERS = new Set(['local', 'icloud', 'cloudkit'])
const WINDOW_MODES = new Set(['panel', 'window'])

const MAX_HOTKEY_LEN = 64
const MAX_RETENTION_DAYS = 3650
const MAX_SOFT_CAP_BYTES = 1024 ** 4 // 1 TiB: far above any sane cap, still finite
const MAX_BUNDLE_IDS = 1000
const MAX_BUNDLE_ID_LEN = 256

const BOOLEAN_KEYS = [
  'launchAtLogin',
  'soundFeedback',
  'visualFeedback',
  'fetchLinkPreviews',
  'appLockEnabled',
  'onboardingComplete',
  'captureEnabled',
  'reduceMotion',
] as const

function isEnum(set: Set<string>, v: unknown): boolean {
  return typeof v === 'string' && set.has(v)
}

export function sanitizeSettingsPatch(patch: Partial<AppSettings>): Partial<AppSettings> {
  // Treat the input as untrusted wire data regardless of its declared type.
  const raw = patch as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if (isEnum(THEMES, raw.theme)) out.theme = raw.theme
  if (isEnum(ACCENTS, raw.accent)) out.accent = raw.accent
  if (isEnum(PASTE_FORMATS, raw.pasteFormatDefault)) out.pasteFormatDefault = raw.pasteFormatDefault
  if (isEnum(SYNC_PROVIDERS, raw.syncProvider)) out.syncProvider = raw.syncProvider
  if (isEnum(WINDOW_MODES, raw.windowMode)) out.windowMode = raw.windowMode

  if (
    typeof raw.globalHotkey === 'string' &&
    raw.globalHotkey.length > 0 &&
    raw.globalHotkey.length <= MAX_HOTKEY_LEN
  ) {
    out.globalHotkey = raw.globalHotkey
  }

  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key]
  }

  if (
    raw.retentionDays === null ||
    (typeof raw.retentionDays === 'number' &&
      Number.isInteger(raw.retentionDays) &&
      raw.retentionDays >= 1 &&
      raw.retentionDays <= MAX_RETENTION_DAYS)
  ) {
    out.retentionDays = raw.retentionDays
  }

  if (
    typeof raw.storageSoftCapBytes === 'number' &&
    Number.isFinite(raw.storageSoftCapBytes) &&
    raw.storageSoftCapBytes >= 0 &&
    raw.storageSoftCapBytes <= MAX_SOFT_CAP_BYTES
  ) {
    out.storageSoftCapBytes = Math.floor(raw.storageSoftCapBytes)
  }

  if (Array.isArray(raw.excludedBundleIds)) {
    out.excludedBundleIds = raw.excludedBundleIds
      .filter((id): id is string => typeof id === 'string')
      .filter((id) => id.length > 0 && id.length <= MAX_BUNDLE_ID_LEN)
      .slice(0, MAX_BUNDLE_IDS)
  }

  return out
}
