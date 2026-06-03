import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import styles from './UpdateBanner.module.css'

/**
 * A quiet bottom pill for the in-app updater: shows download progress, then a
 * "Restart" action once an update is ready. Hidden while locked or when settings
 * is open. Other states (idle/checking/error) stay silent so it never nags.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const status = useStore((s) => s.updateStatus)
  const locked = useStore((s) => s.locked)
  const settingsOpen = useStore((s) => s.settingsOpen)
  if (!status || locked || settingsOpen) return null

  if (status.state === 'downloading') {
    const pct = status.percent != null ? ` ${status.percent}%` : ''
    return (
      <div className={styles.banner} role="status" aria-live="polite">
        <span className={styles.dot} aria-hidden="true" />
        <span>Downloading update{pct}</span>
      </div>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <div className={`${styles.banner} ${styles.ready}`} role="status" aria-live="polite">
        <Icon name="check" size={14} />
        <span>Update ready{status.version ? ` (${status.version})` : ''}</span>
        <button className={styles.action} onClick={() => void window.tora.installUpdate()}>
          Restart
        </button>
      </div>
    )
  }

  return null
}
