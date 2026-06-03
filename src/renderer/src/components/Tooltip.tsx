import { useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './Tooltip.module.css'

interface Pos {
  x: number
  y: number
}

/**
 * Immediate tooltip rendered through a portal to the document body, so it is
 * never clipped by an ancestor's overflow (the clip cards are overflow:hidden)
 * and has none of the native `title` delay. Shows on hover and keyboard focus.
 */
export function Tooltip({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  const [pos, setPos] = useState<Pos | null>(null)

  const show = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect()
    // Clamp the centre so long labels (e.g. "Remove from queue") stay on screen.
    const x = Math.min(Math.max(r.left + r.width / 2, 80), window.innerWidth - 80)
    setPos({ x, y: r.top })
  }

  return (
    <span
      className={styles.wrap}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      onFocusCapture={(e) => show(e.currentTarget)}
      onBlurCapture={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div className={styles.tip} role="tooltip" style={{ left: pos.x, top: pos.y }}>
            {label}
          </div>,
          document.body,
        )}
    </span>
  )
}
