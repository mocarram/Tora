import { useState } from 'react'
import type { Board, QuickFilter } from '@core/model'
import { FAVOURITES_BOARD_ID } from '@core/model'
import { Icon, type IconName } from './Icon'
import styles from './Sidebar.module.css'

const ITEM_MIME = 'application/x-tora-item'
const BOARD_MIME = 'application/x-tora-board'

const FILTERS: { id: QuickFilter; label: string; icon: IconName }[] = [
  { id: 'all', label: 'All', icon: 'layers' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'images', label: 'Images', icon: 'image' },
  { id: 'links', label: 'Links', icon: 'url' },
  { id: 'files', label: 'Files', icon: 'file' },
]

interface SidebarProps {
  boards: Board[]
  activeFilter: QuickFilter
  activeBoardId: string | null
  onFilter: (filter: QuickFilter) => void
  onBoard: (boardId: string | null) => void
  onNewBoard: () => void
  onOpenSettings: () => void
  onAddToBoard: (boardId: string, itemId: string) => void
  onReorderBoards: (orderedIds: string[]) => void
}

export function Sidebar({
  boards,
  activeFilter,
  activeBoardId,
  onFilter,
  onBoard,
  onNewBoard,
  onOpenSettings,
  onAddToBoard,
  onReorderBoards,
}: SidebarProps): React.JSX.Element {
  const [dropBoard, setDropBoard] = useState<string | null>(null)
  const [dragBoard, setDragBoard] = useState<string | null>(null)

  const reorder = (fromId: string, toId: string): void => {
    if (fromId === toId) return
    const ids = boards.map((b) => b.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0] as string)
    onReorderBoards(ids)
  }

  return (
    <nav className={styles.rail} aria-label="Filters and boards">
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          <span className={styles.stripe} />
          <span className={styles.stripe} />
          <span className={styles.stripe} />
        </span>
        <span className={`${styles.wordmark} display`}>Tora</span>
      </div>

      <div className={styles.scroll}>
        <div className={styles.group}>
          <span className={styles.groupLabel}>Library</span>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`${styles.row} ${
                activeBoardId === null && activeFilter === f.id ? styles.active : ''
              }`}
              onClick={() => {
                onBoard(null)
                onFilter(f.id)
              }}
            >
              <Icon name={f.icon} size={15} />
              <span>{f.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span className={styles.groupLabel}>Boards</span>
            <button className={styles.iconBtn} aria-label="New board" onClick={onNewBoard}>
              <Icon name="plus" size={14} />
            </button>
          </div>
          {boards.map((b) => (
            <button
              key={b.id}
              className={`${styles.row} ${activeBoardId === b.id ? styles.active : ''} ${
                dropBoard === b.id ? styles.dropTarget : ''
              }`}
              draggable={b.id !== FAVOURITES_BOARD_ID}
              onClick={() => onBoard(b.id)}
              onDragStart={(e) => {
                e.dataTransfer.setData(BOARD_MIME, b.id)
                e.dataTransfer.effectAllowed = 'move'
                setDragBoard(b.id)
              }}
              onDragEnd={() => setDragBoard(null)}
              onDragOver={(e) => {
                if (
                  e.dataTransfer.types.includes(ITEM_MIME) ||
                  e.dataTransfer.types.includes(BOARD_MIME)
                ) {
                  e.preventDefault()
                  setDropBoard(b.id)
                }
              }}
              onDragLeave={() => setDropBoard((cur) => (cur === b.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault()
                setDropBoard(null)
                const itemId = e.dataTransfer.getData(ITEM_MIME)
                if (itemId) {
                  onAddToBoard(b.id, itemId)
                  return
                }
                const boardId = e.dataTransfer.getData(BOARD_MIME)
                if (boardId) reorder(boardId, b.id)
              }}
            >
              <Icon name={b.id === FAVOURITES_BOARD_ID ? 'star' : 'layers'} size={15} />
              <span className={styles.boardName}>{b.name}</span>
              {dragBoard && dragBoard !== b.id ? <span className={styles.reorderHint} /> : null}
            </button>
          ))}
        </div>
      </div>

      <button className={`${styles.row} ${styles.settings}`} onClick={onOpenSettings}>
        <Icon name="settings" size={15} />
        <span>Settings</span>
      </button>
    </nav>
  )
}
