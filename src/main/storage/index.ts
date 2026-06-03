import { nanoid } from 'nanoid'
import { FAVOURITES_BOARD_ID } from '@core/model'
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

  /**
   * Erase all stored clipboard data: every item, board membership, custom board,
   * and blob. The default Favourites board is recreated empty. Settings are NOT
   * touched here (the caller resets those separately so the side effects fire).
   * The database work is a single transaction; blobs are removed wholesale.
   */
  async wipeData(): Promise<void> {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM board_items').run()
      this.db.prepare('DELETE FROM items').run()
      this.db.prepare('DELETE FROM boards WHERE id != ?').run(FAVOURITES_BOARD_ID)
      // Drop local change vectors too; with the data gone there is nothing left
      // to sync up. (A wipe is local-only; remote wipe is out of scope.)
      this.db.prepare('DELETE FROM sync_state').run()
    })
    tx()
    this.boards.ensureDefaults()
    await this.blobs.clear()
  }

  close(): void {
    this.db.close()
  }
}
