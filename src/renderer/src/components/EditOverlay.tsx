import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ClipItem } from '@core/model'
import { panelSpring } from '../lib/motion'
import styles from './LargePreview.module.css'
import edit from './EditOverlay.module.css'

interface EditOverlayProps {
  item: ClipItem | null
  reducedMotion: boolean
  onCancel: () => void
  onSave: (id: string, text: string) => void
}

export function EditOverlay({
  item,
  reducedMotion,
  onCancel,
  onSave,
}: EditOverlayProps): React.JSX.Element {
  const [text, setText] = useState('')

  useEffect(() => {
    if (!item) return
    void window.tora.getFullContent(item.id).then((c) => setText(c?.text ?? item.previewText))
  }, [item])

  return (
    <AnimatePresence>
      {item ? (
        <motion.div
          className={styles.scrim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.15 }}
          onClick={onCancel}
        >
          <motion.div
            className={`${styles.sheet} ${edit.sheet}`}
            initial={reducedMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            transition={panelSpring}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Edit clip"
          >
            <header className={styles.head}>
              <span className={styles.headTitle}>Edit text</span>
            </header>
            <textarea
              className={`${edit.area} selectable mono`}
              value={text}
              autoFocus
              aria-label="Clip content"
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
            />
            <footer className={styles.foot}>
              <button className={styles.action} onClick={onCancel}>
                Cancel
              </button>
              <button
                className={`${styles.action} ${styles.primary}`}
                onClick={() => onSave(item.id, text)}
              >
                Save
              </button>
            </footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
