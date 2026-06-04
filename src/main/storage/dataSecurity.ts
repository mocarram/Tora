import { chmod } from 'node:fs/promises'
import { chmodSync } from 'node:fs'

/**
 * Restrictive permissions for the on-disk data (SQLite db, blobs, sync key).
 * Clipboard history is sensitive, so the files holding it are made owner-only:
 * directories 0o700 (no group/other traversal) and files 0o600 (no group/other
 * read). The directory mode is the strongest single lever - it stops other
 * local users entering the tree at all, regardless of individual file modes.
 *
 * POSIX-only: Windows ignores these bits (its ACLs already scope the per-user
 * app-data dir), so we skip it there. Every call is best-effort: a chmod failure
 * (e.g. an exotic filesystem) must never crash the app, so errors are swallowed.
 */
export const DIR_MODE = 0o700
export const FILE_MODE = 0o600

export async function secureDir(path: string): Promise<void> {
  if (process.platform === 'win32') return
  try {
    await chmod(path, DIR_MODE)
  } catch {
    // best-effort; non-fatal
  }
}

/** Synchronous variant for code paths that are already sync (key store). */
export function secureDirSync(path: string): void {
  if (process.platform === 'win32') return
  try {
    chmodSync(path, DIR_MODE)
  } catch {
    // best-effort; non-fatal
  }
}

export function secureFileSync(path: string): void {
  if (process.platform === 'win32') return
  try {
    chmodSync(path, FILE_MODE)
  } catch {
    // best-effort; non-fatal
  }
}
