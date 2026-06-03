import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/ipc'

// electron-updater is CommonJS; pull autoUpdater off the default import so it
// resolves under the package's "type": "module".
const { autoUpdater } = electronUpdater

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours

const IDLE: UpdateStatus = { state: 'idle', version: null, percent: null, error: null }

/**
 * In-app updates via electron-updater (Squirrel.Mac under the hood). Inert in
 * development and on unsigned builds - only a packaged, signed app can actually
 * apply an update, and macOS refuses unsigned ones. Surfaces a single
 * UpdateStatus to the renderer through the supplied emitter; the renderer shows
 * a banner and calls install() to quit-and-replace.
 */
export class Updater {
  private status: UpdateStatus = IDLE
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly onStatus: (status: UpdateStatus) => void) {}

  start(): void {
    if (!app.isPackaged) return
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.set({ state: 'downloading', version: info.version, percent: 0, error: null }),
    )
    autoUpdater.on('update-not-available', () => this.set(IDLE))
    autoUpdater.on('download-progress', (progress) =>
      this.set({ state: 'downloading', percent: Math.round(progress.percent) }),
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ state: 'downloaded', version: info.version, percent: 100, error: null }),
    )
    autoUpdater.on('error', (err) =>
      this.set({ state: 'error', error: err instanceof Error ? err.message : String(err) }),
    )

    void this.check()
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
  }

  async check(): Promise<void> {
    if (!app.isPackaged) return
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.set({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Quit and install a downloaded update. No-op until one is downloaded. */
  install(): void {
    if (this.status.state !== 'downloaded') return
    // quitAndInstall triggers app quit; dispose() (before-quit) marks the window
    // quitting so it can actually close instead of just hiding.
    autoUpdater.quitAndInstall()
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = {
      state: patch.state ?? this.status.state,
      version: patch.version ?? this.status.version,
      percent: patch.percent ?? this.status.percent,
      error: patch.error ?? (patch.state === 'error' ? this.status.error : null),
    }
    this.onStatus(this.status)
  }
}
