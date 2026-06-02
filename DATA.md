# Tora - Data Model

SQLite via better-sqlite3 in the main process. Blobs live on disk and are
referenced by id; they are never inlined into the database. The schema is
applied through forward-only migrations keyed on `PRAGMA user_version`
(`src/main/db/migrations.ts`). The current version is **1**.

## Connection

`openDatabase()` (`src/main/db/index.ts`) sets:

- `journal_mode = WAL` - concurrent reads during writes.
- `synchronous = NORMAL` - right durability/speed trade-off for a local store.
- `foreign_keys = ON`, `busy_timeout = 5000`.

## Tables (v1)

### items

The core clip records. Large payloads are on disk under `content_ref`.

| Column             | Type    | Notes                                                  |
| ------------------ | ------- | ------------------------------------------------------ |
| id                 | TEXT PK | nanoid(12)                                             |
| type               | TEXT    | text, richText, image, file, url, color, code          |
| created_at         | INTEGER | epoch ms                                               |
| updated_at         | INTEGER | epoch ms; bumped on dedup hit, edit, pin               |
| source_app         | TEXT    | frontmost app name (nullable)                          |
| source_bundle_id   | TEXT    | macOS bundle id (nullable)                             |
| preview_text       | TEXT    | short, cheap-to-render row summary                     |
| content_ref        | TEXT    | blob subdirectory name (= item id) or NULL             |
| content_hash       | TEXT    | FNV-1a content hash, used for dedup                    |
| is_pinned          | INTEGER | 0/1                                                    |
| byte_size          | INTEGER | size of underlying content                             |
| metadata           | TEXT    | JSON, type-specific (`ClipItemMetadata`)               |
| deleted_at         | INTEGER | soft-delete tombstone; NULL when live                  |

Indexes: `(deleted_at, is_pinned, updated_at DESC)` for the history list,
`(content_hash)` for dedup lookups, `(type, updated_at DESC)` for filters.

### boards

| Column      | Type    | Notes                                  |
| ----------- | ------- | -------------------------------------- |
| id          | TEXT PK | `board-favourites` for the default     |
| name        | TEXT    |                                        |
| sort_index  | INTEGER | board order in the rail                |
| created_at  | INTEGER |                                        |
| updated_at  | INTEGER |                                        |
| is_smart    | INTEGER | reserved for smart boards (queries)    |
| smart_query | TEXT    | serialized query when is_smart         |
| deleted_at  | INTEGER | soft-delete tombstone                  |

### board_items

Join table; an item can live in many boards.

| Column     | Type    | Notes                            |
| ---------- | ------- | -------------------------------- |
| board_id   | TEXT    | PK part                          |
| item_id    | TEXT    | PK part                          |
| sort_index | INTEGER | manual order within the board    |
| created_at | INTEGER |                                  |

Indexes: `(board_id, sort_index)`, `(item_id)`.

### settings

Single JSON document keyed `app`, merged over `DEFAULT_SETTINGS` on read so new
keys pick up defaults. (`src/main/storage/settingsRepo.ts`.)

### sync_state

Per-record change vectors driving the sync layer (Phase 6).

| Column         | Type    | Notes                                          |
| -------------- | ------- | ---------------------------------------------- |
| record_type    | TEXT    | item / board / board_item (PK part)            |
| record_id      | TEXT    | the record id, or `boardId:itemId` (PK part)   |
| rev            | INTEGER | local revision, bumped on each change          |
| updated_at     | INTEGER | last local change time                         |
| deleted        | INTEGER | tombstone flag                                 |
| dirty          | INTEGER | 1 = pending push to the sync provider          |
| last_synced_at | INTEGER | set after a successful push/pull               |

`markChange()` (`src/main/storage/syncState.ts`) is called by every mutating
repo method, so the sync provider can find dirty records and ship tombstones for
deletes.

## Blob store

`src/main/storage/blobStore.ts`. Each item with payloads owns a subdirectory
named by its id under `<userData>/blobs/`:

- `text.txt` - plain text
- `content.html` - HTML representation
- `content.rtf` - RTF representation
- `image.png` - full image
- `thumb.png` - lazy thumbnail

Retention (`src/main/services/retention.ts`) hard-deletes expired, non-pinned
rows and removes their blob directory. Unlimited retention is a no-op.

## iOS mapping

Every field maps cleanly to a Core Data / SQLite model on iOS. `metadata` stays
JSON, `content_ref` becomes a relative path inside the app container, and
`sync_state` carries across unchanged so the same `SyncProvider` logic
(`src/core`) drives both platforms.
