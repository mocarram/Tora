# Tora QA Workflow

A repeatable, production-grade test pass before any merge to `staging`/`main` or a
release. Three layers, in order of how much they can be automated:

1. **Automated gate** (`npm run preflight`) - runs anywhere, must be green.
2. **Live e2e suite** (`npm run test:e2e`) - drives the REAL app on macOS,
   isolated from your real history. This is the bulk of the live testing.
3. **Manual macOS pass** - only the handful of things automation cannot reach
   (vibrancy, Touch ID, signed-build behaviours, true 60fps / multi-hour memory).

---

## Layer 1: Automated gate (any machine)

One command, must be fully green:

```bash
npm run preflight
```

| Step           | Covers                                              |
| -------------- | --------------------------------------------------- |
| `typecheck`    | Strict TS across node + web + tests                 |
| `lint`         | ESLint (no-any, import guards, style)               |
| `format:check` | Prettier                                            |
| `test`         | 170+ unit/integration tests (vitest)                |
| `build`        | Production bundle builds clean                      |
| `size`         | Every artifact within byte budget                   |
| `audit:prod`   | 0 known vulnerabilities in production deps          |

---

## Layer 2: Live e2e suite (macOS)

Drives the built Electron app through Playwright's Electron support, against an
isolated `TORA_USER_DATA` dir so a run never reads or mutates your real history.
Running it IS the live test - it exercises the real capture pipeline, IPC bridge,
renderer, navigation, and persistence.

```bash
npm run rebuild      # better-sqlite3 vs the Electron ABI (after any `npm test`,
                     # which rebuilds it for Node)
npm run build        # produce out/ that the suite launches
npm run test:e2e     # the full suite (tests/e2e/*.spec.ts)
```

> Note: seeding clips writes the real system clipboard, so a run transiently
> overwrites whatever you had copied.

What the suite covers (`tests/e2e/`):

| Spec                       | Coverage                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `capture.spec`             | text / url / colour / code classification; dedup of identical copies                  |
| `navigation.spec`          | `/` search focus + query narrowing, quick filters, arrow-key selection                |
| `card-actions.spec`        | edit, inline rename, large preview, queue, pin (P), delete                            |
| `boards.spec`              | create, add-via-save-menu + filter, rename, delete                                    |
| `window-and-settings.spec` | Panel/Window toggle, every settings section, reduce-motion, clear-data                |
| `security.spec`            | renderer has no Node (`require`/`module`/`process` undefined); data dir 0700, db 0600 |
| `stability.spec`           | a full session logs zero renderer errors; quit/relaunch preserves history             |
| `performance.spec`         | capture-to-render latency budget; `queryItems` round-trip budget                      |
| `critical.spec`            | smoke: window loads, onboarding dismiss, search, settings, filters                    |

The harness lives in `tests/e2e/helpers.ts` (`launchApp`, `seedClip`, `cardWith`,
`itemCount`, `getSetting`, `measureQuery`). Add new flows there.

---

## Layer 3: Manual macOS pass (only what automation can't reach)

Run `npm run dev` and verify, since these need a human eye, real hardware, or a
signed build:

- [ ] **Vibrancy / theme**: light + dark and each accent vibe read well; window
      vibrancy looks right; type-coloured headers legible in both themes.
- [ ] **Reduce motion**: with macOS Reduce Motion on, the panel/overlays and the
      sync spinner do not animate.
- [ ] **Paste injection**: Enter pastes into the previously focused app;
      Shift+Enter pastes plain; the paste queue pastes in order. (e2e cannot
      assert injection into a third-party app.)
- [ ] **Global hotkey / panel**: the hotkey summons/dismisses; the panel appears
      on the active Space and over fullscreen apps; click-outside dismisses but an
      open modal does not.
- [ ] **Concealed clips**: copy from a password manager (or a concealed clip) -
      it is NOT captured. (Covered at the unit level; verify once on device.)
- [ ] **Touch ID app-lock**: locks on hide, unlocks with biometrics.
- [ ] **Launch at login**: toggles in a signed build.
- [ ] **Sync**: switch to iCloud; the wordmark sync indicator spins while syncing
      and settles; a second device converges.
- [ ] **Performance at scale**: with ~10k items the deck/grid scroll at ~60fps and
      memory stays flat over a long session. (Ranking is unit-tested at 10k.)
- [ ] **Update banner**: reflects state in a signed build.

---

## Sign-off

- [ ] Layer 1 (`npm run preflight`) green.
- [ ] Layer 2 (`npm run test:e2e`) green on macOS.
- [ ] Layer 3 manual checklist walked; note any known gaps (see `GAPS.md`) and
      confirm none are regressions.

Only then merge to `staging`.
