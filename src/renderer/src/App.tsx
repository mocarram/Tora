import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PasteFormat } from '@shared/ipc'
import type { Board, QuickFilter } from '@core/model'
import { formatBytes } from '@core/format'
import { Sidebar } from './components/Sidebar'
import { ConfirmDialog } from './components/ConfirmDialog'
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
import { isTypeToSearchKey } from './lib/typeToSearch'
import styles from './App.module.css'
import './styles/highlight.css'

// Core actions surface failures as a toast instead of failing silently: a
// paste that cannot inject (Accessibility revoked) or a delete that errors
// must tell the user SOMETHING happened.
const notify =
  (message: string) =>
  (err: unknown): void => {
    console.error('[tora]', message, err)
    useStore.getState().setNotice(message)
  }

export function App(): React.JSX.Element {
  useToraBridge()

  const store = useStore()
  const searchRef = useRef<HTMLInputElement>(null)
  const settingsOpen = store.settingsOpen
  const setSettingsOpen = store.setSettingsOpen
  const [newBoardOpen, setNewBoardOpen] = useState(false)
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<Board | null>(null)
  const [queueFormat, setQueueFormat] = useState<PasteFormat>('keep')

  // matchMedia is a DOM query - resolve it once, not on every render.
  const systemReducedMotion = useMemo(() => prefersReducedMotion(), [])
  const reducedMotion = systemReducedMotion || (store.settings?.reduceMotion ?? false)
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
    !!deleteBoardTarget ||
    store.locked ||
    onboardingOpen ||
    !!store.openMenuId
  useEffect(() => {
    void window.tora.setHideSuppressed(modalOpen)
  }, [modalOpen])

  // Failure toast auto-dismisses; any newer notice restarts the clock.
  const notice = store.notice
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => useStore.getState().setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

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

  const copy = useCallback(
    (id: string) => void window.tora.copyItem(id).catch(notify('Copy failed')),
    [],
  )
  const paste = useCallback(
    (id: string, format: PasteFormat = store.settings?.pasteFormatDefault ?? 'keep') =>
      void window.tora.pasteItem({ itemId: id, format }).catch(notify('Paste failed')),
    [store.settings],
  )
  const togglePin = useCallback(
    (id: string, pinned: boolean) =>
      void window.tora.pinItem(id, pinned).catch(notify('Pin failed')),
    [],
  )
  const remove = useCallback(
    (id: string) => void window.tora.deleteItem(id).catch(notify('Delete failed')),
    [],
  )
  // Stable so memoized ClipCards do not re-render on every deck re-render (resize).
  const setTitle = useCallback(
    (id: string, title: string | null) => void window.tora.setItemTitle(id, title),
    [],
  )
  // Stable handlers (via getState, not the subscribed store object) so the
  // memoized VirtualDeck and Sidebar skip re-renders when unrelated state
  // changes - App subscribes to the whole store, so it re-renders often.
  const needMore = useCallback(() => void useStore.getState().loadMore(), [])
  const setFilter = useCallback(
    (filter: QuickFilter) => useStore.getState().setView({ filter }),
    [],
  )
  const setBoard = useCallback(
    (boardId: string | null) => useStore.getState().setView({ boardId }),
    [],
  )
  const openNewBoard = useCallback(() => setNewBoardOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [setSettingsOpen])
  const addToBoard = useCallback(
    (boardId: string, itemId: string) => void window.tora.addItemToBoard({ boardId, itemId }),
    [],
  )
  const reorderBoards = useCallback(
    (orderedIds: string[]) => void window.tora.reorderBoards({ orderedIds }),
    [],
  )
  const renameBoard = useCallback(
    (boardId: string, name: string) => void window.tora.renameBoard(boardId, name),
    [],
  )
  const deleteBoard = useCallback((board: Board) => setDeleteBoardTarget(board), [])

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

      const id = store.selectedId

      // Card actions live behind Cmd (type-to-search owns the bare letters).
      // Checked before the typing guard so they keep working while the search
      // field is focused mid-query - but NOT from other inputs (board rename,
      // title edit), where Cmd combos must keep their native text behaviour.
      const inOtherInput = typing && document.activeElement !== searchRef.current
      if (e.metaKey && !e.ctrlKey && !e.altKey && !inOtherInput) {
        switch (e.key.toLowerCase()) {
          case 'c': {
            // Native copy wins when text is actually selected in the search
            // field; otherwise Cmd+C means "copy the selected card".
            const el = document.activeElement
            if (
              el instanceof HTMLInputElement &&
              el === searchRef.current &&
              el.selectionStart !== el.selectionEnd
            ) {
              return
            }
            if (id) {
              e.preventDefault()
              copy(id)
            }
            return
          }
          case 'e': // browser default: use-selection-for-find
            if (id) {
              e.preventDefault()
              store.edit(id)
            }
            return
          case 'p': // browser default: print
            if (id && selectedItem) {
              e.preventDefault()
              togglePin(id, !selectedItem.isPinned)
            }
            return
          case 'd': // browser default: bookmark
            if (id) {
              e.preventDefault()
              store.toggleQueue(id)
            }
            return
          default:
            return // other Cmd combos (V, A, W...) keep their native meaning
        }
      }

      if (typing && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

      // Type-to-search: any printable key starts typing into the search field.
      // Focus it and DON'T preventDefault - the keystroke's default action
      // inserts the character into the newly focused input, and the existing
      // debounce turns it into a query.
      if (isTypeToSearchKey(e)) {
        searchRef.current?.focus()
        return
      }

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
        syncState={store.syncStatus?.state ?? null}
        onFilter={setFilter}
        onBoard={setBoard}
        onNewBoard={openNewBoard}
        onOpenSettings={openSettings}
        onAddToBoard={addToBoard}
        onReorderBoards={reorderBoards}
        onRenameBoard={renameBoard}
        onDeleteBoard={deleteBoard}
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
              role="tab"
              aria-selected={store.settings?.windowMode === 'panel'}
              className={`${styles.modeBtn} ${store.settings?.windowMode === 'panel' ? styles.on : ''}`}
              onClick={() => void window.tora.setWindowMode('panel')}
            >
              Panel
            </button>
            <button
              role="tab"
              aria-selected={store.settings?.windowMode === 'window'}
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
          emptyContext={store.query ? 'search' : store.boardId ? 'board' : 'library'}
          scrollResetKey={store.openNonce}
          onSelect={store.select}
          onActivate={paste}
          onCopy={copy}
          onTogglePin={togglePin}
          onDelete={remove}
          onExpand={store.expand}
          onEdit={store.edit}
          onToggleQueue={store.toggleQueue}
          onSetTitle={setTitle}
          onNeedMore={needMore}
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

        {store.queue.length === 0 && (
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
              Type to search · ⌘D to queue
            </span>
            <button
              className={styles.statusItem}
              onClick={() => selectedItem && store.toggleQueue(selectedItem.id)}
            >
              <Icon name="queue" size={13} /> Queue selected
            </button>
          </div>
        )}
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

      <ConfirmDialog
        open={!!deleteBoardTarget}
        title={deleteBoardTarget ? `Delete "${deleteBoardTarget.name}"?` : 'Delete board?'}
        message="The board is removed. The clips inside it stay in your library."
        confirmLabel="Delete board"
        danger
        reducedMotion={reducedMotion}
        onCancel={() => setDeleteBoardTarget(null)}
        onConfirm={() => {
          if (deleteBoardTarget) void window.tora.deleteBoard(deleteBoardTarget.id)
          setDeleteBoardTarget(null)
        }}
      />

      <UpdateBanner />

      {notice && (
        <div className={styles.noticeToast} role="alert">
          {notice}
        </div>
      )}

      {store.locked && (
        <LockScreen reducedMotion={reducedMotion} onUnlock={() => store.setLocked(false)} />
      )}
    </div>
  )
}
