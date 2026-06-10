import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { panelSpring } from '../lib/motion'
import { useFocusTrap } from '../hooks/useFocusTrap'
import styles from './ConfirmDialog.module.css'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  /** Style the confirm button as destructive (red). */
  danger?: boolean
  /**
   * When set, the confirm button stays disabled until the user types this exact
   * phrase. Used to gate the most destructive actions (e.g. a factory reset).
   */
  confirmPhrase?: string
  reducedMotion: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Destructive-action confirmation. Mirrors TextPrompt's framing (scrim + spring
 * dialog) but for a yes/no decision, with an optional type-to-confirm phrase for
 * irreversible operations.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  confirmPhrase,
  reducedMotion,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, open)
  const [typed, setTyped] = useState('')

  // Focus the phrase field once the enter animation paints.
  useEffect(() => {
    if (!open || !confirmPhrase) return undefined
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open, confirmPhrase])

  const ready = confirmPhrase ? typed.trim() === confirmPhrase : true

  // Clear the typed phrase as the dialog closes so it never persists into a
  // later open (the component itself stays mounted behind AnimatePresence).
  const cancel = (): void => {
    setTyped('')
    onCancel()
  }
  const confirm = (): void => {
    setTyped('')
    onConfirm()
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
          onClick={(e) => {
            e.stopPropagation()
            cancel()
          }}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            className={styles.dialog}
            initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={panelSpring}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
          >
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.message}>{message}</p>
            {confirmPhrase ? (
              <input
                ref={inputRef}
                className={styles.input}
                value={typed}
                spellCheck={false}
                placeholder={`Type ${confirmPhrase} to confirm`}
                aria-label={`Type ${confirmPhrase} to confirm`}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ready) confirm()
                  if (e.key === 'Escape') cancel()
                }}
              />
            ) : null}
            <div className={styles.actions}>
              <button className={styles.cancel} onClick={cancel}>
                Cancel
              </button>
              <button
                className={`${styles.confirm} ${danger ? styles.danger : ''}`}
                onClick={confirm}
                disabled={!ready}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
