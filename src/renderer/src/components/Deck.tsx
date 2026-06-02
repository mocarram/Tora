import { AnimatePresence } from 'framer-motion'
import type { ClipItem } from '@core/model'
import { ClipCard } from './ClipCard'
import { Icon } from './Icon'
import styles from './Deck.module.css'

interface DeckProps {
  items: ClipItem[]
  selectedId: string | null
  reducedMotion: boolean
  onSelect: (id: string) => void
  onActivate: (id: string) => void
  onCopy: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
  onExpand: (id: string) => void
}

/**
 * Horizontal deck of clip cards - the signature "stack of cards" view.
 * Virtualization is added in Phase 3; here it renders the working set directly.
 */
export function Deck(props: DeckProps): React.JSX.Element {
  const { items, selectedId, reducedMotion } = props

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

  return (
    <div className={styles.deck} role="listbox" aria-label="Clip history" tabIndex={0}>
      <div className={styles.track}>
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <div className={styles.slot} key={item.id}>
              <ClipCard
                item={item}
                selected={item.id === selectedId}
                reducedMotion={reducedMotion}
                onSelect={props.onSelect}
                onActivate={props.onActivate}
                onCopy={props.onCopy}
                onTogglePin={props.onTogglePin}
                onDelete={props.onDelete}
                onExpand={props.onExpand}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
