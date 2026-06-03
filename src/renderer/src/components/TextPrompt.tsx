import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { panelSpring } from '../lib/motion'
import styles from './TextPrompt.module.css'

interface TextPromptProps {
  open: boolean
  title: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  reducedMotion: boolean
  onConfirm: (value: string) => void
  onCancel: () => void
}

/**
 * Minimal in-app text prompt. Electron does not support window.prompt(), so this
 * replaces it for board creation/rename and similar single-field inputs.
 */
export function TextPrompt({
  open,
  title,
  placeholder,
  initialValue = '',
  confirmLabel = 'Create',
  reducedMotion,
  onConfirm,
  onCancel,
}: TextPromptProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [hasValue, setHasValue] = useState(initialValue.trim().length > 0)

  useEffect(() => {
    if (!open) return
    // Focus after the enter animation paints.
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  const submit = (): void => {
    const trimmed = (inputRef.current?.value ?? '').trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={styles.scrim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.12 }}
          onClick={onCancel}
        >
          <motion.div
            className={styles.dialog}
            initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={panelSpring}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <span className={styles.title}>{title}</span>
            <input
              ref={inputRef}
              className={styles.input}
              defaultValue={initialValue}
              placeholder={placeholder}
              spellCheck={false}
              onChange={(e) => setHasValue(e.target.value.trim().length > 0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') onCancel()
              }}
            />
            <div className={styles.actions}>
              <button className={styles.cancel} onClick={onCancel}>
                Cancel
              </button>
              <button className={styles.confirm} onClick={submit} disabled={!hasValue}>
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
