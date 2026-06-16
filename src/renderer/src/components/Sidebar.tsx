import { memo } from 'react'
import type { QuickFilter } from '@core/model'
import type { SyncState } from '@shared/ipc'
import { Icon, type IconName } from './Icon'
import { Tooltip } from './Tooltip'
import styles from './Sidebar.module.css'

const SYNC_TITLES: Record<SyncState, string> = {
  idle: 'Sync up to date',
  syncing: 'Syncing',
  error: 'Sync error',
  disabled: 'Sync off',
}

/* What each state means, shown in the badge tooltip. The tick only promises a
   healthy local handoff - macOS owns the actual upload to iCloud. */
const SYNC_DETAILS: Record<SyncState, string> = {
  idle: 'Saved to iCloud Drive; uploads when you’re online.',
  syncing: 'Syncing with your other devices.',
  error: 'Can’t reach the iCloud Drive sync folder.',
  disabled: '',
}

const FILTERS: { id: QuickFilter; label: string; icon: IconName }[] = [
  { id: 'all', label: 'All', icon: 'layers' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'images', label: 'Images', icon: 'image' },
  { id: 'links', label: 'Links', icon: 'url' },
  { id: 'files', label: 'Files', icon: 'file' },
]

interface SidebarProps {
  activeFilter: QuickFilter
  /** Current sync status; drives the wordmark sync badge. */
  syncState: SyncState | null
  /** Last sync error message, shown in the badge tooltip when state is error. */
  syncError: string | null
  /** Icon-only rail when true; the sidebar never fully hides. */
  collapsed: boolean
  onFilter: (filter: QuickFilter) => void
  onToggleCollapse: () => void
}

/**
 * The category rail: brand + Library type filters. Boards live in the topbar
 * pill strip and Settings next to the mode switcher, so the rail stays a thin,
 * collapsible list of content categories (filters compose with the active
 * board: they narrow whatever collection is selected).
 */
function SidebarImpl({
  activeFilter,
  syncState,
  syncError,
  collapsed,
  onFilter,
  onToggleCollapse,
}: SidebarProps): React.JSX.Element {
  return (
    <nav className={`${styles.rail} ${collapsed ? styles.collapsed : ''}`} aria-label="Library">
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          <span className={styles.stripe} />
          <span className={styles.stripe} />
          <span className={styles.stripe} />
        </span>
        <span className={`${styles.wordmark} display`}>Tora</span>
        {syncState && syncState !== 'disabled' ? (
          <Tooltip
            label={SYNC_TITLES[syncState]}
            detail={
              syncState === 'error' ? (syncError ?? SYNC_DETAILS.error) : SYNC_DETAILS[syncState]
            }
            side="bottom"
            className={styles.syncSlot}
          >
            <span
              className={[
                styles.sync,
                syncState === 'idle' ? styles.syncOk : '',
                syncState === 'syncing' ? styles.syncActive : '',
                syncState === 'error' ? styles.syncError : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="status"
              aria-label={SYNC_TITLES[syncState]}
              // Not a tab stop: it is a status indicator, not a control. The
              // role=status live region announces it to screen readers, and the
              // tooltip detail is supplementary (hover only). Being focusable put
              // it in the Tab order, where landing on it popped the tooltip open.
            >
              <Icon
                name={syncState === 'syncing' ? 'sync' : syncState === 'error' ? 'close' : 'check'}
                size={11}
              />
            </span>
          </Tooltip>
        ) : null}
      </div>

      <div className={styles.scroll}>
        <span className={styles.groupLabel}>Library</span>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`${styles.row} ${activeFilter === f.id ? styles.active : ''}`}
            title={collapsed ? f.label : undefined}
            onClick={() => onFilter(f.id)}
          >
            <Icon name={f.icon} size={15} />
            <span className={styles.rowLabel}>{f.label}</span>
          </button>
        ))}
      </div>

      <button
        className={`${styles.row} ${styles.railToggle}`}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={onToggleCollapse}
      >
        <Icon name="sidebar" size={15} />
        <span className={styles.rowLabel}>Collapse</span>
      </button>
    </nav>
  )
}

// Memoized: App re-renders on every store change (captures, stats ticks), but
// the rail only depends on filter/sync/collapsed + stable handlers.
export const Sidebar = memo(SidebarImpl)
