import { app } from 'electron'
import { join } from 'node:path'

export interface DataPaths {
  base: string
  dbFile: string
  blobDir: string
  syncDir: string
}

/**
 * Resolves on-disk locations under the OS app-data directory. A separate
 * DEV suffix keeps development data from colliding with a packaged install.
 */
export function resolvePaths(): DataPaths {
  const base = app.getPath('userData')
  return {
    base,
    dbFile: join(base, 'tora.db'),
    blobDir: join(base, 'blobs'),
    syncDir: join(base, 'sync'),
  }
}
