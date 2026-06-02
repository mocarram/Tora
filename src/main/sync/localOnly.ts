import type { AppSettings, SyncStatus } from '@shared/ipc'
import type { Storage } from '../storage'
import type { SyncController } from './index'

/**
 * Local-only controller: the app is fully usable with sync off. Pending changes
 * accumulate in sync_state but are never pushed. Phase 6 adds the iCloud Drive
 * and CloudKit controllers behind this same interface.
 */
export class LocalOnlyController implements SyncController {
  constructor(
    private readonly storage: Storage,
    _syncDir: string,
    private readonly getSettings: () => AppSettings,
  ) {}

  start(): Promise<void> {
    return Promise.resolve()
  }

  stop(): void {}

  status(): SyncStatus {
    const pending = (
      this.storage.db.prepare('SELECT COUNT(*) AS c FROM sync_state WHERE dirty = 1').get() as {
        c: number
      }
    ).c
    return {
      provider: this.getSettings().syncProvider,
      state: 'disabled',
      lastSyncedAt: null,
      lastError: null,
      pendingChanges: pending,
    }
  }

  syncNow(): Promise<void> {
    return Promise.resolve()
  }

  setProvider(): Promise<void> {
    return Promise.resolve()
  }

  notifyLocalChange(): void {}
}
