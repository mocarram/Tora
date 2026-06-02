# Tora - Sync

Tora is local-first. Sync is optional and off by default; the app is fully
usable with it disabled. All synced data is encrypted on-device before it leaves,
so even iCloud Drive files are ciphertext at rest.

## Architecture

The conflict-resolution model is pure and platform-agnostic (`src/core/sync.ts`)
so the same logic will run in the future iOS app. Transports live in
`src/main/sync/` behind one `SyncController` interface:

- Every syncable record (item, board, board_item) carries a `rev` and an
  `updatedAt` in the `sync_state` table (`DATA.md`).
- Resolution is **last-writer-wins per record**: newer `updatedAt` wins, ties
  break by higher `rev`, then a tombstone wins (no resurrection), then a stable
  serialization tiebreak. `pickWinner` is deterministic so every device
  converges regardless of merge order (`mergeSnapshots`).
- Deletes are **tombstones** (`deleted = 1`), so other devices learn of them.

`SyncRepo` (`src/main/storage/syncRepo.ts`) exports a local snapshot of all
records and applies remote records, pinning `sync_state` to the remote version
(clean, not dirty) so merges never loop.

## Providers

### LocalOnlyController (default)

No-op. Changes still accumulate in `sync_state` (so turning sync on later ships
the backlog), but nothing is pushed. The app is fully functional.

### ICloudDriveController (working MVP)

File-based, end-to-end encrypted sync over a shared folder. On macOS the folder
is the iCloud Drive container
`~/Library/Mobile Documents/com~apple~CloudDocs/Tora`, which macOS syncs across
the user's devices.

- Each device writes its **own** encrypted snapshot `records/<deviceId>.enc`.
- `pull` reads every *other* device's snapshot, merges them with `pickWinner`,
  then merges the result over the local snapshot and applies the winners.
- Blobs are mirrored to `blobs/<itemId>/<name>.enc` and restored on pull.
- Writes are **debounced** (2.5s) after local changes; `syncNow` does a full
  pull + push.
- This is **eventually consistent and file-based, not real-time**. Two devices
  editing the same record while both offline converge on the later write once
  both files have propagated.

Encryption: AES-256-GCM (`crypto.ts`), random IV + auth tag per message. The
32-byte key is generated once and stored wrapped by Electron `safeStorage`
(Keychain-backed on macOS) via `keyStore.ts`; the plaintext key never touches
disk.

### CloudKitController (scaffold, inactive)

Conforms to `SyncController` but performs no I/O. Activating real CloudKit sync
needs an Apple Developer account, a CloudKit container, and CloudKit JS with
token-based web auth, which is awkward to host inside Electron. The container id
/ API token config slot and the CKRecord mapping are marked `TODO(cloudkit)` in
`cloudkit.ts`. Verify Apple's current requirements at developer.apple.com before
implementing - some specifics here are unconfirmed and flagged in GAPS.md.

## What was tested vs unverified

- **Tested (runnable, `src/main/sync/icloudDrive.test.ts`)**: two independent
  instances pointed at one shared folder. Verified: item + blob propagation A to
  B, ciphertext-only at rest (a known plaintext marker is absent from the shared
  files), delete tombstones propagating, and last-writer-wins on concurrent
  edits. Core merge logic unit-tested in `src/core/sync.test.ts`.
- **Unverified**: real iCloud Drive cross-device propagation (needs two Macs
  signed into iCloud), `safeStorage`/Keychain key wrapping (needs macOS), and
  the entire CloudKit path. See GAPS.md.
