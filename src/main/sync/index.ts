import type { AppSettings, SyncStatus } from '@shared/ipc'
import type { Storage } from '../storage'
import { LocalOnlyController } from './localOnly'
import { ICloudDriveController } from './icloudDrive'
import { CloudKitController } from './cloudkit'

/**
 * Runtime controller around a sync provider. All providers share the same core
 * merge model (core/sync + SyncRepo); only the transport differs.
 */
export interface SyncController {
  start(): Promise<void>
  stop(): void
  status(): SyncStatus
  syncNow(): Promise<void>
  setProvider(provider: AppSettings['syncProvider']): Promise<void>
  notifyLocalChange(): void
}

export interface SyncDeps {
  storage: Storage
  getSettings: () => AppSettings
  /** Shared folder for file-based sync (iCloud Drive Mobile Documents). */
  sharedDir: string
  /** Local-only fallback dir (also where the wrapped key lives). */
  localDir: string
  /** 32-byte encryption key (resolved from the OS keychain in main). */
  key: Buffer
  deviceId: string
}

export function createSyncProvider(
  provider: AppSettings['syncProvider'],
  deps: SyncDeps,
): SyncController {
  switch (provider) {
    case 'icloud':
      return new ICloudDriveController(
        deps.storage,
        deps.sharedDir,
        deps.key,
        deps.deviceId,
        deps.getSettings,
      )
    case 'cloudkit':
      return new CloudKitController(deps.storage, deps.getSettings)
    default:
      return new LocalOnlyController(deps.storage, deps.localDir, deps.getSettings)
  }
}
