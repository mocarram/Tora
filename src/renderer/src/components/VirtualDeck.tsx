import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipItem } from '@core/model'
import { ClipCard } from './ClipCard'
import { Icon } from './Icon'
import styles from './Deck.module.css'

const SLOT_WIDTH = 268
const GAP = 16
const STRIDE = SLOT_WIDTH + GAP
const OVERSCAN = 4

interface VirtualDeckProps {
  items: ClipItem[]
  total: number
  selectedId: string | null
  queue: string[]
  reducedMotion: boolean
  onSelect: (id: string) => void
  onActivate: (id: string) => void
  onCopy: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
  onExpand: (id: string) => void
  onNeedMore: () => void
}

/**
 * Horizontally virtualized card deck. Only the visible window (plus a small
 * overscan) is mounted, so scrolling stays at 60fps with 10k+ items. Triggers
 * incremental loading as the right edge approaches the loaded tail.
 */
export function VirtualDeck(props: VirtualDeckProps): React.JSX.Element {
  const { items, total } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [width, setWidth] = useState(1200)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keep the keyboard-selected card within the viewport.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !props.selectedId) return
    const index = items.findIndex((i) => i.id === props.selectedId)
    if (index < 0) return
    const left = index * STRIDE
    const right = left + SLOT_WIDTH
    if (left < el.scrollLeft) el.scrollTo({ left: left - GAP, behavior: 'smooth' })
    else if (right > el.scrollLeft + el.clientWidth)
      el.scrollTo({ left: right - el.clientWidth + GAP, behavior: 'smooth' })
  }, [props.selectedId, items])

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const left = e.currentTarget.scrollLeft
      setScrollLeft(left)
      const loadedWidth = items.length * STRIDE
      if (left + e.currentTarget.clientWidth > loadedWidth - STRIDE * 6 && items.length < total) {
        props.onNeedMore()
      }
    },
    [items.length, total, props],
  )

  if (items.length === 0) {
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

  const first = Math.max(0, Math.floor(scrollLeft / STRIDE) - OVERSCAN)
  const visibleCount = Math.ceil(width / STRIDE) + OVERSCAN * 2
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
              style={{ transform: `translateX(${index * STRIDE}px)` }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-tora-item', item.id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <ClipCard
                item={item}
                selected={item.id === props.selectedId}
                reducedMotion={props.reducedMotion}
                onSelect={props.onSelect}
                onActivate={props.onActivate}
                onCopy={props.onCopy}
                onTogglePin={props.onTogglePin}
                onDelete={props.onDelete}
                onExpand={props.onExpand}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
