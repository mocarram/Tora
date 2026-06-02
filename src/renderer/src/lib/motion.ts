import type { Transition, Variants } from 'framer-motion'

/**
 * Shared motion language. Spring-led and tactile to sell the "stack of cards"
 * feel. Every consumer must respect prefers-reduced-motion via `useReducedTora`.
 */

export const cardSpring: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 34,
  mass: 0.9,
}

export const panelSpring: Transition = {
  type: 'spring',
  stiffness: 360,
  damping: 38,
  mass: 1,
}

export const snappy: Transition = {
  type: 'spring',
  stiffness: 700,
  damping: 40,
}

/** Card enter/exit: lifts up and settles, like a card dropped on a stack. */
export const cardVariants: Variants = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: cardSpring },
  exit: { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } },
}

/** Bottom panel slide-up. */
export const panelVariants: Variants = {
  hidden: { y: '8%', opacity: 0 },
  shown: { y: 0, opacity: 1, transition: panelSpring },
}

/** Press feedback for interactive cards/buttons. */
export const pressable = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.97, y: 0 },
  transition: snappy,
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Collapse a transition to an instant cut when reduced motion is requested. */
export function reduce<T extends Transition>(t: T, reduced: boolean): Transition {
  return reduced ? { duration: 0 } : t
}
