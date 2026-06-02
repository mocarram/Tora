import type { Board, QuickFilter } from '@core/model'
import { Icon, type IconName } from './Icon'
import styles from './Sidebar.module.css'

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
}

export function Sidebar({
  boards,
  activeFilter,
  activeBoardId,
  onFilter,
  onBoard,
  onNewBoard,
  onOpenSettings,
}: SidebarProps): React.JSX.Element {
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
            className={`${styles.row} ${activeBoardId === b.id ? styles.active : ''}`}
            onClick={() => onBoard(b.id)}
          >
            <Icon name={b.sortIndex === 0 ? 'star' : 'pin'} size={15} />
            <span className={styles.boardName}>{b.name}</span>
          </button>
        ))}
      </div>

      <button className={`${styles.row} ${styles.settings}`} onClick={onOpenSettings}>
        <Icon name="settings" size={15} />
        <span>Settings</span>
      </button>
    </nav>
  )
}
