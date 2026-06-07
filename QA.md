# Tora QA Workflow

A repeatable, full-coverage test pass before any merge to `staging`/`main` or a
release. Two layers: an **automated gate** that runs anywhere, and a **live
macOS pass** that must run on a Mac (clipboard, paste injection, Touch ID, and
vibrancy cannot be exercised headless).

> Tip: a local Claude Code session on your Mac can drive most of the live pass
> using the `run` and `verify` skills. From the cloud, only the automated gate
> runs (no Electron binary / GUI).

---

## Layer 1: Automated gate (any machine)

One command, must be fully green:

```bash
npm run preflight
```

Runs, in order, and fails fast:

| Step           | Covers                                              |
| -------------- | --------------------------------------------------- |
| `typecheck`    | Code quality: strict TS (node + web projects)       |
| `lint`         | Code quality: ESLint (no-any, import guards, style) |
| `format:check` | Consistency: Prettier                               |
| `test`         | Correctness: 156 unit/integration tests (vitest)    |
| `build`        | Stability: production bundle builds clean            |
| `size`         | Performance: every artifact within byte budget      |
| `audit:prod`   | Security: 0 known vulns in production deps           |

Then, on a Mac with the Electron binary installed:

```bash
npm run rebuild      # better-sqlite3 against the Electron ABI (once per setup)
npm run test:e2e     # Playwright launches the real app: critical smoke flows
```

---

## Layer 2: Live macOS pass

Run `npm run dev`, then walk every box. Anything unchecked blocks the merge.

### Capture (every type)

- [ ] Plain text copied from any app appears instantly as a `text` card.
- [ ] Rich text (styled) captures as `richText`; preview readable.
- [ ] An image (screenshot) captures as `image` with a thumbnail + dimensions.
- [ ] A file copied in Finder captures as `file`; image files show a thumbnail.
- [ ] A URL captures as `url` (host shown; favicon only if link previews on).
- [ ] A hex/rgb color captures as `color` with a swatch.
- [ ] A code snippet captures as `code` with syntax highlight + language.
- [ ] Duplicate copy does not create a second card (dedup by hash).
- [ ] Copying from a password manager / a concealed clip is NOT captured.
- [ ] An app in the excluded-bundle list is never captured.

### Browse, search, filter

- [ ] `/` focuses search; fuzzy query matches text and source app.
- [ ] Quick filters (All / Text / Images / Links / Files) narrow correctly.
- [ ] Boards in the sidebar filter to their items; Favourites works.
- [ ] Large history scrolls smoothly (see Performance).

### Card actions

- [ ] Copy returns the clip to the clipboard.
- [ ] Paste (Enter) injects into the front app; Shift+Enter pastes plain.
- [ ] Queue (Q / Cmd-click multi-select) then sequential paste in order.
- [ ] Pin keeps a clip; pinned clips survive retention.
- [ ] Edit text updates the clip and preview.
- [ ] Rename title inline; clearing the title restores the type label.
- [ ] Save-to-board menu adds/removes from boards.
- [ ] Space / expand shows the large preview; Esc closes.
- [ ] Delete removes the card (and its blob).

### Boards

- [ ] Create, rename, reorder boards; order persists across relaunch.
- [ ] Add/remove items; reorder within a board.

### Window, panel, hotkey

- [ ] Global hotkey summons/dismisses the panel.
- [ ] Panel appears on the active Space and over fullscreen apps.
- [ ] Clicking outside the panel dismisses it; an open modal does not.
- [ ] Toggle to Window mode opens large enough to show the full grid; grid has
      equal top/bottom spacing and the first row clears the top bar.
- [ ] Toggle back to Panel mode restores the strip.

### Settings

- [ ] Theme (system/light/dark) and accent vibe apply live, incl. window vibrancy.
- [ ] Reduce motion respected.
- [ ] Retention + storage cap enforce; storage meter accurate.
- [ ] Global hotkey change takes effect; invalid accelerator handled.
- [ ] Launch-at-login toggles (signed build).
- [ ] App lock + Touch ID: locks on hide, unlocks with biometrics.
- [ ] Sync provider switch; status reflects syncing/idle/error.
- [ ] Link previews OFF by default; ON fetches title/favicon only.
- [ ] Clear data wipes clips/blobs/boards; factory reset restores defaults.

### Updates

- [ ] Update banner reflects state (signed build only; no-op in dev).

---

## Cross-cutting dimensions

### Security

- [ ] `npm run audit:prod` is clean (in the gate).
- [ ] Renderer has no Node access: `window.require`/`process` undefined in DevTools.
- [ ] Data dir is owner-only: `ls -ld ~/Library/Application\ Support/Tora` shows
      `drwx------`; db/blobs/key files are `-rw-------`.
- [ ] No secrets in the repo; `.env`/certs gitignored.
- [ ] Concealed/sensitive clips never written to disk or synced.

### Performance

- [ ] 10k+ items: deck and grid scroll at ~60fps (only the visible window mounts).
- [ ] Capture-to-card latency feels instant (<150ms).
- [ ] Memory stays flat over a long session (no growth on repeated capture/scroll).
- [ ] Bundle within budget (`npm run size`).

### Stability

- [ ] Run for a few hours with active copying: no crash, no leak, no "Electron
      quit unexpectedly".
- [ ] Quit/relaunch preserves history, boards, settings.
- [ ] No unhandled errors in the main terminal or the DevTools console.

### UI / UX

- [ ] Full keyboard nav: arrows move, Enter pastes, all shortcuts (Settings list) work.
- [ ] Focus rings visible; tab order sane.
- [ ] Light and dark both legible; type-coloured headers read well in both.
- [ ] Empty states and long content (truncation/ellipsis) look intentional.
- [ ] Animations smooth; honour reduce-motion.

---

## Sign-off

- [ ] Layer 1 (`npm run preflight`) green.
- [ ] `npm run test:e2e` green on macOS.
- [ ] Layer 2 live checklist fully checked.
- [ ] Note any known gaps (see `GAPS.md`) and confirm none are regressions.

Only then merge to `staging`.
