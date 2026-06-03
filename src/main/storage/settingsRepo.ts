import type { Database } from 'better-sqlite3'
import type { AppSettings } from '@shared/ipc'

/** Sensible, privacy-first defaults. Password managers excluded out of the box. */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  accent: 'amber',
  globalHotkey: 'CommandOrControl+Shift+V',
  launchAtLogin: false,
  retentionDays: 30,
  storageSoftCapBytes: 1024 * 1024 * 1024, // 1 GB
  pasteFormatDefault: 'keep',
  soundFeedback: false,
  visualFeedback: true,
  fetchLinkPreviews: false,
  excludedBundleIds: [
    'com.agilebits.onepassword7',
    'com.1password.1password',
    'com.apple.keychainaccess',
    'com.bitwarden.desktop',
    'com.dashlane.dashlanephonefinal',
    'in.sinew.Enpass-Desktop',
    'com.lastpass.LastPass',
  ],
  appLockEnabled: false,
  onboardingComplete: false,
  captureEnabled: true,
  syncProvider: 'local',
  reduceMotion: false,
  windowMode: 'panel',
}

const KEY = 'app'

export class SettingsRepo {
  constructor(private readonly db: Database) {}

  get(): AppSettings {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as
      | { value: string }
      | undefined
    if (!row) return { ...DEFAULT_SETTINGS }
    try {
      const parsed = JSON.parse(row.value) as Partial<AppSettings>
      // Merge so newly-added settings keys get their defaults.
      return { ...DEFAULT_SETTINGS, ...parsed }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = { ...this.get(), ...patch }
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(KEY, JSON.stringify(next))
    return next
  }
}
