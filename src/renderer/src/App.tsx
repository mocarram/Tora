import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PasteFormat } from '@shared/ipc'
import { formatBytes } from '@core/format'
import { Sidebar } from './components/Sidebar'
import { SearchBar } from './components/SearchBar'
import { VirtualDeck } from './components/VirtualDeck'
import { LargePreview } from './components/LargePreview'
import { EditOverlay } from './components/EditOverlay'
import { Settings } from './components/Settings'
import { QueueBar } from './components/QueueBar'
import { LockScreen } from './components/LockScreen'
import { Onboarding } from './components/Onboarding'
import { TextPrompt } from './components/TextPrompt'
import { UpdateBanner } from './components/UpdateBanner'
import { Icon } from './components/Icon'
import { useStore } from './store/useStore'
import { useToraBridge } from './hooks/useToraBridge'
import { prefersReducedMotion } from './lib/motion'
import styles from './App.module.css'
import './styles/highlight.css'

export function App(): React.JSX.Element {
  useToraBridge()

  const store = useStore()
  const searchRef = useRef<HTMLInputElement>(null)
  const settingsOpen = store.settingsOpen
  const setSettingsOpen = store.setSettingsOpen
  const [newBoardOpen, setNewBoardOpen] = useState(false)
  const [queueFormat, setQueueFormat] = useState<PasteFormat>('keep')

  const reducedMotion = prefersReducedMotion() || (store.settings?.reduceMotion ?? false)
  const windowMode = store.settings?.windowMode ?? 'panel'
  const onboardingOpen =
    store.ready && !!store.settings && !store.settings.onboardingComplete && !store.locked

  // Tell main to suppress panel auto-hide while any modal/overlay is open, so
  // clicking outside the app does not yank the panel away mid-task.
  const modalOpen =
    settingsOpen ||
    !!store.expandedId ||
    !!store.editingId ||
    newBoardOpen ||
    store.locked ||
    onboardingOpen ||
    !!store.openMenuId
  useEffect(() => {
    void window.tora.setHideSuppressed(modalOpen)
  }, [modalOpen])

  const selectedItem = useMemo(
    () => store.items.find((i) => i.id === store.selectedId) ?? null,
    [store.items, store.selectedId],
  )
  const expandedItem = useMemo(
    () => store.items.find((i) => i.id === store.expandedId) ?? null,
    [store.items, store.expandedId],
  )
  const editingItem = useMemo(
    () => store.items.find((i) => i.id === store.editingId) ?? null,
    [store.items, store.editingId],
  )

  const moveSelection = useCallback(
    (dir: 1 | -1) => {
      const idx = store.items.findIndex((i) => i.id === store.selectedId)
      const next = Math.max(0, Math.min(store.items.length - 1, idx + dir))
      const target = store.items[next]
      if (target) store.select(target.id)
      if (next > store.items.length - 8) void store.loadMore()
    },
    [store],
  )

  const copy = useCallback((id: string) => void window.tora.copyItem(id), [])
  const paste = useCallback(
    (id: string, format: PasteFormat = store.settings?.pasteFormatDefault ?? 'keep') =>
      void window.tora.pasteItem({ itemId: id, format }),
    [store.settings],
  )
  const togglePin = useCallback(
    (id: string, pinned: boolean) => void window.tora.pinItem(id, pinned),
    [],
  )
  const remove = useCallback((id: string) => void window.tora.deleteItem(id), [])

  // Global keyboard navigation. Ignored while typing or an overlay is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const overlay = settingsOpen || store.expandedId || store.editingId
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement

      if (e.key === '/' && !typing && !overlay) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'Escape') {
        if (typing && document.activeElement === searchRef.current) {
          searchRef.current?.blur()
        } else if (!overlay) {
          // Panel mode: Esc dismisses (it is a popover). Window mode stays open
          // like a normal window; Esc just clears the selection.
          if (windowMode === 'panel') void window.tora.hidePanel()
          else store.select(null)
        }
        return
      }
      if (overlay) return
      if (typing && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

      const id = store.selectedId
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault()
          moveSelection(1)
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault()
          moveSelection(-1)
          break
        case 'Enter':
          if (id) paste(id, e.shiftKey ? 'plain' : undefined)
          break
        case ' ':
          if (id) {
            e.preventDefault()
            store.expand(id)
          }
          break
        case 'c':
        case 'C':
          if (id) copy(id)
          break
        case 'e':
        case 'E':
          if (id) store.edit(id)
          break
        case 'q':
        case 'Q':
          if (id) store.toggleQueue(id)
          break
        case 'p':
        case 'P':
          if (id && selectedItem) togglePin(id, !selectedItem.isPinned)
          break
        case 'Delete':
        case 'Backspace':
          if (id) {
            moveSelection(1)
            remove(id)
          }
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store, settingsOpen, windowMode, selectedItem, moveSelection, copy, paste, togglePin, remove])

  const stats = store.stats
  const capPct =
    stats && stats.softCapBytes > 0
      ? Math.min(100, Math.round((stats.totalBytes / stats.softCapBytes) * 100))
      : 0

  return (
    <div className={styles.shell}>
      <Sidebar
        boards={store.boards}
        activeFilter={store.filter}
        activeBoardId={store.boardId}
        onFilter={(filter) => store.setView({ filter })}
        onBoard={(boardId) => store.setView({ boardId })}
        onNewBoard={() => setNewBoardOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onAddToBoard={(boardId, itemId) => void window.tora.addItemToBoard({ boardId, itemId })}
        onReorderBoards={(orderedIds) => void window.tora.reorderBoards({ orderedIds })}
      />

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.search}>
            <SearchBar
              ref={searchRef}
              value={store.query}
              onChange={(query) => store.setView({ query })}
              resultCount={store.total}
            />
          </div>
          <div className={styles.spacer} />
          <div className={styles.modeToggle} role="tablist" aria-label="Window mode">
            <button
              className={`${styles.modeBtn} ${store.settings?.windowMode === 'panel' ? styles.on : ''}`}
              onClick={() => void window.tora.setWindowMode('panel')}
            >
              Panel
            </button>
            <button
              className={`${styles.modeBtn} ${store.settings?.windowMode === 'window' ? styles.on : ''}`}
              onClick={() => void window.tora.setWindowMode('window')}
            >
              Window
            </button>
          </div>
        </div>

        <VirtualDeck
          items={store.items}
          total={store.total}
          selectedId={store.selectedId}
          queue={store.queue}
          layout={store.settings?.windowMode === 'window' ? 'grid' : 'deck'}
          reducedMotion={reducedMotion}
          onSelect={store.select}
          onActivate={(id) => paste(id)}
          onCopy={copy}
          onTogglePin={togglePin}
          onDelete={remove}
          onExpand={store.expand}
          onEdit={store.edit}
          onToggleQueue={store.toggleQueue}
          onNeedMore={() => void store.loadMore()}
        />

        <QueueBar
          queue={store.queue}
          items={store.items}
          format={queueFormat}
          onFormat={setQueueFormat}
          onRemove={store.toggleQueue}
          onClear={store.clearQueue}
          onPaste={() => {
            void window.tora.queuePaste({ itemIds: store.queue, format: queueFormat, delayMs: 150 })
            store.clearQueue()
          }}
        />

        <div className={styles.statusbar}>
          <span className={styles.statusItem}>
            <span
              className={styles.statusDot}
              style={{
                background: store.settings?.captureEnabled
                  ? 'var(--color-positive)'
                  : 'var(--color-text-faint)',
              }}
            />
            {store.settings?.captureEnabled ? 'Capturing' : 'Paused'}
          </span>
          <span className={styles.statusItem}>{stats?.itemCount ?? 0} items</span>
          {stats && stats.softCapBytes > 0 && (
            <span className={styles.statusItem}>
              <span className={styles.storageMeter}>
                <span className={styles.storageFill} style={{ width: `${capPct}%` }} />
              </span>
              {formatBytes(stats.totalBytes)}
            </span>
          )}
          {store.settings?.retentionDays === null && (
            <span className={styles.statusItem} style={{ color: 'var(--color-danger)' }}>
              <Icon name="layers" size={12} /> Unlimited history
            </span>
          )}
          <span className={`${styles.statusItem} ${styles.statusRight}`}>
            Cmd-click or Q to queue
          </span>
          <button
            className={styles.statusItem}
            onClick={() => selectedItem && store.toggleQueue(selectedItem.id)}
          >
            <Icon name="queue" size={13} /> Queue selected
          </button>
        </div>
      </div>

      <LargePreview
        item={expandedItem}
        reducedMotion={reducedMotion}
        onClose={() => store.expand(null)}
        onCopy={(id) => {
          copy(id)
          store.expand(null)
        }}
        onPaste={(id) => {
          paste(id)
          store.expand(null)
        }}
      />
      <EditOverlay
        item={editingItem}
        reducedMotion={reducedMotion}
        onCancel={() => store.edit(null)}
        onSave={(id, text) => {
          void window.tora.editItem({ itemId: id, text })
          store.edit(null)
        }}
      />
      <Settings
        open={settingsOpen}
        reducedMotion={reducedMotion}
        onClose={() => setSettingsOpen(false)}
      />

      <Onboarding
        open={onboardingOpen}
        reducedMotion={reducedMotion}
        onComplete={() => void window.tora.updateSettings({ onboardingComplete: true })}
      />

      <TextPrompt
        open={newBoardOpen}
        title="New board"
        placeholder="Board name"
        confirmLabel="Create"
        reducedMotion={reducedMotion}
        onCancel={() => setNewBoardOpen(false)}
        onConfirm={(name) => {
          void window.tora.createBoard({ name })
          setNewBoardOpen(false)
        }}
      />

      <UpdateBanner />

      {store.locked && (
        <LockScreen reducedMotion={reducedMotion} onUnlock={() => store.setLocked(false)} />
      )}
    </div>
  )
}
