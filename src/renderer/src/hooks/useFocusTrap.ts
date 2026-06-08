import { useEffect, type RefObject } from 'react'
import { createFocusTrap } from '../lib/focusTrap'

/**
 * Contain keyboard focus within the referenced element while `active`, restoring
 * focus to the previously focused element when it deactivates or unmounts.
 * Attach the ref to a modal overlay's root and give it tabindex={-1} so it can
 * receive focus even when it has no focusable children. Pass `active` from the
 * same condition that renders the overlay so the trap engages once it is shown.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return
    const trap = createFocusTrap(el)
    return () => trap.release()
  }, [ref, active])
}
