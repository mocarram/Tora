import { useEffect, useMemo, useRef, useState } from 'react'
import type { QuickFilter } from '@core/model'
import { formatBytes } from '@core/format'
import { Sidebar } from './components/Sidebar'
import { SearchBar } from './components/SearchBar'
import { Deck } from './components/Deck'
import { watchTheme } from './lib/theme'
import { prefersReducedMotion } from './lib/motion'
import { MOCK_BOARDS, MOCK_ITEMS } from './mock/mockItems'
import styles from './App.module.css'
import './styles/highlight.css'

/**
 * Phase 1 reference screen. Renders the design system against MOCK data so the
 * visual language can be reviewed before any capture/IPC exists. Phase 3
 * replaces mock state with live data from `window.tora`.
 */
export function App(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<QuickFilter>('all')
  const [boardId, setBoardId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_ITEMS[0]?.id ?? null)
  const [mode, setMode] = useState<'panel' | 'window'>('window')
  const searchRef = useRef<HTMLInputElement>(null)
  const reducedMotion = prefersReducedMotion()

  useEffect(() => watchTheme('system'), [])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return MOCK_ITEMS.filter((it) => {
      if (filter === 'text' && it.type !== 'text' && it.type !== 'richText') return false
      if (filter === 'images' && it.type !== 'image') return false
      if (filter === 'links' && it.type !== 'url') return false
      if (filter === 'files' && it.type !== 'file') return false
      if (boardId && !it.isPinned) return false
      if (q && !it.previewText.toLowerCase().includes(q)) return false
      return true
    })
  }, [query, filter, boardId])

  // Keyboard: "/" focuses search, arrows move selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const idx = items.findIndex((it) => it.id === selectedId)
        const next = e.key === 'ArrowRight' ? idx + 1 : idx - 1
        const clamped = Math.max(0, Math.min(items.length - 1, next))
        const target = items[clamped]
        if (target) setSelectedId(target.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, selectedId])

  const totalBytes = MOCK_ITEMS.reduce((sum, it) => sum + it.byteSize, 0)
  const noop = (): void => {}

  return (
    <div className={styles.shell}>
      <Sidebar
        boards={MOCK_BOARDS}
        activeFilter={filter}
        activeBoardId={boardId}
        onFilter={setFilter}
        onBoard={setBoardId}
        onNewBoard={noop}
        onOpenSettings={noop}
      />

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.search}>
            <SearchBar
              ref={searchRef}
              value={query}
              onChange={setQuery}
              resultCount={items.length}
            />
          </div>
          <div className={styles.spacer} />
          <div className={styles.modeToggle} role="tablist" aria-label="Window mode">
            <button
              className={`${styles.modeBtn} ${mode === 'panel' ? styles.on : ''}`}
              onClick={() => setMode('panel')}
            >
              Panel
            </button>
            <button
              className={`${styles.modeBtn} ${mode === 'window' ? styles.on : ''}`}
              onClick={() => setMode('window')}
            >
              Window
            </button>
          </div>
        </div>

        <Deck
          items={items}
          selectedId={selectedId}
          reducedMotion={reducedMotion}
          onSelect={setSelectedId}
          onActivate={noop}
          onCopy={noop}
          onTogglePin={noop}
          onDelete={noop}
          onExpand={noop}
        />

        <div className={styles.statusbar}>
          <span className={styles.statusItem}>
            <span className={styles.statusDot} />
            Capturing
          </span>
          <span className={styles.statusItem}>{MOCK_ITEMS.length} items</span>
          <span className={styles.statusItem}>
            <span className={styles.storageMeter}>
              <span className={styles.storageFill} style={{ width: '24%' }} />
            </span>
            {formatBytes(totalBytes)}
          </span>
          <span className={`${styles.statusItem} ${styles.statusRight}`}>
            Reference data (mock)
          </span>
        </div>
      </div>
    </div>
  )
}
