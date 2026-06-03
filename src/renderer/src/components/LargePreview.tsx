import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import hljs from 'highlight.js/lib/common'
import type { ClipItem } from '@core/model'
import type { FullContent } from '@shared/ipc'
import { formatBytes, relativeTime } from '@core/format'
import { Icon } from './Icon'
import { TYPE_META } from './typeMeta'
import { panelSpring } from '../lib/motion'
import styles from './LargePreview.module.css'

interface LargePreviewProps {
  item: ClipItem | null
  reducedMotion: boolean
  onClose: () => void
  onCopy: (id: string) => void
  onPaste: (id: string) => void
}

export function LargePreview({
  item,
  reducedMotion,
  onClose,
  onCopy,
  onPaste,
}: LargePreviewProps): React.JSX.Element {
  const [loaded, setLoaded] = useState<{ id: string; data: FullContent | null }>({
    id: '',
    data: null,
  })

  useEffect(() => {
    if (!item) return
    let active = true
    void window.tora.getFullContent(item.id).then((c) => {
      if (active) setLoaded({ id: item.id, data: c })
    })
    return () => {
      active = false
    }
  }, [item])

  const content = item && loaded.id === item.id ? loaded.data : null

  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  return (
    <AnimatePresence>
      {item ? (
        <motion.div
          className={styles.scrim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.sheet}
            initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={panelSpring}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className={styles.head}>
              <span className={styles.headIcon}>
                <Icon name={TYPE_META[item.type].icon} size={15} />
              </span>
              <span className={styles.headTitle}>
                {item.sourceApp ?? TYPE_META[item.type].label}
              </span>
              <span className={`${styles.headMeta} mono`}>
                {formatBytes(item.byteSize)} - {relativeTime(item.updatedAt)}
              </span>
              <button className={styles.close} aria-label="Close" onClick={onClose}>
                <Icon name="close" size={16} />
              </button>
            </header>

            <div className={`${styles.body} selectable`}>
              <Body item={item} content={content} />
            </div>

            <footer className={styles.foot}>
              <button className={styles.action} onClick={() => onCopy(item.id)}>
                <Icon name="copy" size={15} /> Copy
              </button>
              <button
                className={`${styles.action} ${styles.primary}`}
                onClick={() => onPaste(item.id)}
              >
                <Icon name="paste" size={15} /> Paste
              </button>
            </footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function Body({
  item,
  content,
}: {
  item: ClipItem
  content: FullContent | null
}): React.JSX.Element {
  if (!content) return <p className={styles.loading}>Loading...</p>

  if (content.type === 'image' && content.imageDataUrl) {
    return <img className={styles.image} src={content.imageDataUrl} alt="" />
  }
  if (content.type === 'file' && content.filePaths) {
    return (
      <div className={styles.fileDetail}>
        {content.imageDataUrl ? (
          <img className={styles.image} src={content.imageDataUrl} alt="" />
        ) : null}
        <ul className={styles.fileList}>
          {content.filePaths.map((p) => (
            <li key={p} className="mono">
              {p}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (content.type === 'code' && content.text) {
    const lang = item.metadata.kind === 'code' ? item.metadata.language : null
    let html: string
    try {
      html =
        lang && hljs.getLanguage(lang)
          ? hljs.highlight(content.text, { language: lang }).value
          : hljs.highlightAuto(content.text).value
    } catch {
      html = ''
    }
    return (
      <pre className={styles.codeFull}>
        {html ? (
          <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className="hljs">{content.text}</code>
        )}
      </pre>
    )
  }
  return <pre className={styles.textFull}>{content.text}</pre>
}
