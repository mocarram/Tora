import { forwardRef, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import styles from './SearchBar.module.css'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  resultCount: number | null
}

/**
 * Collapsible search: a quiet magnifier that expands into a field when focused
 * or while a query is active. The input always exists (just clipped), so
 * type-to-search and "/" can focus it from anywhere and the expansion follows
 * via state - no mount/unmount races with the keyboard handlers.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, resultCount },
  ref,
): React.JSX.Element {
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const open = focused || value.length > 0

  // An empty, open search collapses on any click elsewhere in the app. Click
  // targets do not reliably blur the input (cards prevent default on mousedown
  // for drag), so this listens at the document level.
  useEffect(() => {
    if (!focused || value) return
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        wrapRef.current?.querySelector('input')?.blur()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [focused, value])

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${open ? styles.open : ''}`}
      onClick={(e) => e.currentTarget.querySelector('input')?.focus()}
    >
      <span className={styles.icon}>
        <Icon name="search" size={15} />
      </span>
      <input
        ref={ref}
        className={styles.input}
        type="text"
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder="Search clips, apps, boards"
        aria-label="Search"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {value ? (
        <>
          <span className={`${styles.count} mono`}>{resultCount ?? 0}</span>
          <button className={styles.clear} aria-label="Clear search" onClick={() => onChange('')}>
            <Icon name="close" size={13} />
          </button>
        </>
      ) : null}
    </div>
  )
})
