import { nanoid } from 'nanoid'
import { openDatabase, type Database } from '../db'
import { BlobStore } from './blobStore'
import { ItemsRepo } from './itemsRepo'
import { BoardsRepo } from './boardsRepo'
import { SettingsRepo } from './settingsRepo'

/**
 * Bundles the database connection, typed repositories, and the blob store. This
 * is the single storage entry point used by the capture pipeline and IPC
 * handlers. Constructed with explicit paths so it can be exercised in tests
 * without Electron.
 */
export class Storage {
  readonly db: Database
  readonly items: ItemsRepo
  readonly boards: BoardsRepo
  readonly settings: SettingsRepo
  readonly blobs: BlobStore

  constructor(opts: { dbFile: string; blobDir: string }) {
    this.db = openDatabase(opts.dbFile)
    this.items = new ItemsRepo(this.db)
    this.boards = new BoardsRepo(this.db, () => nanoid(12))
    this.settings = new SettingsRepo(this.db)
    this.blobs = new BlobStore(opts.blobDir)
  }

  async init(): Promise<void> {
    await this.blobs.init()
    this.boards.ensureDefaults()
  }

  newId(): string {
    return nanoid(12)
  }

  close(): void {
    this.db.close()
  }
}
