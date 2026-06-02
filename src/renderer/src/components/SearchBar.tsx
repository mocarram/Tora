import { forwardRef } from 'react'
import { Icon } from './Icon'
import styles from './SearchBar.module.css'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  resultCount: number | null
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, resultCount },
  ref,
): React.JSX.Element {
  return (
    <div className={styles.wrap}>
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
      />
      {value ? (
        <>
          <span className={`${styles.count} mono`}>{resultCount ?? 0}</span>
          <button className={styles.clear} aria-label="Clear search" onClick={() => onChange('')}>
            <Icon name="close" size={13} />
          </button>
        </>
      ) : (
        <kbd className={styles.kbd}>/</kbd>
      )}
    </div>
  )
})
