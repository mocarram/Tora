# Tora - Design System

This is the single committed design direction. Everything in the renderer is
built against the tokens and patterns documented here. No em dashes anywhere.

## Concept

Tora means "tiger". The product metaphor is a **stack of physical paper cards**:
each clip is a card, inked in warm charcoal, marked with a single tiger-amber
stripe on its leading edge. The interaction language is tactile and layered:
real depth (directional warm shadows, never a flat blur), spring-led motion, and
a horizontal "deck" you flick through.

Deliberately **not** the generic AI-dashboard look:

- No purple or blue gradients. The accent is a single warm amber.
- No default glassmorphism. We use native macOS vibrancy behind a transparent
  window plus opaque, shadowed cards. The depth comes from shadow and layering,
  not frosted-glass panels.
- No hero-with-three-columns marketing layout.
- No emoji icons. A curated geometric line-icon set (`components/Icon.tsx`).
- No Inter-everywhere. A deliberate self-hosted type pairing (below).

## Type

Self-hosted variable fonts, bundled by Vite (never fetched at runtime). Packages
under `@fontsource-variable/*`.

| Role             | Family                  | Use                                            |
| ---------------- | ----------------------- | ---------------------------------------------- |
| Display          | Space Grotesk Variable  | Wordmark, section heads, empty-state titles.   |
| Text / UI        | Hanken Grotesk Variable | Body, list rows, card text, controls.          |
| Mono             | JetBrains Mono Variable | Code previews, hashes, byte sizes, timestamps. |

Space Grotesk gives a technical, slightly quirky display voice; Hanken Grotesk
is a warm humanist grotesk for reading (distinct from Inter); JetBrains Mono
covers code and tabular data. Sizes, weights, line-heights and tracking are all
tokenised (`--text-*`, `--weight-*`, `--leading-*`, `--tracking-*`).

## Colour

Warm, restrained, paper-and-ink. One accent (tiger amber). Defined as two token
layers in `styles/tokens.css`:

1. **Primitives** - raw ramps (`--ink-*`, `--paper-*`, `--amber-*`, signals).
   Never referenced by components.
2. **Semantic** - the only tokens components use (`--color-*`, `--shadow-*`).
   Each theme remaps the semantic layer onto primitives.

Accent ramp is amber (`--amber-2..6`). The single accent appears as: the card
leading-edge stripe, selection state, active nav, focus ring, links/keywords in
code, the storage meter, and the brand mark stripes.

### Themes

- **Dark** (default) and **Light**. The app follows the macOS appearance via
  `prefers-color-scheme` and is overridable in Settings (`system | light | dark`).
- `lib/theme.ts` resolves the preference and keeps `data-theme` on the document
  root in sync while set to `system`.
- `color-scheme` is set per theme so native form controls and scrollbars match.

## Motion

Spring-led and tactile, defined in `lib/motion.ts` and mirrored by CSS duration
tokens.

- Cards enter by lifting and settling (`cardVariants`, a spring at
  stiffness 520 / damping 34) like a card dropped on a stack.
- The bottom panel slides up (`panelVariants`).
- Hover lifts a card 2px; tap presses it 3% (`pressable`).
- **prefers-reduced-motion** is respected two ways: CSS duration tokens collapse
  to `0ms` via media query, and JS reads `prefersReducedMotion()` to drop spring
  layout animation and use instant transitions.

## Spacing, radius, depth

- Spacing on a 4px base (`--space-1..12`).
- Radii are card-like and generous but never pill for containers
  (`--radius-xs..xl`, plus `--radius-round` for dots/meters).
- Depth via three warm directional shadows (`--shadow-card`, `--shadow-raised`,
  `--shadow-overlay`) plus a subtle top inset highlight. No uniform glow.

## Reference screen - History panel

The committed reference screen (`App.tsx`, Phase 1, rendered against MOCK data)
is the History view:

```
+-----------------------------------------------------------------------+
| [rail]            | search ...................   [Panel | Window]     |  topbar
| Tora              |---------------------------------------------------|
|                   |                                                   |
| LIBRARY           |   +--------+  +--------+  +--------+  +--------+   |
|  All              |   | card   |  | card   |  | card   |  | card   |   |  deck
|  Text             |   | (code) |  | (link) |  | (color)|  | (file) |   |  (horizontal)
|  Images           |   +--------+  +--------+  +--------+  +--------+   |
|  Links            |                                                   |
|  Files            |---------------------------------------------------|
| BOARDS +          | * Capturing   6 items   [====----] 3.1 MB         |  statusbar
|  Favourites       |                                                   |
|  Snippets         |                                                   |
| Settings          |                                                   |
+-----------------------------------------------------------------------+
```

Anatomy of a card (`ClipCard.tsx`):

- **Header**: type glyph in an amber-quiet chip, source app name, pin marker,
  relative time (mono).
- **Body**: type-specific preview (`CardPreview.tsx`) - highlighted code, link
  title + host + favicon initial, colour swatch + hex, image thumbnail + dims,
  file name + size, or clamped text.
- **Footer**: type label and hover/selection-revealed quick actions (copy, pin,
  large preview, delete), all keyboard reachable.
- **Selection**: amber border, raised shadow, leading-edge amber stripe lit.

The left rail carries the brand, quick type filters (All/Text/Images/Links/
Files), boards (Favourites is the default starred board), and Settings pinned to
the bottom. The topbar carries instant search and the Panel/Window mode toggle.
The status bar shows capture state, item count, and the storage indicator.

Two window forms share these components:

- **Panel**: frameless, vibrancy-backed, slides up from the bottom of the
  screen, summoned by the global hotkey. Compact, keyboard-first.
- **Window**: a resizable full window for browsing and managing boards.

## Rules for contributors

- Components reference **semantic tokens only**, never primitives or raw hex.
- New colour needs a semantic token in both themes.
- Icons come from the curated set; no emoji, no icon fonts.
- Honour reduced motion in any new animation.
- Hyphens, never em dashes, including in UI copy.
