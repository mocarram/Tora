# Search: substring default + Match Case / Match Whole Word toggles

Date: 2026-06-16
Topic: VS Code-style search matching for Tora

## Goal

Replace the loose fuzzy-subsequence default with predictable, word-oriented
matching, and add two VS Code-style toggles to the search bar:

- **Aa** - Match Case
- **ab** - Match Whole Word

The trigger: today's fuzzy match returns too much (e.g. "cat" matches "I **c**an
**t**alk" across words). Users expect "cat" to find clips that actually contain
"cat".

## Matching behaviour (the core)

Lives in `src/core/search.ts` so macOS and the future iOS app share it.

**Default (both toggles off): case-insensitive, multi-term substring (AND).**
- The query is split on whitespace into terms.
- A candidate matches only if EVERY term appears as a substring of its text.
- Order-independent: "wallet eth" matches "eth wallet" and "my wallet for eth".
- Empty query returns everything by recency (unchanged).

**Match Case (Aa) on:** comparisons become case-sensitive. "Cat" no longer
matches "cat". Applies in both substring and whole-word modes.

**Match Whole Word (ab) on:** each term must match as a whole word - bounded on
both sides by a non-word character or the string edge (word char = `[A-Za-z0-9_]`).
"cat" matches "the cat sat" and "cat." but NOT "category" or "scatter". Combined
with AND, every term is independently whole-word matched.

### Ranking

Keep a relevance score (best first), not just a filter, so the most useful clip
leads. Score per matched candidate, summed across terms:
- match at string start: strongest
- match at a word boundary: strong
- match earlier in the text: mild bonus (earlier = better)
- recency: final tiebreak (unchanged)

Secondary text (source app) still participates at a lower weight
(`SECONDARY_WEIGHT`), as today. Explicit rule for multi-term AND: a term is
satisfied if it matches the primary text OR the secondary text; the candidate
matches only when EVERY term is satisfied. Per term, the score is the better of
its primary score and (secondary score x `SECONDARY_WEIGHT`); the candidate's
score sums those per-term bests. The exact constants are an implementation
detail; the public contract is "matches filtered by the rules above, ordered
most-relevant first, recency as tiebreak".

### API shape

```ts
export interface SearchOptions {
  matchCase?: boolean   // default false
  wholeWord?: boolean   // default false
}
export function rankItems(
  query: string,
  candidates: readonly SearchCandidate[],
  options?: SearchOptions,
): SearchResult[]
```

`fuzzyScore` is replaced by a `termScore`/`matchTerm` helper that scores one term
against one target under the given options (or returns null for no-match). The
existing fuzzy subsequence scorer is removed (no longer the default and not
exposed as a toggle).

## Plumbing

- `src/shared/ipc.ts`: `QueryItemsRequest` gains `matchCase: boolean` and
  `wholeWord: boolean`.
- `src/main/services/searchIndex.ts`: `search(query, options)` forwards options
  to `rankItems`.
- `src/main/app/application.ts`: `queryItems` reads the two flags off the request
  and passes them through.
- `src/renderer/src/store/useStore.ts`: `ViewState` gains `matchCase` and
  `wholeWord` (default false). They are part of the query patch, so toggling one
  triggers the same debounced reload as typing. They are NOT cleared by
  `onPanelShown` (sticky within a session, like VS Code); a query clear leaves
  them as set.
- `src/renderer/src/components/SearchBar.tsx`: two small toggle buttons (`Aa`,
  `ab`) rendered inside the field when it is expanded, right of the input before
  the clear button. `aria-pressed` reflects state; `aria-label`/tooltip =
  "Match Case" / "Match whole word". Styled like existing chip/icon buttons,
  active state uses the accent-quiet treatment.

## Testing

- **Unit (`src/core/search.test.ts`)**: rewrite for the new semantics -
  multi-term AND, substring vs whole-word, case sensitivity, order independence,
  ranking order (start > word-boundary > later), empty query, secondary-text
  weighting. This is the bulk of the coverage.
- **e2e (`tests/e2e/navigation.spec.ts`)**: with seeded clips, (1) a substring
  query narrows the deck; (2) toggling **ab** drops a substring-only match
  (e.g. "cat" stops matching "category"); (3) toggling **Aa** drops a
  differently-cased match. Assert via visible cards.

## Out of scope

- Regex toggle (VS Code's `.*`) - not requested.
- Typo tolerance / fuzzy - intentionally removed as the default.
- Persisting toggles across app restarts - session-sticky only for now.
