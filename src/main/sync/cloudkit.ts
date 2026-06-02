import type { AppSettings, SyncStatus } from '@shared/ipc'
import type { Storage } from '../storage'
import { SyncRepo } from '../storage/syncRepo'
import type { SyncController } from './index'

/**
 * CloudKit provider SCAFFOLD - intentionally inactive.
 *
 * Activating real-time CloudKit sync from an Electron app requires an Apple
 * Developer account, a CloudKit container, and CloudKit JS with token-based web
 * auth (which is awkward to host inside Electron). None of that is configured
 * here, so this controller conforms to the interface but performs no network
 * I/O. It reuses the same core merge model (SyncRepo + core/sync) so wiring the
 * transport later is the only remaining work. See SYNC.md and GAPS.md.
 *
 * TODO(cloudkit): container id + API token config slot, CloudKit JS auth flow,
 * map SyncRecord <-> CKRecord, subscriptions for push. Verify current Apple
 * requirements against developer.apple.com before implementing.
 */
export class CloudKitController implements SyncController {
  private readonly repo: SyncRepo

  constructor(
    storage: Storage,
    private readonly getSettings: () => AppSettings,
  ) {
    this.repo = new SyncRepo(storage.db)
  }

  start(): Promise<void> {
    return Promise.resolve()
  }

  stop(): void {}

  status(): SyncStatus {
    return {
      provider: this.getSettings().syncProvider,
      state: 'disabled',
      lastSyncedAt: null,
      lastError: 'CloudKit is not configured in this build.',
      pendingChanges: this.repo.dirtyCount(),
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
