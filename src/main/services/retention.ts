import type { Storage } from '../storage'

const DAY_MS = 86_400_000

/**
 * Prunes items older than the retention window. Pinned items are always kept.
 * Removes the row and its on-disk blobs. Runs on a relaxed timer and on launch;
 * unlimited retention (null) is a no-op.
 */
export class RetentionService {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly storage: Storage,
    private readonly intervalMs = 60 * 60 * 1000, // hourly
  ) {}

  start(): void {
    void this.runOnce()
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs)
    if (this.timer.unref) this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Returns how many items were pruned. */
  async runOnce(): Promise<number> {
    const days = this.storage.settings.get().retentionDays
    if (days === null) return 0 // unlimited
    const cutoff = Date.now() - days * DAY_MS
    const expired = this.storage.items.expiredRefs(cutoff)
    let pruned = 0
    for (const { id, contentRef } of expired) {
      // The loop awaits blob I/O between deletes, so the snapshot can go stale:
      // re-check that the user has not pinned (or boarded) this item since.
      if (!this.storage.items.stillExpirable(id, cutoff)) continue
      // Tombstone before reclaiming the row: without a sync_state tombstone a
      // synced peer would just push the pruned item straight back on the next
      // sync. hardDelete leaves the tombstone (a separate table) in place.
      this.storage.items.softDelete(id)
      this.storage.items.hardDelete(id)
      pruned++
      if (contentRef) await this.storage.blobs.remove(contentRef)
    }
    return pruned
  }
}
