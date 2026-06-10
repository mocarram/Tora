# Type-to-search

When Tora is open and the user starts typing, the keystrokes go to the search
bar automatically - summon, type, Enter. No clicking the field, no `/` first.

## Decisions (made with the user)

1. **Any printable character starts a search.** The four single-letter
   shortcuts move behind Cmd: `⌘C` copy, `⌘E` edit, `⌘P` pin, `⌘D` queue
   (`⌘Q` stays macOS quit).
2. **The query clears on every panel summon** - each summon starts fresh
   (empty query, full deck, latest item selected). Window mode keeps its
   query; it is a persistent window and `panel-shown` never fires there.

## Mechanism

Focus-forwarding in App's existing global keydown handler: when no overlay is
open, focus is not already in an input, and the key is printable
(`key.length === 1`, no `⌘`/`⌃`, not IME composition, not the leading space),
focus the search input and do NOT preventDefault - the keystroke's default
action inserts the character into the now-focused field. The existing 150ms
search debounce handles the rest.

Rejected alternatives: permanently-focused search input (breaks
Space-to-preview and focus semantics); buffering keys into the store
(re-implements the platform).

## Keyboard map after the change

| Key | Action |
| --- | --- |
| any printable char | focus search + type (debounced search) |
| `⌘C` / `⌘E` / `⌘P` / `⌘D` | copy / edit / pin / queue the selected card |
| `Enter` / `⇧Enter` | paste / paste plain (unchanged) |
| `Space` (deck focused) | expand preview (leading space is meaningless) |
| `⌫` (deck focused) | delete card (non-printable, unchanged) |
| arrows | navigate, including while typing (unchanged) |
| `Esc` | blur search → hide panel (unchanged) |
| `/` | focus search without inserting (kept, now redundant) |

Subtle rule: while the search input is focused, `⌘C` with a text selection in
the input stays native copy; with no selection it copies the selected card.
The other three Cmd shortcuts always act on the card (they have no useful
native meaning in a search field) and preventDefault their browser defaults
(`⌘P` print, `⌘E` find-pasteboard, `⌘D` bookmark).

## Touched surfaces

- `src/renderer/src/lib/typeToSearch.ts` (new): pure `isTypeToSearchKey`
  predicate + unit tests.
- `src/renderer/src/App.tsx`: handler rewiring, status-bar hint
  ("⌘-click or ⌘D to queue").
- `src/renderer/src/store/useStore.ts`: `onPanelShown` resets `query: ''`.
- `src/renderer/src/components/Settings.tsx`: shortcuts list gains
  "Type to search" and the Cmd-modified entries.
- e2e: `card-actions.spec.ts` `p` → `Meta+p`; new `type-to-search.spec.ts`
  (typing focuses search + filters; `⌘C` mid-search copies the card;
  summon-reset covered at the store level).
