# Search Match-Case / Whole-Word Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fuzzy-subsequence search default with case-insensitive multi-term substring matching, and add VS Code-style **Aa** (Match Case) and **ab** (Match Whole Word) toggles to the search bar.

**Architecture:** All matching logic stays pure in `src/core/search.ts` (shared with the future iOS app). The renderer holds two boolean view-state flags, sends them on every `queryItems` request, and the main-process search index forwards them to `rankItems`. The SearchBar renders two toggle buttons that flip the flags and re-query.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), Zustand store, Vitest (unit), Playwright (e2e). better-sqlite3 ABI: `npm rebuild better-sqlite3` for vitest, `npm run rebuild` for Playwright.

---

### Task 1: Core matching - SearchOptions, termScore, rankItems

Rewrite the ranker to multi-term substring with case/whole-word options. The fuzzy `fuzzyScore` export is removed.

**Files:**
- Modify (full rewrite): `src/core/search.ts`
- Modify (full rewrite): `src/core/search.test.ts`

- [ ] **Step 1: Replace the test file with the new semantics**

Overwrite `src/core/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rankItems, termScore, type SearchCandidate } from './search'

describe('termScore', () => {
  // termScore takes already-case-normalised inputs and returns a number (best
  // occurrence score) or null when the term is absent under the wholeWord rule.
  it('returns null when the term is not a substring', () => {
    expect(termScore('cat', 'dog house', false)).toBeNull()
  })
  it('scores a substring match (non-null) anywhere by default', () => {
    expect(termScore('cat', 'category', false)).not.toBeNull()
    expect(termScore('cat', 'a scatter plot', false)).not.toBeNull()
  })
  it('whole-word: matches a standalone word, rejects mid-word', () => {
    expect(termScore('cat', 'the cat sat', true)).not.toBeNull()
    expect(termScore('cat', 'cat.', true)).not.toBeNull()
    expect(termScore('cat', 'category', true)).toBeNull()
    expect(termScore('cat', 'scatter', true)).toBeNull()
  })
  it('scores a start match above a word-boundary match above mid-word', () => {
    const start = termScore('re', 'release', false)!
    const boundary = termScore('re', 'the release', false)! // 're' after a space
    const mid = termScore('re', 'wires', false)! // mid-word
    expect(start).toBeGreaterThan(boundary)
    expect(boundary).toBeGreaterThan(mid)
  })
  it('scores an earlier occurrence at least as high as a later one', () => {
    const early = termScore('x', 'x________', false)!
    const late = termScore('x', '________x', false)!
    expect(early).toBeGreaterThan(late)
  })
})

describe('rankItems', () => {
  const items: SearchCandidate[] = [
    { id: '1', text: 'design tokens', secondary: 'Figma', updatedAt: 100 },
    { id: '2', text: 'const spring = 520', secondary: 'VS Code', updatedAt: 200 },
    { id: '3', text: 'warm amber accent', secondary: 'Notes', updatedAt: 300 },
  ]

  it('returns all by recency for an empty query', () => {
    expect(rankItems('', items).map((x) => x.id)).toEqual(['3', '2', '1'])
  })
  it('returns all by recency for a whitespace-only query', () => {
    expect(rankItems('   ', items).map((x) => x.id)).toEqual(['3', '2', '1'])
  })
  it('ranks the best textual match first', () => {
    expect(rankItems('spring', items)[0]?.id).toBe('2')
  })
  it('matches the secondary field (source app)', () => {
    expect(rankItems('figma', items).map((x) => x.id)).toContain('1')
  })
  it('excludes non-matches', () => {
    expect(rankItems('zzzz', items)).toHaveLength(0)
  })
  it('is case-insensitive by default', () => {
    expect(rankItems('AMBER', items).map((x) => x.id)).toContain('3')
  })

  it('multi-term requires every term, order-independent', () => {
    const c: SearchCandidate[] = [
      { id: 'both', text: 'wallet for eth staking', secondary: null, updatedAt: 1 },
      { id: 'rev', text: 'eth and a wallet', secondary: null, updatedAt: 2 },
      { id: 'one', text: 'just a wallet', secondary: null, updatedAt: 3 },
    ]
    const ids = rankItems('wallet eth', c).map((x) => x.id)
    expect(ids).toContain('both')
    expect(ids).toContain('rev')
    expect(ids).not.toContain('one')
  })

  it('a term may be satisfied by the secondary field', () => {
    const c: SearchCandidate[] = [
      { id: 'x', text: 'quarterly numbers', secondary: 'Excel', updatedAt: 1 },
    ]
    // "numbers" in text, "excel" in secondary - both terms satisfied.
    expect(rankItems('numbers excel', c).map((i) => i.id)).toEqual(['x'])
  })

  it('matchCase: rejects a differently-cased match', () => {
    const c: SearchCandidate[] = [{ id: 'x', text: 'Cat', secondary: null, updatedAt: 1 }]
    expect(rankItems('cat', c, { matchCase: true })).toHaveLength(0)
    expect(rankItems('Cat', c, { matchCase: true }).map((i) => i.id)).toEqual(['x'])
  })

  it('wholeWord: "cat" stops matching "category"', () => {
    const c: SearchCandidate[] = [
      { id: 'whole', text: 'the cat', secondary: null, updatedAt: 1 },
      { id: 'part', text: 'category list', secondary: null, updatedAt: 2 },
    ]
    const ids = rankItems('cat', c, { wholeWord: true }).map((i) => i.id)
    expect(ids).toEqual(['whole'])
  })

  it('breaks score ties by recency', () => {
    const tie: SearchCandidate[] = [
      { id: 'old', text: 'note', secondary: null, updatedAt: 1 },
      { id: 'new', text: 'note', secondary: null, updatedAt: 2 },
    ]
    expect(rankItems('note', tie)[0]?.id).toBe('new')
  })

  it('stays within budget on a large multi-term set', () => {
    const big: SearchCandidate[] = Array.from({ length: 10_000 }, (_, i) => ({
      id: String(i),
      text: `item number ${i} with some words`,
      secondary: 'App',
      updatedAt: i,
    }))
    const start = performance.now()
    rankItems('item words', big)
    expect(performance.now() - start).toBeLessThan(500)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/core/search.test.ts`
Expected: FAIL - `termScore` is not exported and `rankItems` ignores options / still fuzzy.

- [ ] **Step 3: Rewrite `src/core/search.ts`**

Overwrite the file:

```ts
/**
 * Search ranking. Pure and platform-agnostic so the same relevance logic runs
 * on macOS and iOS. Default matching is case-insensitive, multi-term substring
 * (every space-separated term must appear). Two refinements mirror VS Code:
 * matchCase (case-sensitive) and wholeWord (terms bounded by non-word chars).
 *
 * Designed to rank a few thousand short candidates well under the 50ms budget:
 * a few indexOf scans per candidate, no allocations in the hot path beyond the
 * collected results.
 */

export interface SearchCandidate {
  id: string
  /** Primary text searched (clip preview, optionally prefixed by the title). */
  text: string
  /** Secondary text searched at a lower weight (e.g. source app). */
  secondary?: string | null
  /** Recency, used only as a tiebreak. */
  updatedAt: number
}

export interface SearchResult {
  id: string
  score: number
}

export interface SearchOptions {
  /** Case-sensitive comparison when true. Default false. */
  matchCase?: boolean
  /** Each term must match as a whole word when true. Default false. */
  wholeWord?: boolean
}

const SCORE_BASE = 1
const SCORE_START = 12
const SCORE_BOUNDARY = 9
const EARLY_BONUS_MAX = 6
const EARLY_FALLOFF = 0.5
const SECONDARY_WEIGHT = 0.6

/** A "word" character; a whole-word match must be bounded by non-word chars. */
function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch)
}

/**
 * Score one (already case-normalised) term against one target. Returns the best
 * occurrence's score, or null when the term is absent (respecting wholeWord).
 */
export function termScore(term: string, target: string, wholeWord: boolean): number | null {
  if (term.length === 0) return 0
  let best: number | null = null
  let from = 0
  for (;;) {
    const idx = target.indexOf(term, from)
    if (idx === -1) break
    const end = idx + term.length
    if (wholeWord) {
      const beforeOk = idx === 0 || !isWordChar(target[idx - 1] as string)
      const afterOk = end >= target.length || !isWordChar(target[end] as string)
      if (!beforeOk || !afterOk) {
        from = idx + 1
        continue
      }
    }
    const placement =
      idx === 0 ? SCORE_START : !isWordChar(target[idx - 1] as string) ? SCORE_BOUNDARY : 0
    const early = Math.max(0, EARLY_BONUS_MAX - idx * EARLY_FALLOFF)
    const s = SCORE_BASE + placement + early
    if (best === null || s > best) best = s
    from = idx + 1
  }
  return best
}

/**
 * Rank candidates against a query. Empty/whitespace query returns everything by
 * recency. Otherwise every space-separated term must be satisfied by the primary
 * OR secondary text; results are ordered by summed score, then recency.
 */
export function rankItems(
  query: string,
  candidates: readonly SearchCandidate[],
  options: SearchOptions = {},
): SearchResult[] {
  const { matchCase = false, wholeWord = false } = options
  const norm = (s: string): string => (matchCase ? s : s.toLowerCase())
  const terms = query.trim().split(/\s+/).filter(Boolean).map(norm)

  if (terms.length === 0) {
    return [...candidates]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({ id: c.id, score: 0 }))
  }

  const results: { id: string; score: number; updatedAt: number }[] = []
  for (const c of candidates) {
    const text = norm(c.text)
    const sec = c.secondary ? norm(c.secondary) : null
    let total = 0
    let matched = true
    for (const term of terms) {
      const primary = termScore(term, text, wholeWord)
      const secondary = sec ? termScore(term, sec, wholeWord) : null
      const best = bestScore(primary, secondary)
      if (best === null) {
        matched = false
        break
      }
      total += best
    }
    if (matched) results.push({ id: c.id, score: total, updatedAt: c.updatedAt })
  }

  results.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
  return results.map((r) => ({ id: r.id, score: r.score }))
}

function bestScore(primary: number | null, secondary: number | null): number | null {
  const sec = secondary === null ? null : secondary * SECONDARY_WEIGHT
  if (primary === null) return sec
  if (sec === null) return primary
  return Math.max(primary, sec)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm rebuild better-sqlite3 >/dev/null 2>&1 && npm run test -- src/core/search.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/core/search.ts src/core/search.test.ts
git commit -m "feat(search): multi-term substring ranking with case/whole-word options"
```

---

### Task 2: IPC contract + main-process wiring

Carry the two flags over IPC and into the index.

**Files:**
- Modify: `src/shared/ipc.ts` (the `QueryItemsRequest` interface)
- Modify: `src/main/services/searchIndex.ts` (the `search` signature)
- Modify: `src/main/app/application.ts:519` (the `queryItems` call)

- [ ] **Step 1: Add the flags to `QueryItemsRequest`**

In `src/shared/ipc.ts`, find the `QueryItemsRequest` interface and add two fields after `pinnedOnly`:

```ts
export interface QueryItemsRequest {
  /** Free-text query. Empty string returns recents. */
  query: string
  filter: QuickFilter
  /** Restrict to a board id; null = all items. */
  boardId: string | null
  limit: number
  offset: number
  /** Include pinned-only when true. */
  pinnedOnly: boolean
  /** Case-sensitive search (VS Code "Aa"). */
  matchCase: boolean
  /** Whole-word search (VS Code "ab"). */
  wholeWord: boolean
}
```

- [ ] **Step 2: Forward options through the search index**

In `src/main/services/searchIndex.ts`, update the import and the `search` method:

```ts
import { rankItems, type SearchCandidate, type SearchOptions } from '@core/search'
```

```ts
  /** Returns item ids ranked for the query (best first). */
  search(query: string, options?: SearchOptions): string[] {
    if (this.stale) this.rebuild()
    return rankItems(query, this.candidates, options).map((r) => r.id)
  }
```

- [ ] **Step 3: Pass the flags from the request**

In `src/main/app/application.ts`, change line 519 from:

```ts
    const rankedIds = this.search.search(req.query).slice(0, 2000)
```

to:

```ts
    const rankedIds = this.search
      .search(req.query, { matchCase: !!req.matchCase, wholeWord: !!req.wholeWord })
      .slice(0, 2000)
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). If `QueryItemsRequest` callers in the renderer now error for missing fields, that is fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/main/services/searchIndex.ts src/main/app/application.ts
git commit -m "feat(search): carry matchCase/wholeWord over IPC into the index"
```

---

### Task 3: Store view-state for the two flags

Hold the flags in the view state and send them on every query.

**Files:**
- Modify: `src/renderer/src/store/useStore.ts` (the `ViewState` interface, initial state, `reload`, `loadMore`)

- [ ] **Step 1: Add the flags to `ViewState` and initial state**

In `src/renderer/src/store/useStore.ts`, extend the `ViewState` interface:

```ts
interface ViewState {
  query: string
  filter: QuickFilter
  boardId: string | null
  pinnedOnly: boolean
  /** VS Code "Aa": case-sensitive search. Sticky within a session. */
  matchCase: boolean
  /** VS Code "ab": whole-word search. Sticky within a session. */
  wholeWord: boolean
}
```

In the `create<StoreState>((set, get) => ({ ... }))` initial state, add after `pinnedOnly: false,`:

```ts
  matchCase: false,
  wholeWord: false,
```

- [ ] **Step 2: Include the flags in the `reload` query**

In the `reload` method, change the destructure and the `queryItems` call:

```ts
    const { query, filter, boardId, pinnedOnly, matchCase, wholeWord } = get()
    set({ loading: true })
    const res = await api().queryItems({
      query,
      filter,
      boardId,
      pinnedOnly,
      matchCase,
      wholeWord,
      limit: PAGE_SIZE,
      offset: 0,
    })
```

- [ ] **Step 3: Include the flags in the `loadMore` query**

In the `loadMore` method, change the destructure and the `queryItems` call:

```ts
    const { items, total, query, filter, boardId, pinnedOnly, matchCase, wholeWord, loading } =
      get()
    if (loading || items.length >= total) return
    const seq = ++reloadSeq
    set({ loading: true })
    const res = await api().queryItems({
      query,
      filter,
      boardId,
      pinnedOnly,
      matchCase,
      wholeWord,
      limit: PAGE_SIZE,
      offset: items.length,
    })
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. `onPanelShown` only sets `query: ''`, so the flags stay sticky across summons (no change needed there).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/useStore.ts
git commit -m "feat(search): hold matchCase/wholeWord in view state and query with them"
```

---

### Task 4: SearchBar toggle buttons + App wiring

Render the **Aa** / **ab** toggles and wire them to the store.

**Files:**
- Modify: `src/renderer/src/components/SearchBar.tsx`
- Modify: `src/renderer/src/components/SearchBar.module.css`
- Modify: `src/renderer/src/App.tsx` (the `<SearchBar .../>` usage)

- [ ] **Step 1: Add toggle props and buttons to SearchBar**

Replace the contents of `src/renderer/src/components/SearchBar.tsx`:

```tsx
import { forwardRef, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import styles from './SearchBar.module.css'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  resultCount: number | null
  matchCase: boolean
  wholeWord: boolean
  onToggleMatchCase: () => void
  onToggleWholeWord: () => void
}

/**
 * Collapsible search: a quiet magnifier that expands into a field when focused
 * or while a query is active. The input always exists (just clipped), so
 * type-to-search and "/" can focus it from anywhere and the expansion follows
 * via state - no mount/unmount races with the keyboard handlers.
 *
 * Two VS Code-style toggles sit in the expanded field: Aa (match case) and ab
 * (whole word). They preventDefault on mousedown so clicking one never blurs the
 * input (which would collapse an empty bar).
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, resultCount, matchCase, wholeWord, onToggleMatchCase, onToggleWholeWord },
  ref,
): React.JSX.Element {
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const open = focused || value.length > 0

  // An empty, open search collapses on any click elsewhere in the app. Click
  // targets do not reliably blur the input (cards prevent default on mousedown
  // for drag), so this listens at the document level.
  useEffect(() => {
    if (!focused || value) return
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        wrapRef.current?.querySelector('input')?.blur()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [focused, value])

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${open ? styles.open : ''}`}
      onClick={(e) => e.currentTarget.querySelector('input')?.focus()}
    >
      <span className={styles.icon}>
        <Icon name="search" size={15} />
      </span>
      <input
        ref={ref}
        className={styles.input}
        type="text"
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder="Search clips, apps, boards"
        aria-label="Search"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {open ? (
        <div className={styles.toggles}>
          <button
            className={`${styles.toggle} ${matchCase ? styles.toggleOn : ''}`}
            aria-label="Match case"
            aria-pressed={matchCase}
            title="Match Case"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleMatchCase}
          >
            Aa
          </button>
          <button
            className={`${styles.toggle} ${wholeWord ? styles.toggleOn : ''}`}
            aria-label="Match whole word"
            aria-pressed={wholeWord}
            title="Match Whole Word"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleWholeWord}
          >
            ab
          </button>
        </div>
      ) : null}
      {value ? (
        <>
          <span className={`${styles.count} mono`}>{resultCount ?? 0}</span>
          <button className={styles.clear} aria-label="Clear search" onClick={() => onChange('')}>
            <Icon name="close" size={13} />
          </button>
        </>
      ) : null}
    </div>
  )
})
```

- [ ] **Step 2: Add toggle styles**

In `src/renderer/src/components/SearchBar.module.css`, add after the `.input::placeholder` rule:

```css
.toggles {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  min-width: 22px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--color-text-faint);
  flex-shrink: 0;
}
.toggle:hover {
  background: var(--color-card-active);
  color: var(--color-text);
}
.toggleOn {
  background: var(--color-accent-quiet);
  color: var(--color-accent);
}
```

- [ ] **Step 3: Wire the toggles in App.tsx**

In `src/renderer/src/App.tsx`, find the `<SearchBar ... />` usage and replace it with:

```tsx
          <SearchBar
            ref={searchRef}
            value={store.query}
            onChange={(query) => store.setView({ query })}
            resultCount={store.total}
            matchCase={store.matchCase}
            wholeWord={store.wholeWord}
            onToggleMatchCase={() => store.setView({ matchCase: !store.matchCase })}
            onToggleWholeWord={() => store.setView({ wholeWord: !store.wholeWord })}
          />
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS. (`setView({ matchCase })` is a multi-key-free patch but not query-only, so it reloads immediately rather than debounced - the toggle feels instant.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/SearchBar.tsx src/renderer/src/components/SearchBar.module.css src/renderer/src/App.tsx
git commit -m "feat(search): Aa / ab match-case and whole-word toggles in the search bar"
```

---

### Task 5: End-to-end coverage

Prove the default narrows and each toggle changes results in the real app.

**Files:**
- Modify: `tests/e2e/navigation.spec.ts`

- [ ] **Step 1: Add an e2e test for the toggles**

Append to `tests/e2e/navigation.spec.ts` (inside the same file, after the last test; it already imports `test, expect, launchApp, closeApp, seedClip, deck, cardWith, type AppHandle` and has a shared `h`). Add seeds in the existing `beforeAll` is not required - this test seeds its own:

```ts
test('Aa and ab search toggles refine the matches', async () => {
  await seedClip(h, 'the cat sat on the mat')
  await seedClip(h, 'a long category list')
  await seedClip(h, 'CamelCaseToken value')

  const search = h.page.getByRole('textbox', { name: 'Search' })

  // Default: case-insensitive substring - "cat" matches both "cat" and "category".
  await search.fill('cat')
  await expect(cardWith(h.page, 'the cat sat')).toBeVisible()
  await expect(cardWith(h.page, 'category list')).toBeVisible()

  // Whole word (ab): "cat" now matches only the standalone word.
  await h.page.getByRole('button', { name: 'Match whole word' }).click()
  await expect(cardWith(h.page, 'the cat sat')).toBeVisible()
  await expect(cardWith(h.page, 'category list')).toHaveCount(0)
  await h.page.getByRole('button', { name: 'Match whole word' }).click() // back off

  // Match case (Aa): "camelcase" stops matching "CamelCaseToken".
  await search.fill('camelcase')
  await expect(cardWith(h.page, 'CamelCaseToken')).toBeVisible()
  await h.page.getByRole('button', { name: 'Match case' }).click()
  await expect(cardWith(h.page, 'CamelCaseToken')).toHaveCount(0)
  await search.fill('CamelCase')
  await expect(cardWith(h.page, 'CamelCaseToken')).toBeVisible()
  await h.page.getByRole('button', { name: 'Match case' }).click() // back off

  // Clean up the query so later tests start fresh.
  await h.page.getByRole('button', { name: 'Clear search' }).click()
})
```

- [ ] **Step 2: Build and run the e2e**

Run: `npm run build && npm run rebuild >/dev/null 2>&1 && npx playwright test tests/e2e/navigation.spec.ts --workers=1`
Expected: PASS (all navigation tests, including the new one).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/navigation.spec.ts
git commit -m "test(e2e): Aa/ab search toggles refine matches"
```

---

### Task 6: Full verification

- [ ] **Step 1: Unit suite (Node ABI)**

Run: `npm rebuild better-sqlite3 >/dev/null 2>&1 && npm test`
Expected: PASS (all suites; the search suite is the rewritten one).

- [ ] **Step 2: Gates**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Full e2e (Electron ABI)**

Run: `npm run rebuild >/dev/null 2>&1 && npm run test:e2e`
Expected: PASS. (Double-launch tests may flake under heavy local load - re-run the specific spec in isolation to confirm; CI's clean runner is authoritative.)

- [ ] **Step 4: Manual visual check (optional)**

Launch the dev app, open search, type a multi-word query, toggle Aa and ab, confirm the result count and cards change and the toggle active state uses the accent.

---

## Notes for the implementer

- **ABI dance**: vitest needs the Node ABI (`npm rebuild better-sqlite3`); Playwright needs the Electron ABI (`npm run rebuild`). Switching between Task 1/6 unit runs and Task 5/6 e2e runs requires re-running the matching rebuild.
- **No new IPC method**: this reuses `queryItems`; only its request shape grew.
- **Stickiness**: the toggles persist within a session (they live in the store, and `onPanelShown` clears only `query`). They reset to off on app restart - that is intended (out of scope to persist).
- **Pre-commit hook** reformats with prettier + eslint + typecheck; re-read a file before editing if a commit touched it.
