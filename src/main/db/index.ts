import Database from 'better-sqlite3'
import { runMigrations } from './migrations'
import { secureFileSync } from '../storage/dataSecurity'

/**
 * Opens the SQLite database with sensible pragmas for a local desktop app and
 * applies migrations. WAL gives concurrent read while writing; NORMAL sync is
 * the right durability/perf trade-off for a local cache-like store.
 */
export function openDatabase(filename: string): Database.Database {
  const db = new Database(filename)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  runMigrations(db)
  // The db holds clipboard history; lock it (and the WAL/SHM sidecars that WAL
  // mode just created) to owner-only so other local users cannot read it.
  secureFileSync(filename)
  secureFileSync(`${filename}-wal`)
  secureFileSync(`${filename}-shm`)
  return db
}

export type { Database } from 'better-sqlite3'
