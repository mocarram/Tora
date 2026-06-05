import { memo, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { ClipItem } from '@core/model'
import { relativeTime } from '@core/format'
import { useStore } from '../store/useStore'
import { useAppIcon } from '../lib/appIcon'
import { Icon } from './Icon'
import { CardPreview } from './CardPreview'
import { BoardMenu } from './BoardMenu'
import { Tooltip } from './Tooltip'
import { TYPE_META } from './typeMeta'
import { cardVariants } from '../lib/motion'
import styles from './ClipCard.module.css'

export interface ClipCardProps {
  item: ClipItem
  selected: boolean
  /** Position in the paste queue, or -1 when not queued. */
  queueIndex: number
  reducedMotion: boolean
  onSelect: (id: string) => void
  onActivate: (id: string) => void
  onCopy: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
  onExpand: (id: string) => void
  onEdit: (id: string) => void
  onToggleQueue: (id: string) => void
  /** Set or clear (null) the card's custom title. */
  onSetTitle: (id: string, title: string | null) => void
}

const EDITABLE: ClipItem['type'][] = ['text', 'richText', 'code', 'url', 'color']

function ClipCardImpl({
  item,
  selected,
  queueIndex,
  reducedMotion,
  onSelect,
  onActivate,
  onCopy,
  onDelete,
  onExpand,
  onEdit,
  onToggleQueue,
  onSetTitle,
}: ClipCardProps): React.JSX.Element {
  const meta = TYPE_META[item.type]
  const editable = EDITABLE.includes(item.type)
  const queued = queueIndex >= 0

  // The icon of the app the clip was copied from (Paste-style "source"). Null
  // until resolved or when unresolvable; the card falls back to its type glyph.
  const sourceIcon = useAppIcon(item.sourceBundleId)

  const menuOpen = useStore((s) => s.openMenuId === item.id)
  const setOpenMenuId = useStore((s) => s.setOpenMenuId)
  const saveBtnRef = useRef<HTMLButtonElement>(null)

  // Inline, in-place title editing (no popup). The default label is the source
  // app or the type name; a saved title replaces it. Saving the default or an
  // empty string clears the custom title.
  const defaultLabel = item.sourceApp ?? meta.label
  const titleText = item.title && item.title.length > 0 ? item.title : defaultLabel
  const [editingTitle, setEditingTitle] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTitle) {
      titleRef.current?.focus()
      titleRef.current?.select()
    }
  }, [editingTitle])

  const commitTitle = (raw: string): void => {
    const next = raw.trim()
    const title = next.length === 0 || next === defaultLabel ? null : next
    if ((item.title ?? null) !== title) onSetTitle(item.id, title)
    setEditingTitle(false)
  }

  // If this card unmounts (e.g. virtualised away) while its menu is open, clear
  // the global flag so the panel does not stay pinned open.
  useEffect(() => {
    return () => {
      if (useStore.getState().openMenuId === item.id) useStore.getState().setOpenMenuId(null)
    }
  }, [item.id])

  const stop = (e: React.MouseEvent): void => e.stopPropagation()

  // Cmd/Ctrl-click toggles queue membership (multi-select); a plain click selects.
  const handleClick = (e: React.MouseEvent): void => {
    if (e.metaKey || e.ctrlKey) onToggleQueue(item.id)
    else onSelect(item.id)
  }

  return (
    <motion.div
      layout={!reducedMotion}
      variants={cardVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`${styles.card} ${selected ? styles.selected : ''} ${queued ? styles.queued : ''}`}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-item-id={item.id}
      onClick={handleClick}
      onDoubleClick={() => onActivate(item.id)}
    >
      {/* Prominent, type-coloured header: title + time, with the source app on
          the side (its icon, or the type glyph as a fallback). */}
      <div className={styles.header} data-type={item.type}>
        <div className={styles.headText}>
          {editingTitle ? (
            <input
              ref={titleRef}
              className={styles.titleInput}
              defaultValue={item.title ?? defaultLabel}
              placeholder={defaultLabel}
              spellCheck={false}
              maxLength={120}
              aria-label="Clip title"
              onClick={stop}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitTitle(e.currentTarget.value)
                else if (e.key === 'Escape') setEditingTitle(false)
              }}
              onBlur={(e) => commitTitle(e.currentTarget.value)}
            />
          ) : (
            <button
              className={styles.title}
              title="Click to rename"
              onClick={(e) => {
                stop(e)
                setEditingTitle(true)
              }}
            >
              {titleText}
            </button>
          )}
          <span className={styles.time}>{relativeTime(item.updatedAt)}</span>
        </div>

        {item.isPinned ? (
          <span className={styles.pin} title="Pinned">
            <Icon name="pin" size={12} filled />
          </span>
        ) : null}

        {queued ? (
          <span className={styles.queueBadge} title={`Queued #${queueIndex + 1}`}>
            {queueIndex + 1}
          </span>
        ) : sourceIcon ? (
          <span
            className={styles.source}
            title={item.sourceApp ? `Copied from ${item.sourceApp}` : undefined}
          >
            <img className={styles.sourceImg} src={sourceIcon} alt="" />
          </span>
        ) : null}
      </div>

      <div className={styles.body}>
        <CardPreview item={item} />
      </div>

      {/* Actions live in the footer, always visible for a quick single click. */}
      <div className={styles.footer}>
        <span className={styles.typeLabel}>{meta.label}</span>
        <div className={styles.actions}>
          <Tooltip label="Copy">
            <button
              className={styles.action}
              aria-label="Copy"
              onClick={(e) => {
                stop(e)
                onCopy(item.id)
              }}
            >
              <Icon name="copy" size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Save to board">
            <button
              ref={saveBtnRef}
              className={styles.action}
              aria-label="Save to board"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(e) => {
                stop(e)
                setOpenMenuId(menuOpen ? null : item.id)
              }}
            >
              <Icon name="pin" size={14} filled={item.isPinned} />
            </button>
          </Tooltip>
          <Tooltip label={queued ? 'Remove from queue' : 'Add to queue'}>
            <button
              className={`${styles.action} ${queued ? styles.actionOn : ''}`}
              aria-label={queued ? 'Remove from queue' : 'Add to queue'}
              onClick={(e) => {
                stop(e)
                onToggleQueue(item.id)
              }}
            >
              <Icon name="queue" size={14} />
            </button>
          </Tooltip>
          {editable ? (
            <Tooltip label="Edit text">
              <button
                className={styles.action}
                aria-label="Edit text"
                onClick={(e) => {
                  stop(e)
                  onEdit(item.id)
                }}
              >
                <Icon name="edit" size={14} />
              </button>
            </Tooltip>
          ) : null}
          <Tooltip label="Large preview">
            <button
              className={styles.action}
              aria-label="Large preview"
              onClick={(e) => {
                stop(e)
                onExpand(item.id)
              }}
            >
              <Icon name="expand" size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Delete">
            <button
              className={`${styles.action} ${styles.actionDanger}`}
              aria-label="Delete"
              onClick={(e) => {
                stop(e)
                onDelete(item.id)
              }}
            >
              <Icon name="trash" size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      {menuOpen && (
        <BoardMenu item={item} anchorRef={saveBtnRef} onClose={() => setOpenMenuId(null)} />
      )}
    </motion.div>
  )
}

export const ClipCard = memo(ClipCardImpl)
