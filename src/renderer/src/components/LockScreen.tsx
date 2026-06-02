import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Icon } from './Icon'
import styles from './LockScreen.module.css'

interface LockScreenProps {
  reducedMotion: boolean
  onUnlock: () => void
}

/**
 * App-lock gate. Covers the whole window until the user authenticates (Touch ID
 * via the main process). Attempts unlock automatically on mount, since the OS
 * biometric prompt is the natural first interaction.
 */
export function LockScreen({ reducedMotion, onUnlock }: LockScreenProps): React.JSX.Element {
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const tryUnlock = async (): Promise<void> => {
    setBusy(true)
    setError(false)
    const ok = await window.tora.unlock()
    setBusy(false)
    if (ok) onUnlock()
    else setError(true)
  }

  useEffect(() => {
    // Defer so the biometric prompt fires after paint, not synchronously in
    // the effect body (avoids cascading renders).
    const t = setTimeout(() => void tryUnlock(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className={styles.lock}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <span className={styles.mark} aria-hidden="true">
        <Icon name="lock" size={30} />
      </span>
      <h1 className={`${styles.title} display`}>Tora is locked</h1>
      <p className={styles.hint}>
        {error ? 'Authentication failed. Try again.' : 'Authenticate to view your clipboard.'}
      </p>
      <button className={styles.button} disabled={busy} onClick={() => void tryUnlock()}>
        {busy ? 'Waiting...' : 'Unlock'}
      </button>
    </motion.div>
  )
}
