# Shell redesign - dock panel layout

Date: 2026-06-12
Branch: `design/shell-redesign`
Mockup: `2026-06-12-shell-redesign-mockup.html` (approved variant: **One bg - light**)

## Goal

Restructure the app shell to a dock-panel layout while keeping every existing
behaviour (capture, search, queue, boards, settings, modes) intact. Cards and
overlays are untouched.

## Decisions (user-approved)

1. **Sidebar holds categories only.** Brand + Library filters (All, Text,
   Images, Links, Files) + sync indicator. Boards and Settings move out.
2. **Boards become pills above the deck** (a pill strip): a History pill
   (no board), Favourites, then user boards each with a deterministic colored
   dot, then a + button. The strip scrolls horizontally.
3. **Settings gear** sits in the topbar immediately left of the Panel/Window
   switcher.
4. **Sidebar collapses to an icon rail** (84px, clearing the repositioned
   traffic lights with room to spare) - never fully hides. Toggle at the
   rail's foot. State persists via a new `sidebarCollapsed` setting.
5. **One unified background** ("One bg - light"): the whole shell sits on
   `--color-window`; the rail, topbar and statusbar lose their `--color-rail`
   tints and separating borders except a hairline on the rail's right edge.

## Component changes

- `Sidebar.tsx` - drop the Boards group and Settings row; add `collapsed` +
  `onToggleCollapse` props; collapsed renders icon-only rows with tooltips;
  nav aria-label becomes "Library".
- `BoardPills.tsx` (new) - the pill strip. Semantics: `role="tablist"`
  ("Boards") with `role="tab"` pills. Supports: select (History = boardId
  null), drag-item-onto-pill (`application/x-tora-item`), drag-reorder
  (`application/x-tora-board`), right-click context menu with Rename/Delete
  (role=menu), + button (aria-label "New board"). Favourites is not
  draggable/renamable/deletable (same rules as today).
- Rename uses the existing `TextPrompt` (initialValue = board name), managed
  by App like the New-board prompt. Delete uses the existing ConfirmDialog.
- `SearchBar.tsx` - collapses to a magnifier (32px) and expands to ~230px
  when focused or non-empty. Type-to-search and `/` still focus it (the input
  always exists). Count + clear button shown while a query is active.
- `App.tsx` - topbar order: search, board pills, spacer, settings gear,
  mode toggle. New state: rename-board prompt target. Sidebar collapse writes
  `updateSettings({ sidebarCollapsed })`.
- Filters now COMPOSE with boards: picking a category no longer clears the
  active board (type filter within the current collection).

## Settings

- `AppSettings.sidebarCollapsed: boolean` (default false): ipc.ts,
  DEFAULT_SETTINGS, settingsGuard BOOLEAN_KEYS (+ guard test).

## Visual notes

- Deck/cards/statusbar content unchanged; statusbar keeps its items but loses
  the top border and rail tint.
- Topbar keeps `-webkit-app-region: drag` with no-drag children.
- Board dot colors: pick from the muted `--type-*` palette by a stable hash
  of the board id.

## Tests

- Rework `boards.spec.ts` for pills (create, select, rename, delete via
  context menu, save-menu flow unchanged).
- New e2e: sidebar collapse toggles labels and persists across relaunch
  (settings round-trip); board pill drag-less add via save menu still covered.
- Unit: settingsGuard accepts `sidebarCollapsed`; existing suites stay green.
- Full gates: typecheck, lint, unit, e2e, build.
