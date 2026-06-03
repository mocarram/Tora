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
const GRID_ROW_H = 212
const GRID_PAD = 28

export type DeckLayout = 'deck' | 'grid'

interface VirtualDeckProps {
  items: ClipItem[]
  total: number
  selectedId: string | null
  queue: string[]
  layout: DeckLayout
  reducedMotion: boolean
  onSelect: (id: string) => void
  onActivate: (id: string) => void
  onCopy: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
  onExpand: (id: string) => void
  onEdit: (id: string) => void
  onToggleQueue: (id: string) => void
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
  const [size, setSize] = useState({ w: 1200, h: 600 })
  // The empty state renders a different element than the scroll container, so
  // this toggles the container's existence (used as a wheel-listener dep).
  const isEmpty = items.length === 0

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = (): void => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    // Reset scroll position when switching layouts (deferred so it is not a
    // synchronous setState inside the effect body).
    containerRef.current?.scrollTo({ top: 0, left: 0 })
    const r = requestAnimationFrame(() => setScroll(0))
    return () => cancelAnimationFrame(r)
  }, [props.layout])

  // Map a vertical mouse wheel to horizontal movement in the deck (panel) layout
  // so a plain wheel can scroll the single horizontal row. Attached natively and
  // non-passive: a React onWheel handler is passive, so its preventDefault would
  // be ignored and the conversion would double-scroll or do nothing. Setting
  // scrollLeft drives the existing onScroll handler (virtualization + load-more).
  useEffect(() => {
    const el = containerRef.current
    if (!el || props.layout !== 'deck') return
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
  }, [props.layout, isEmpty])

  // Keep the keyboard-selected card within the viewport (both layouts).
  useEffect(() => {
    const el = containerRef.current
    if (!el || !props.selectedId) return
    const index = items.findIndex((i) => i.id === props.selectedId)
    if (index < 0) return
    if (props.layout === 'grid') {
      const cols = gridCols(el.clientWidth)
      const top = Math.floor(index / cols) * GRID_ROW_H
      const bottom = top + GRID_ROW_H
      if (top < el.scrollTop) el.scrollTo({ top, behavior: 'smooth' })
      else if (bottom > el.scrollTop + el.clientHeight)
        el.scrollTo({ top: bottom - el.clientHeight, behavior: 'smooth' })
    } else {
      const left = index * STRIDE
      const right = left + SLOT_WIDTH
      if (left < el.scrollLeft) el.scrollTo({ left: left - GAP, behavior: 'smooth' })
      else if (right > el.scrollLeft + el.clientWidth)
        el.scrollTo({ left: right - el.clientWidth + GAP, behavior: 'smooth' })
    }
  }, [props.selectedId, items, props.layout])

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
    if (props.layout === 'grid') {
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

  if (props.layout === 'grid') {
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
        <div className={styles.gridTrack} style={{ height: rows * GRID_ROW_H }}>
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
                  transform: `translate(${GRID_PAD + col * (colW + GAP)}px, ${row * GRID_ROW_H}px)`,
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
