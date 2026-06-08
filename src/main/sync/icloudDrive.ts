import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppSettings, SyncState, SyncStatus } from '@shared/ipc'
import { mergeSnapshots, pickWinner, recordKey, type SyncRecord } from '@core/sync'
import type { Storage } from '../storage'
import { isSafeBlobSegment } from '../storage/blobStore'
import { SyncRepo } from '../storage/syncRepo'
import { SyncCrypto } from './crypto'
import type { SyncController } from './index'

const BLOB_FILES = ['text.txt', 'content.html', 'content.rtf', 'image.png', 'thumb.png']
const DEBOUNCE_MS = 2500

/**
 * File-based, end-to-end-encrypted sync over a shared folder (iCloud Drive's
 * Mobile Documents directory on macOS). Each device writes its own encrypted
 * snapshot; sync merges every other device's snapshot on read using the core
 * last-writer-wins resolver, then mirrors blobs. This is eventually consistent
 * and not real-time; see SYNC.md.
 */
export class ICloudDriveController implements SyncController {
  private readonly repo: SyncRepo
  private readonly crypto: SyncCrypto
  private readonly recordsDir: string
  private readonly blobsDir: string
  private state: SyncState = 'idle'
  private lastSyncedAt: number | null = null
  private lastError: string | null = null
  private debounce: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly storage: Storage,
    baseDir: string,
    key: Buffer,
    private readonly deviceId: string,
    private readonly getSettings: () => AppSettings,
  ) {
    this.repo = new SyncRepo(storage.db)
    this.crypto = new SyncCrypto(key)
    this.recordsDir = join(baseDir, 'records')
    this.blobsDir = join(baseDir, 'blobs')
  }

  async start(): Promise<void> {
    await mkdir(this.recordsDir, { recursive: true })
    await mkdir(this.blobsDir, { recursive: true })
    await this.syncNow()
  }

  stop(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = null
  }

  status(): SyncStatus {
    return {
      provider: this.getSettings().syncProvider,
      state: this.state,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      pendingChanges: this.repo.dirtyCount(),
    }
  }

  notifyLocalChange(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => void this.syncNow(), DEBOUNCE_MS)
  }

  async setProvider(): Promise<void> {
    await this.syncNow()
  }

  async syncNow(): Promise<void> {
    if (this.running) return
    this.running = true
    this.state = 'syncing'
    try {
      await this.pull()
      await this.push()
      this.lastSyncedAt = Date.now()
      this.lastError = null
      this.state = 'idle'
    } catch (err) {
      this.state = 'error'
      this.lastError = err instanceof Error ? err.message : String(err)
    } finally {
      this.running = false
    }
  }

  // ---- Pull: merge every other device's snapshot in ----------------------

  private async pull(): Promise<void> {
    const remote = await this.readRemoteSnapshot()
    if (remote.size === 0) return
    const local = this.repo.localSnapshot()
    const toApply = mergeSnapshots(local, remote)
    for (const rec of toApply) {
      if (!rec.deleted && rec.type === 'item') await this.restoreBlobs(rec.id)
      this.repo.applyRemote(rec)
    }
  }

  private async readRemoteSnapshot(): Promise<Map<string, SyncRecord>> {
    let files: string[]
    try {
      files = await readdir(this.recordsDir)
    } catch {
      return new Map()
    }
    const merged = new Map<string, SyncRecord>()
    for (const file of files) {
      if (!file.endsWith('.enc') || file === `${this.deviceId}.enc`) continue
      try {
        const buf = await readFile(join(this.recordsDir, file))
        const records = JSON.parse(this.crypto.decrypt(buf)) as SyncRecord[]
        for (const rec of records) {
          const key = recordKey(rec)
          const winner = pickWinner(merged.get(key) ?? null, rec)
          if (winner) merged.set(key, winner)
        }
      } catch {
        // Skip an unreadable/corrupt device file; others still merge.
      }
    }
    return merged
  }

  // ---- Push: write this device's encrypted snapshot + blobs --------------

  private async push(): Promise<void> {
    const snapshot = [...this.repo.localSnapshot().values()]
    const payload = this.crypto.encrypt(JSON.stringify(snapshot))
    await writeFile(join(this.recordsDir, `${this.deviceId}.enc`), payload)

    for (const rec of snapshot) {
      const ref = rec.data?.content_ref
      if (!rec.deleted && rec.type === 'item' && typeof ref === 'string') {
        await this.mirrorBlobs(ref)
      }
    }
    this.repo.markAllSynced(Date.now())
  }

  private async mirrorBlobs(ref: string): Promise<void> {
    // refs originate from sync records (a peer); never join a crafted ref that
    // could escape the blob root.
    if (!isSafeBlobSegment(ref)) return
    const dest = join(this.blobsDir, ref)
    let made = false
    for (const name of BLOB_FILES) {
      if (!this.storage.blobs.has(ref, name)) continue
      const buf = await this.storage.blobs.readBuffer(ref, name)
      if (!buf) continue
      if (!made) {
        await mkdir(dest, { recursive: true })
        made = true
      }
      await writeFile(join(dest, `${name}.enc`), this.crypto.encrypt(buf.toString('binary')))
    }
  }

  private async restoreBlobs(ref: string): Promise<void> {
    if (!isSafeBlobSegment(ref)) return
    const src = join(this.blobsDir, ref)
    let names: string[]
    try {
      names = await readdir(src)
    } catch {
      return
    }
    for (const encName of names) {
      const name = encName.replace(/\.enc$/, '')
      if (!BLOB_FILES.includes(name) || this.storage.blobs.has(ref, name)) continue
      try {
        const buf = await readFile(join(src, encName))
        const data = Buffer.from(this.crypto.decrypt(buf), 'binary')
        await this.storage.blobs.writeBuffer(ref, name, data)
      } catch {
        // Skip a blob that fails to decrypt; record still applies.
      }
    }
  }
}
