import type { AppSettings, SyncStatus } from '@shared/ipc'
import type { Storage } from '../storage'
import { LocalOnlyController } from './localOnly'

/**
 * Runtime controller around a SyncProvider. The full iCloud Drive and CloudKit
 * providers are implemented in Phase 6; the default is local-only (no-op).
 */
export interface SyncController {
  start(): Promise<void>
  stop(): void
  status(): SyncStatus
  syncNow(): Promise<void>
  setProvider(provider: AppSettings['syncProvider']): Promise<void>
  notifyLocalChange(): void
}

export function createSyncProvider(
  storage: Storage,
  syncDir: string,
  getSettings: () => AppSettings,
): SyncController {
  return new LocalOnlyController(storage, syncDir, getSettings)
}
