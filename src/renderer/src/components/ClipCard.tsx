import { memo } from 'react'
import { motion } from 'framer-motion'
import type { ClipItem } from '@core/model'
import { relativeTime } from '@core/format'
import { Icon } from './Icon'
import { CardPreview } from './CardPreview'
import { TYPE_META } from './typeMeta'
import { cardVariants } from '../lib/motion'
import styles from './ClipCard.module.css'

export interface ClipCardProps {
  item: ClipItem
  selected: boolean
  reducedMotion: boolean
  onSelect: (id: string) => void
  onActivate: (id: string) => void
  onCopy: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
  onExpand: (id: string) => void
}

function ClipCardImpl({
  item,
  selected,
  reducedMotion,
  onSelect,
  onActivate,
  onCopy,
  onTogglePin,
  onDelete,
  onExpand,
}: ClipCardProps): React.JSX.Element {
  const meta = TYPE_META[item.type]

  const stop = (e: React.MouseEvent): void => e.stopPropagation()

  return (
    <motion.div
      layout={!reducedMotion}
      variants={cardVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-item-id={item.id}
      onClick={() => onSelect(item.id)}
      onDoubleClick={() => onActivate(item.id)}
    >
      <div className={styles.header}>
        <span className={styles.typeIcon}>
          <Icon name={meta.icon} size={13} />
        </span>
        <span className={styles.source}>{item.sourceApp ?? meta.label}</span>
        {item.isPinned ? (
          <span className={styles.pin} title="Pinned">
            <Icon name="pin" size={13} filled />
          </span>
        ) : null}
        <span className={styles.time}>{relativeTime(item.updatedAt)}</span>
      </div>

      <div className={styles.body}>
        <CardPreview item={item} />
      </div>

      <div className={styles.footer}>
        <span>{meta.label}</span>
        <div className={styles.actions}>
          <button
            className={styles.action}
            title="Copy"
            aria-label="Copy"
            onClick={(e) => {
              stop(e)
              onCopy(item.id)
            }}
          >
            <Icon name="copy" size={14} />
          </button>
          <button
            className={styles.action}
            title={item.isPinned ? 'Unpin' : 'Pin'}
            aria-label={item.isPinned ? 'Unpin' : 'Pin'}
            onClick={(e) => {
              stop(e)
              onTogglePin(item.id, !item.isPinned)
            }}
          >
            <Icon name="pin" size={14} filled={item.isPinned} />
          </button>
          <button
            className={styles.action}
            title="Large preview"
            aria-label="Large preview"
            onClick={(e) => {
              stop(e)
              onExpand(item.id)
            }}
          >
            <Icon name="expand" size={14} />
          </button>
          <button
            className={`${styles.action} ${styles.actionDanger}`}
            title="Delete"
            aria-label="Delete"
            onClick={(e) => {
              stop(e)
              onDelete(item.id)
            }}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export const ClipCard = memo(ClipCardImpl)
