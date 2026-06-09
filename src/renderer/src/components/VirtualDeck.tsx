import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipItem } from '@core/model'
import { ClipCard } from './ClipCard'
import { Icon } from './Icon'
import { computeHorizontalScroll } from '../lib/wheelScroll'
import styles from './Deck.module.css'

// Horizontal "deck" geometry (panel mode).
const SLOT_WIDTH = 268
const GAP = 16
const STRIDE = SLOT_WIDTH + GAP
const OVERSCAN = 4

// Grid geometry (window mode).
const GRID_MIN_COL = 250
const GRID_ROW_H = 204
// A container at least this tall has room for more than one row, so the deck
// switches from a single horizontal row to a multi-row grid - this is what makes
// a resized-taller panel reflow into a grid instead of staying one row.
const GRID_MIN_HEIGHT = Math.round(GRID_ROW_H * 1.6)
const GRID_PAD = 28
// Vertical breathing room above the first row and below the last, kept equal so
// the top gap matches the bottom (which also leaves room for the scrollbar).
const GRID_PAD_TOP = 20

export type DeckLayout = 'deck' | 'grid'

interface VirtualDeckProps {
  items: ClipItem[]
  total: number
  selectedId: string | null
  queue: string[]
  layout: DeckLayout
  reducedMotion: boolean
  /** Bumped on panel summon: resets the deck to the front and shows the selection. */
  scrollResetKey: number
  onSelect: (id: string) => void
  onActivate: (id: string) => void
  onCopy: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
  onExpand: (id: string) => void
  onEdit: (id: string) => void
  onToggleQueue: (id: string) => void
  onSetTitle: (id: string, title: string | null) => void
  onNeedMore: () => void
}

/**
 * Virtualized card list with two layouts that share the ClipCard:
 * - "deck": a single horizontal row (the panel's signature look).
 * - "grid": a multi-column grid that fills the window (window mode).
 * Only the visible window (plus overscan) is mounted, so both stay at 60fps
 * with 10k+ items.
 */
export function VirtualDeck(props: VirtualDeckProps): React.JSX.Element {
  const { items } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState(0)
  // Seed the height to match the incoming mode until the ResizeObserver measures:
  // window mode (prop 'grid') starts tall so the grid renders enough rows on the
  // first paint; the panel starts short so it renders as a single-row deck.
  const [size, setSize] = useState({ w: 1200, h: props.layout === 'grid' ? 1000 : 240 })
  // The empty state renders a different element than the scroll container, so
  // this toggles the container's existence (used as a wheel-listener dep).
  const isEmpty = items.length === 0

  // Effective layout: window mode always grids; the panel grids too once it is
  // tall enough for more than one row, so making it bigger reflows into a grid.
  const layout: DeckLayout = props.layout === 'grid' || size.h >= GRID_MIN_HEIGHT ? 'grid' : 'deck'

  // Latest-value refs so the scroll effects can read current items/selection/
  // layout WITHOUT depending on them - that keeps a new capture (items change)
  // from yanking the viewport, and the open-reset from re-firing on every nav.
  // Synced in an effect (declared before the scroll effects, so it runs first
  // and they see fresh values) rather than mutated during render.
  const itemsRef = useRef(items)
  const selectedIdRef = useRef(props.selectedId)
  const layoutRef = useRef<DeckLayout>(layout)
  useEffect(() => {
    itemsRef.current = items
    selectedIdRef.current = props.selectedId
    layoutRef.current = layout
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = (): void => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // Re-attach when the container element itself changes: switching panel<->window
    // swaps the deck/grid node, and the empty state renders a different element.
    // Without this the grid measures a stale width and lays out too few columns,
    // leaving a gap on the right.
  }, [layout, isEmpty])

  useEffect(() => {
    // Reset scroll position when switching layouts (deferred so it is not a
    // synchronous setState inside the effect body).
    containerRef.current?.scrollTo({ top: 0, left: 0 })
    const r = requestAnimationFrame(() => setScroll(0))
    return () => cancelAnimationFrame(r)
  }, [layout])

  // Map a vertical mouse wheel to horizontal movement in the deck (panel) layout
  // so a plain wheel can scroll the single horizontal row. Attached natively and
  // non-passive: a React onWheel handler is passive, so its preventDefault would
  // be ignored and the conversion would double-scroll or do nothing. Setting
  // scrollLeft drives the existing onScroll handler (virtualization + load-more).
  useEffect(() => {
    const el = containerRef.current
    if (!el || layout !== 'deck') return
    const onWheel = (e: WheelEvent): void => {
      const result = computeHorizontalScroll({
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        scrollLeft: el.scrollLeft,
        maxScrollLeft: el.scrollWidth - el.clientWidth,
      })
      if (!result.handled) return
      e.preventDefault()
      el.scrollLeft = result.nextScrollLeft
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // Re-run when the container appears/disappears (isEmpty) to (re)attach.
  }, [layout, isEmpty])

  // Bring the selected card into view when the SELECTION changes (keyboard nav
  // or open). Deliberately does not depend on `items`, so a new capture never
  // yanks the viewport, and uses an instant jump (no smooth) so holding an arrow
  // key to navigate fast stays snappy instead of queueing smooth-scroll lag.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !props.selectedId) return
    const index = itemsRef.current.findIndex((i) => i.id === props.selectedId)
    if (index < 0) return
    if (layout === 'grid') {
      const cols = gridCols(el.clientWidth)
      const top = Math.floor(index / cols) * GRID_ROW_H
      const bottom = top + GRID_ROW_H
      if (top < el.scrollTop) el.scrollTo({ top, behavior: 'auto' })
      else if (bottom > el.scrollTop + el.clientHeight)
        el.scrollTo({ top: bottom - el.clientHeight, behavior: 'auto' })
    } else {
      const left = index * STRIDE
      const right = left + SLOT_WIDTH
      if (left < el.scrollLeft) el.scrollTo({ left: left - GAP, behavior: 'auto' })
      else if (right > el.scrollLeft + el.clientWidth)
        el.scrollTo({ left: right - el.clientWidth + GAP, behavior: 'auto' })
    }
  }, [props.selectedId, layout])

  // On panel summon (scrollResetKey bumped) jump the deck back to the selected
  // current-clipboard item at the front, rather than leaving it wherever it was
  // last scrolled. Reads refs so it only fires on summon, never on nav/capture.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const idx = selectedIdRef.current
      ? itemsRef.current.findIndex((i) => i.id === selectedIdRef.current)
      : 0
    const i = idx < 0 ? 0 : idx
    if (layoutRef.current === 'grid') {
      const top = Math.floor(i / gridCols(el.clientWidth)) * GRID_ROW_H
      el.scrollTo({ top, behavior: 'auto' })
      setScroll(top)
    } else {
      const left = Math.max(0, i * STRIDE - GAP)
      el.scrollTo({ left, behavior: 'auto' })
      setScroll(left)
    }
  }, [props.scrollResetKey])

  const queuePos = useCallback((id: string): number => props.queue.indexOf(id), [props.queue])

  const renderCard = (item: ClipItem): React.JSX.Element => (
    <ClipCard
      item={item}
      selected={item.id === props.selectedId}
      queueIndex={queuePos(item.id)}
      reducedMotion={props.reducedMotion}
      onSelect={props.onSelect}
      onActivate={props.onActivate}
      onCopy={props.onCopy}
      onTogglePin={props.onTogglePin}
      onDelete={props.onDelete}
      onExpand={props.onExpand}
      onEdit={props.onEdit}
      onToggleQueue={props.onToggleQueue}
      onSetTitle={props.onSetTitle}
    />
  )

  if (isEmpty) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyMark} aria-hidden="true">
          <Icon name="layers" size={28} />
        </span>
        <p className={styles.emptyTitle}>Nothing here yet</p>
        <p className={styles.emptyHint}>Copy something and it lands on the deck.</p>
      </div>
    )
  }

  const onScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    if (layout === 'grid') {
      setScroll(el.scrollTop)
      const cols = gridCols(size.w)
      const loadedH = Math.ceil(items.length / cols) * GRID_ROW_H
      if (el.scrollTop + el.clientHeight > loadedH - GRID_ROW_H * 3 && items.length < props.total) {
        props.onNeedMore()
      }
    } else {
      setScroll(el.scrollLeft)
      const loadedW = items.length * STRIDE
      if (el.scrollLeft + el.clientWidth > loadedW - STRIDE * 6 && items.length < props.total) {
        props.onNeedMore()
      }
    }
  }

  if (layout === 'grid') {
    const cols = gridCols(size.w)
    const colW = (size.w - GRID_PAD * 2 - GAP * (cols - 1)) / cols
    const rows = Math.ceil(items.length / cols)
    const firstRow = Math.max(0, Math.floor(scroll / GRID_ROW_H) - OVERSCAN)
    const lastRow = Math.min(rows, Math.ceil((scroll + size.h) / GRID_ROW_H) + OVERSCAN)
    const visible = items.slice(firstRow * cols, lastRow * cols)

    return (
      <div
        ref={containerRef}
        className={styles.grid}
        role="listbox"
        aria-label="Clip history"
        tabIndex={0}
        onScroll={onScroll}
      >
        <div
          className={styles.gridTrack}
          style={{ height: GRID_PAD_TOP * 2 + rows * GRID_ROW_H - GAP }}
        >
          {visible.map((item, i) => {
            const index = firstRow * cols + i
            const row = Math.floor(index / cols)
            const col = index % cols
            return (
              <div
                key={item.id}
                className={styles.gridCell}
                style={{
                  width: colW,
                  height: GRID_ROW_H - GAP,
                  transform: `translate(${GRID_PAD + col * (colW + GAP)}px, ${GRID_PAD_TOP + row * GRID_ROW_H}px)`,
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-tora-item', item.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
              >
                {renderCard(item)}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Horizontal deck (panel mode).
  const first = Math.max(0, Math.floor(scroll / STRIDE) - OVERSCAN)
  const visibleCount = Math.ceil(size.w / STRIDE) + OVERSCAN * 2
  const last = Math.min(items.length, first + visibleCount)
  const visible = items.slice(first, last)

  return (
    <div
      ref={containerRef}
      className={styles.deck}
      role="listbox"
      aria-label="Clip history"
      tabIndex={0}
      onScroll={onScroll}
    >
      <div className={styles.virtualTrack} style={{ width: items.length * STRIDE }}>
        {visible.map((item, i) => {
          const index = first + i
          return (
            <div
              className={styles.virtualSlot}
              key={item.id}
              style={{ transform: `translate(${index * STRIDE}px, -50%)` }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-tora-item', item.id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
            >
              {renderCard(item)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function gridCols(width: number): number {
  return Math.max(1, Math.floor((width - GRID_PAD * 2 + GAP) / (GRID_MIN_COL + GAP)))
}
