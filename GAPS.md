# Tora - Gaps, Stubs, and Unverified Items

Honest accounting of everything that is stubbed, partially implemented, or could
not be runtime-verified. The build/test host was **Linux**; the target is macOS,
so all macOS-native and GUI paths were built against local defaults and verified
by types, lint, build, and unit/integration tests only - not by running the app.

## Cannot be verified on this host (needs macOS + a display)

- **GUI never launched on the build host.** That host was headless Linux and
  skipped the Electron binary via the CI env var
  `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. The renderer builds and the bundle is
  produced, but the window, vibrancy, frameless bottom-panel positioning, and
  spring motion were not seen running there. On macOS a normal `npm install`
  downloads the binary; then `npm run rebuild` and `npm run dev`.
- **Native module ABI / Electron version.** `better-sqlite3` installs a Node
  prebuild here and is exercised by the test suite under Node. For the packaged
  app it must be rebuilt against Electron's ABI: `npm run rebuild`
  (electron-builder also does this at package time via `npmRebuild: true`).
  **Electron is pinned to 41, not 42:** `better-sqlite3@12.10.0` (its newest) does
  not compile against Electron 42's V8 13.8 (`v8::External` pointer-tag API
  change). Verified empirically - it builds cleanly on Electron 41. Bump to 42
  once better-sqlite3 ships a compatible release. This only surfaces when building
  the native module against real Electron headers (the Linux CI host uses a Node
  prebuild and never hit it).
- **Clipboard capture.** `ClipboardWatcher` uses Electron's `clipboard` API,
  including macOS concealed/transient markers (`org.nspasteboard.*`), `public.file-url`
  reading, and image buffers. Logic is structured and the downstream pipeline is
  fully unit-tested with synthetic input, but reading the real macOS pasteboard
  was not executed.
- **Frontmost-app detection** (`sourceApp.ts`, AppleScript) - macOS only, not run.
- **Accessibility paste injection** (`pasteInjector.ts`, AppleScript Cmd+V) - not
  run; requires the user to grant Accessibility.
- **Touch ID app lock** (`permissions.ts`, `systemPreferences`) - not run. On
  non-macOS hosts `biometricUnlock` returns `true`, so the lock screen is
  bypassable in Linux dev. On macOS it gates on a real Touch ID prompt.
- **Launch at login, menu-bar tray** - not run (the tray icon is generated and
  valid; the menu was not exercised).
- **Per-accent Dock icon** (`app.dock.setIcon`) - the six variants are generated
  and bundled, and the swap-on-accent-change code path is wired, but Dock
  recolouring is macOS-only and was not exercised on the Linux host.
- **Spaces / all-desktops panel** (`setVisibleOnAllWorkspaces`) - the panel is
  marked to join all Spaces so it opens on the active desktop instead of pulling
  focus back to its origin Space. macOS-only; not exercised on the Linux host.
- **safeStorage key wrapping** (`keyStore.ts`) - on macOS the sync key is wrapped
  by the Keychain. On a host without safeStorage it falls back to an **unwrapped**
  key file (clearly a dev-only fallback). Not verified on macOS.
- **Signing / notarization / dmg** - config is complete (`electron-builder.yml`,
  entitlements, `RELEASE.md`) but no build was signed; needs an Apple Developer
  account and macOS.
- **Playwright E2E** (`tests/e2e/critical.spec.ts`) - written but not run; needs
  the Electron binary and a display (xvfb on CI).

## Sync

- **Real iCloud cross-device sync is unverified.** What IS verified (real,
  runnable tests in `src/main/sync/icloudDrive.test.ts`): two instances over a
  shared folder propagate items + blobs, write only ciphertext, propagate delete
  tombstones, and resolve concurrent edits last-writer-wins. Actual iCloud Drive
  propagation between two Macs was not tested.
- **CloudKitController is a scaffold** (`cloudkit.ts`): conforms to the interface
  but does no I/O. Needs an Apple Developer account, a CloudKit container, and
  CloudKit JS token-based web auth. Marked `TODO(cloudkit)`; some Apple specifics
  are unconfirmed and should be checked against developer.apple.com.

## Partially implemented features

- **Link previews ARE implemented** (`linkPreview.ts`, `linkPreviewParse.ts`,
  `enrichLinkPreview` + `backfillLinkPreviews` in `application.ts`, with the
  SSRF guard in `ssrfGuard.ts` applied per redirect hop). Off by default for
  privacy. Residual known limitation: DNS rebinding between the guard's lookup
  and the actual connect cannot be fully closed with fetch() (documented in
  `ssrfGuard.ts`); acceptable for an opt-in, off-by-default feature.
- **Image thumbnails implemented but not GUI-verified.** Captured images store
  full `image.png` + `thumb.png` blobs; `thumbnailRef` is set on capture and the
  deck renders thumbnails via a sandboxed `tora-blob://` custom protocol
  (`registerBlobProtocol`, with a path-traversal guard); the large preview uses a
  full-image data URL. Not exercised in a running GUI on this host.
- **Visual/sound feedback settings exist but the behaviours do not.**
  `visualFeedback` and `soundFeedback` persist (and sync), but the paste
  confirmation flash and sound are not implemented, so the Settings toggles are
  HIDDEN until they are (failed actions do show an error toast). The keys stay
  in the schema for compatibility.
- **Synced binary blobs inflate ~1.5x on the wire.** `SyncCrypto` encrypts
  strings (UTF-8), so `mirrorBlobs` round-trips image bytes through a latin1
  string. Verified lossless, but a Buffer-native encrypt path would cut iCloud
  payload size; needs a compatibility dance with already-mirrored blobs.
- **Smart boards are schema-only.** `boards.is_smart` / `smart_query` exist in
  the schema and model but there is no UI to create or evaluate smart boards.
- **Within-board manual item reorder** has a repo method and IPC
  (`reorderBoardItems`) but no drag UI inside the deck; board *list* reorder and
  card-to-board add are wired in the sidebar.
- **Storage soft cap is indicator-only.** `storageSoftCapBytes` drives the status
  bar meter and an unlimited-history warning; eviction is by retention days, not
  by size cap.
- **Editing always yields a text item.** Editing a code/url clip in place
  re-saves it as plain text. Acceptable, but a type-preserving edit would be nicer.

## Notes

- No telemetry, crash reporting, or network calls exist anywhere (verifiable by
  inspecting `src/`). The only network-capable code that was planned (link
  previews) is not implemented.
- `core/` is guaranteed free of Electron and Node built-ins by an ESLint
  `no-restricted-imports` rule, so the iOS reuse claim is enforced, not just
  documented.
