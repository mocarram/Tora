/**
 * Sync primitives. Pure and platform-agnostic so the same conflict resolution
 * runs on macOS now and iOS later. Transport (files, CloudKit) lives in main/.
 *
 * Model: every syncable record (item, board, board_item) carries a revision and
 * a last-modified timestamp. Resolution is last-writer-wins per record, with
 * deterministic tiebreaks so all devices converge on the same result regardless
 * of the order they merge in.
 */

export type SyncRecordType = 'item' | 'board' | 'board_item'

export interface SyncRecord {
  type: SyncRecordType
  id: string
  rev: number
  updatedAt: number
  deleted: boolean
  /** Full serialized row, or null for a tombstone. */
  data: Record<string, unknown> | null
}

/** Stable key for a record across devices. */
export function recordKey(r: Pick<SyncRecord, 'type' | 'id'>): string {
  return `${r.type}:${r.id}`
}

/**
 * Structural validation for records decoded from a peer's snapshot. The GCM
 * tag proves the file was written by a holder of the key, not that the payload
 * matches THIS app version's shape - an older/newer peer (or a corrupted
 * serializer) must not push malformed rows straight into local SQLite.
 */
export function isSyncRecord(v: unknown): v is SyncRecord {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    (r.type === 'item' || r.type === 'board' || r.type === 'board_item') &&
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.rev === 'number' &&
    Number.isFinite(r.rev) &&
    typeof r.updatedAt === 'number' &&
    Number.isFinite(r.updatedAt) &&
    typeof r.deleted === 'boolean' &&
    (r.data === null || (typeof r.data === 'object' && !Array.isArray(r.data)))
  )
}

/**
 * Choose the winning version of a record. Deterministic: newer updatedAt wins;
 * ties break by higher rev; remaining ties prefer a tombstone (so a delete is
 * not resurrected), then fall back to the lexicographically larger id-stable
 * serialization to guarantee convergence.
 */
export function pickWinner(a: SyncRecord | null, b: SyncRecord | null): SyncRecord | null {
  if (!a) return b
  if (!b) return a
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b
  if (a.rev !== b.rev) return a.rev > b.rev ? a : b
  if (a.deleted !== b.deleted) return a.deleted ? a : b
  // Final deterministic tiebreak on serialized payload.
  const sa = JSON.stringify(a.data ?? null)
  const sb = JSON.stringify(b.data ?? null)
  return sa >= sb ? a : b
}

/**
 * Merge a set of remote records over a local snapshot. Returns only the records
 * whose winner differs from the local version (i.e. the changes to apply
 * locally), keyed for easy application.
 */
export function mergeSnapshots(
  local: ReadonlyMap<string, SyncRecord>,
  remote: ReadonlyMap<string, SyncRecord>,
): SyncRecord[] {
  const toApply: SyncRecord[] = []
  for (const [key, remoteRec] of remote) {
    const localRec = local.get(key) ?? null
    const winner = pickWinner(localRec, remoteRec)
    if (winner && winner !== localRec) toApply.push(winner)
  }
  return toApply
}
