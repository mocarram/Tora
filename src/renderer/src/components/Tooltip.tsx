import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './Tooltip.module.css'

interface Pos {
  x: number
  y: number
}

interface TooltipProps {
  label: string
  /** Optional second line: wraps, muted, for longer explanations. */
  detail?: string | undefined
  /** Open below the trigger instead of above (for triggers near the top edge). */
  side?: 'top' | 'bottom' | undefined
  /** Extra class for the inline wrapper (e.g. flex positioning in a row). */
  className?: string | undefined
  children: React.ReactNode
}

/**
 * Immediate tooltip rendered through a portal to the document body, so it is
 * never clipped by an ancestor's overflow (the clip cards are overflow:hidden)
 * and has none of the native `title` delay. Shows on hover and keyboard focus.
 */
export function Tooltip({
  label,
  detail,
  side = 'top',
  className,
  children,
}: TooltipProps): React.JSX.Element {
  const [pos, setPos] = useState<Pos | null>(null)

  const show = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect()
    // Clamp the centre so long labels (e.g. "Remove from queue") stay on screen.
    const x = Math.min(Math.max(r.left + r.width / 2, 80), window.innerWidth - 80)
    setPos({ x, y: side === 'top' ? r.top : r.bottom })
  }

  // While open, dismiss if the window loses focus or visibility. In panel mode
  // the window hides (it is not destroyed), so a tooltip opened by hover would
  // otherwise survive the hide and still be showing on the next summon - the
  // cursor never left, so no mouseleave fires to clear it.
  useEffect(() => {
    if (!pos) return
    const clear = (): void => setPos(null)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [pos])

  return (
    <span
      className={`${styles.wrap} ${className ?? ''}`}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      // Only open on KEYBOARD focus (:focus-visible). Programmatic focus - e.g.
      // the window restoring focus to this element on panel summon - must not
      // pop the tooltip open and leave it stuck (no blur/mouseleave follows).
      onFocusCapture={(e) => {
        if (e.target.matches(':focus-visible')) show(e.currentTarget)
      }}
      onBlurCapture={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div
            className={`${styles.tip} ${side === 'bottom' ? styles.below : ''} ${detail ? styles.rich : ''}`}
            role="tooltip"
            style={{ left: pos.x, top: pos.y }}
          >
            {label}
            {detail ? <div className={styles.detail}>{detail}</div> : null}
          </div>,
          document.body,
        )}
    </span>
  )
}
