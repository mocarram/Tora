import type { ClipItem } from '@core/model'
import type { PasteFormat } from '@shared/ipc'
import { Icon } from './Icon'
import { TYPE_META } from './typeMeta'
import { toPreviewLine } from '@core/format'
import styles from './QueueBar.module.css'

interface QueueBarProps {
  queue: string[]
  items: ClipItem[]
  format: PasteFormat
  onFormat: (f: PasteFormat) => void
  onRemove: (id: string) => void
  onClear: () => void
  onPaste: () => void
}

/**
 * Queue paste bar: shows the ordered selection and pastes it in sequence into
 * the target app, with a keep-formatting / force-plain toggle.
 */
export function QueueBar({
  queue,
  items,
  format,
  onFormat,
  onRemove,
  onClear,
  onPaste,
}: QueueBarProps): React.JSX.Element | null {
  if (queue.length === 0) return null
  const byId = new Map(items.map((i) => [i.id, i]))

  return (
    <div className={styles.bar}>
      <span className={styles.title}>
        <Icon name="queue" size={15} /> Queue
        <span className={`${styles.count} mono`}>{queue.length}</span>
      </span>

      <div className={styles.chips}>
        {queue.map((id, n) => {
          const item = byId.get(id)
          return (
            <span className={styles.chip} key={id}>
              <span className={`${styles.chipNum} mono`}>{n + 1}</span>
              <Icon name={item ? TYPE_META[item.type].icon : 'text'} size={12} />
              <span className={styles.chipText}>
                {item ? toPreviewLine(item.previewText, 24) : 'item'}
              </span>
              <button className={styles.chipX} aria-label="Remove" onClick={() => onRemove(id)}>
                <Icon name="close" size={11} />
              </button>
            </span>
          )
        })}
      </div>

      <div className={styles.controls}>
        <div className={styles.formatToggle}>
          <button
            className={`${styles.fmt} ${format === 'keep' ? styles.fmtOn : ''}`}
            onClick={() => onFormat('keep')}
          >
            Keep
          </button>
          <button
            className={`${styles.fmt} ${format === 'plain' ? styles.fmtOn : ''}`}
            onClick={() => onFormat('plain')}
          >
            Plain
          </button>
        </div>
        <button className={styles.clear} onClick={onClear}>
          Clear
        </button>
        <button className={styles.paste} onClick={onPaste}>
          <Icon name="paste" size={14} /> Paste all
        </button>
      </div>
    </div>
  )
}
