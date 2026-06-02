import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { PermissionStatus } from '@shared/ipc'
import { Icon } from './Icon'
import { panelSpring } from '../lib/motion'
import styles from './Onboarding.module.css'

interface OnboardingProps {
  open: boolean
  reducedMotion: boolean
  onComplete: () => void
}

/**
 * First-run onboarding. Explains capture and walks through granting the macOS
 * Accessibility permission needed for direct paste, without blocking core use.
 */
export function Onboarding({
  open,
  reducedMotion,
  onComplete,
}: OnboardingProps): React.JSX.Element {
  const [perms, setPerms] = useState<PermissionStatus | null>(null)

  useEffect(() => {
    if (open) void window.tora.getPermissions().then(setPerms)
  }, [open])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={styles.scrim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          <motion.div
            className={styles.card}
            initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={panelSpring}
            role="dialog"
            aria-modal="true"
            aria-label="Welcome to Tora"
          >
            <span className={styles.mark} aria-hidden="true">
              <span className={styles.stripe} />
              <span className={styles.stripe} />
              <span className={styles.stripe} />
            </span>
            <h1 className={`${styles.title} display`}>Welcome to Tora</h1>
            <p className={styles.lede}>
              A privacy-first clipboard. Everything you copy lands on the deck, local to this
              device. Passwords and concealed content are never stored.
            </p>

            <ul className={styles.steps}>
              <Step icon="layers" title="Copy anything">
                Text, links, code, colours, images and files are captured automatically.
              </Step>
              <Step icon="search" title="Summon and search">
                Press your hotkey, then type to fuzzy-search your whole history.
              </Step>
              <Step icon="paste" title="Direct paste">
                Grant Accessibility so Tora can paste straight into the app you were using.
              </Step>
            </ul>

            <div className={styles.perm}>
              {perms?.accessibility ? (
                <span className={styles.granted}>
                  <Icon name="check" size={15} /> Accessibility granted
                </span>
              ) : (
                <button
                  className={styles.secondary}
                  onClick={() => {
                    void window.tora.requestAccessibility().then(() => {
                      setTimeout(() => void window.tora.getPermissions().then(setPerms), 600)
                    })
                  }}
                >
                  Grant Accessibility
                </button>
              )}
              <button className={styles.primary} onClick={onComplete}>
                Get started
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function Step({
  icon,
  title,
  children,
}: {
  icon: 'layers' | 'search' | 'paste'
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <li className={styles.step}>
      <span className={styles.stepIcon}>
        <Icon name={icon} size={16} />
      </span>
      <div>
        <span className={styles.stepTitle}>{title}</span>
        <span className={styles.stepText}>{children}</span>
      </div>
    </li>
  )
}
