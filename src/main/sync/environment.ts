import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { nanoid } from 'nanoid'

/**
 * Resolves the shared folder used for file-based (iCloud Drive) sync. On macOS
 * this is the user's iCloud Drive container, which the OS syncs across devices.
 * Elsewhere it falls back to a local folder so the same code path is testable.
 * Real cross-device iCloud propagation is not verified here; see GAPS.md.
 */
export function resolveSharedSyncDir(localFallback: string): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Tora')
  }
  return join(localFallback, 'shared')
}

/** Stable per-device id, persisted locally (never in the shared folder). */
export function loadOrCreateDeviceId(baseDir: string): string {
  const file = join(baseDir, 'device.id')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const id = nanoid(10)
  mkdirSync(baseDir, { recursive: true })
  writeFileSync(file, id, 'utf8')
  return id
}
