# Tora - Build Summary

A privacy-first macOS clipboard manager (Electron now, with a pure core ready for
a React Native iOS app). Built end to end through all seven phases of the spec.
This file records the decisions, the measured performance, and how to run and
polish it. Stubs and unverified items are in `GAPS.md` (read it - the build host
was Linux, so macOS-native and GUI paths are type/build/test-verified only).

## Decisions

- **Toolchain (current at build time):** Electron 42, electron-vite 5, Vite 7,
  React 19, TypeScript 6 (strict, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`), ESLint 10 + typescript-eslint 8, Vitest 4,
  Playwright 1.6, electron-builder 26, better-sqlite3 12. Vite was pinned to 7
  (not 8) for electron-vite compatibility; rationale and the dependency analysis
  are in the Phase 0 commit.
- **No `any`**, no em dashes (an ESLint `no-restricted-syntax` rule enforces the
  latter in code), and `core/` is forbidden from importing Electron or Node
  built-ins by an ESLint rule - so the iOS-reuse boundary is mechanically
  enforced, not just intended.
- **Own search and virtualization** instead of fuse.js / react-window: the fuzzy
  ranker lives in `core/` (pure, tested, iOS-reusable) and the horizontal deck is
  a small custom virtualizer, avoiding library API churn and giving full control
  of the "stack of cards" feel.
- **Design:** a committed, opinionated identity (DESIGN.md): Tora the tiger, a
  deck of warm paper cards with one tiger-amber accent. Two-layer design tokens
  (primitive ramps to semantic), a self-hosted variable-font trio (Space Grotesk
  / Hanken Grotesk / JetBrains Mono via `@fontsource-variable`, bundled not
  fetched), spring-led motion that respects reduced-motion. No purple/blue, no
  glassmorphism, no emoji, no Inter.
- **Security:** `contextIsolation` on, `nodeIntegration` off, `sandbox` on, a
  strict CSP, navigation + window-open locked down, and a single typed
  `contextBridge` surface (`window.tora`). The renderer never touches disk or the
  clipboard.
- **Storage:** better-sqlite3 with forward-only migrations and WAL; large
  payloads on disk in a blob store, never inlined; `sync_state` change vectors on
  every mutation. Repos are decoupled from Electron so they run under Node in
  tests against real SQLite.
- **Sync:** one pure last-writer-wins model in `core/`; a working encrypted,
  file-based iCloud Drive provider (verified between two instances on a shared
  folder); a local-only default; a CloudKit scaffold. AES-256-GCM with a
  Keychain-wrapped key.
- **Privacy:** local by default, zero telemetry/network calls, concealed/transient
  content never stored, password managers excluded by default, optional Touch ID
  lock.

## Measured performance

Real numbers from `src/main/perf.bench.test.ts` (10,000 items, on the Linux build
container - a Mac will differ but the budgets hold with large margin):

| Metric                                   | Budget   | Measured     |
| ---------------------------------------- | -------- | ------------ |
| Insert 10k items (one transaction)       | -        | 564 ms (0.056 ms/item) |
| History page query (120 items)           | < 16 ms  | ~11.8 ms     |
| Keystroke to results (warm index, 10k)   | < 50 ms  | ~6.4 ms      |
| Cold search-index build + first search   | -        | ~17 ms       |

Run them yourself: `npx vitest run src/main/perf.bench.test.ts` (numbers print to
the console). Idle CPU is near zero by design: capture is a 500ms low-frequency
poll that does real work only when a cheap signature changes; retention runs
hourly; sync writes are debounced. The deck is virtualized (only the visible
window mounts) for 60fps scroll at 10k+, and thumbnails load lazily off-heap via
the `tora-blob://` protocol.

> Cold-panel-summon-to-interactive (< 150ms) and 60fps scroll are GUI metrics
> that need a running app on macOS; not measured on this headless host (GAPS.md).

## Tests

89 tests, all green (`npm test`):

- `core/`: format, hashing, color/url/code parsers, capture classification +
  dedup, fuzzy search ranking (incl. a 10k-under-50ms check), sync conflict
  resolution.
- `main/`: storage + repos + migrations against real SQLite, capture pipeline,
  retention, search index, and **two-instance encrypted sync over a shared
  folder** (propagation, ciphertext-at-rest, tombstones, last-writer-wins).
- A Playwright critical-flow spec exists (`tests/e2e/`) but needs a display +
  Electron binary; not run here.

## How to run

Requires Node 22+. On **macOS** (to actually use the app):

```bash
# allow the real Electron binary (the repo skips it for headless CI)
sed -i '' '/ELECTRON_SKIP_BINARY_DOWNLOAD/d' .npmrc   # or just delete the line
npm install
npm run rebuild      # better-sqlite3 against the Electron ABI
npm run dev          # launch with HMR
```

Verify any time, anywhere:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Package a dmg: see `RELEASE.md` (signing/notarization via env vars).

## Polish steps for the reviewer

Highest-value items from `GAPS.md`, roughly in order:

1. Run on a Mac and confirm vibrancy, the bottom-panel summon, spring motion, and
   the Accessibility paste flow; grant permissions through the onboarding.
2. Implement the paste confirmation flash/sound (toggles already exist).
3. Implement local link-preview fetching behind the existing `fetchLinkPreviews`
   toggle (title + favicon), respecting the privacy default of off.
4. Sign + notarize a build and smoke-test the dmg.
5. Verify real iCloud Drive sync across two Macs; then, if desired, implement the
   CloudKit transport against the existing scaffold.
6. Optional niceties: within-board drag reorder UI, smart boards, type-preserving
   in-place edit, size-based storage eviction.

## Repository map

`DESIGN.md` design system - `DATA.md` schema - `SYNC.md` sync - `RELEASE.md`
packaging - `GAPS.md` honest gaps - `README.md` overview. Source under `src/`
split into `core/ main/ preload/ renderer/ shared/`.
