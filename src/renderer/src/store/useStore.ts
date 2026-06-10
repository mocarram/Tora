import { create } from 'zustand'
import type { Board, ClipItem, QuickFilter } from '@core/model'
import type { AppSettings, StorageStats, SyncStatus, UpdateStatus } from '@shared/ipc'

const PAGE_SIZE = 120

interface ViewState {
  query: string
  filter: QuickFilter
  boardId: string | null
  pinnedOnly: boolean
}

interface StoreState extends ViewState {
  items: ClipItem[]
  total: number
  loading: boolean
  boards: Board[]
  settings: AppSettings | null
  stats: StorageStats | null
  syncStatus: SyncStatus | null
  selectedId: string | null
  expandedId: string | null
  editingId: string | null
  queue: string[]
  ready: boolean
  locked: boolean
  settingsOpen: boolean
  updateStatus: UpdateStatus | null
  /** Id of the card whose save-to-board menu is open (one at a time), or null. */
  openMenuId: string | null
  /** Bumped each time the panel is summoned, so the deck resets to the front. */
  openNonce: number
  /** Transient user-facing notice (e.g. a failed paste); cleared by the toast. */
  notice: string | null

  setNotice: (notice: string | null) => void
  setLocked: (locked: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setUpdateStatus: (status: UpdateStatus) => void
  setOpenMenuId: (id: string | null) => void
  init: () => Promise<void>
  reload: (opts?: { selectLatest?: boolean }) => Promise<void>
  /** On panel summon: refresh, select the newest (current clipboard) item, reset scroll. */
  onPanelShown: () => Promise<void>
  loadMore: () => Promise<void>
  setView: (patch: Partial<ViewState>) => void
  select: (id: string | null) => void
  expand: (id: string | null) => void
  edit: (id: string | null) => void
  toggleQueue: (id: string) => void
  clearQueue: () => void
  applyEvent: (item?: ClipItem) => void
  setBoards: (boards: Board[]) => void
  setSettings: (s: AppSettings) => void
  setSyncStatus: (status: SyncStatus | null) => void
  refreshStats: () => Promise<void>
}

const api = (): Window['tora'] => window.tora

// Monotonic ticket for list loads: events, typing, and panel summons can put
// several queryItems calls in flight at once, and IPC does not guarantee the
// first-issued resolves first - only the newest ticket may write the list,
// otherwise a slow stale response overwrites a fresher one.
let reloadSeq = 0

// Search keystrokes debounce their reload (the input itself updates instantly);
// every keystroke would otherwise fire a full IPC query round-trip.
let searchDebounce: ReturnType<typeof setTimeout> | null = null
const SEARCH_DEBOUNCE_MS = 150

export const useStore = create<StoreState>((set, get) => ({
  query: '',
  filter: 'all',
  boardId: null,
  pinnedOnly: false,
  items: [],
  total: 0,
  loading: false,
  boards: [],
  settings: null,
  stats: null,
  syncStatus: null,
  selectedId: null,
  expandedId: null,
  editingId: null,
  queue: [],
  ready: false,
  locked: false,
  settingsOpen: false,
  updateStatus: null,
  openMenuId: null,
  openNonce: 0,
  notice: null,

  setNotice: (notice) => set({ notice }),
  setLocked: (locked) => set({ locked }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setUpdateStatus: (updateStatus) => set({ updateStatus }),
  setOpenMenuId: (openMenuId) => set({ openMenuId }),

  init: async () => {
    const [settings, boards, stats, syncStatus, updateStatus] = await Promise.all([
      api().getSettings(),
      api().listBoards(),
      api().getStorageStats(),
      api().getSyncStatus(),
      api().getUpdateStatus(),
    ])
    set({
      settings,
      boards,
      stats,
      syncStatus,
      updateStatus,
      ready: true,
      locked: settings.appLockEnabled,
    })
    await get().reload()
  },

  reload: async (opts) => {
    const seq = ++reloadSeq
    const { query, filter, boardId, pinnedOnly } = get()
    set({ loading: true })
    const res = await api().queryItems({
      query,
      filter,
      boardId,
      pinnedOnly,
      limit: PAGE_SIZE,
      offset: 0,
    })
    if (seq !== reloadSeq) return // superseded while in flight; drop stale rows
    set((s) => {
      // The newest item (max updatedAt) is what the system clipboard holds, so
      // it is what Enter / Cmd+V should paste when the panel is summoned.
      const latest = res.items.reduce<ClipItem | null>(
        (best, it) => (best && best.updatedAt >= it.updatedAt ? best : it),
        null,
      )
      const selectedId = opts?.selectLatest
        ? (latest?.id ?? null)
        : res.items.some((i) => i.id === s.selectedId)
          ? s.selectedId
          : (res.items[0]?.id ?? null)
      return {
        items: res.items,
        total: res.total,
        loading: false,
        selectedId,
        // Bump openNonce in the SAME update as items/selectedId so the deck's
        // scroll-reset effect always sees the fresh selection (atomic, no race
        // with a fast second summon mid-reload).
        ...(opts?.selectLatest ? { openNonce: s.openNonce + 1 } : {}),
      }
    })
  },

  onPanelShown: async () => {
    // Every summon starts fresh: clear the previous query (a stale filter
    // surprises - "where are my items?" - and type-to-search makes re-typing a
    // query instant), then refresh + select the current-clipboard item; reload
    // bumps openNonce so the deck scrolls back to the front. Window mode is
    // untouched: panel-shown only fires for the panel.
    if (get().query) set({ query: '' })
    await get().reload({ selectLatest: true })
  },

  loadMore: async () => {
    const { items, total, query, filter, boardId, pinnedOnly, loading } = get()
    if (loading || items.length >= total) return
    // Take the ticket only after the guards: bumping earlier would invalidate
    // an in-flight reload and strand its loading flag.
    const seq = ++reloadSeq
    set({ loading: true })
    const res = await api().queryItems({
      query,
      filter,
      boardId,
      pinnedOnly,
      limit: PAGE_SIZE,
      offset: items.length,
    })
    if (seq !== reloadSeq) return // a reload reset the list while this page loaded
    set((s) => ({ items: [...s.items, ...res.items], total: res.total, loading: false }))
  },

  setView: (patch) => {
    set(patch)
    if (searchDebounce) clearTimeout(searchDebounce)
    searchDebounce = null
    const typingOnly = 'query' in patch && Object.keys(patch).length === 1
    if (typingOnly) {
      searchDebounce = setTimeout(() => {
        searchDebounce = null
        void get().reload()
      }, SEARCH_DEBOUNCE_MS)
    } else {
      void get().reload()
    }
  },

  select: (id) => set({ selectedId: id }),
  expand: (id) => set({ expandedId: id }),
  edit: (id) => set({ editingId: id }),

  toggleQueue: (id) =>
    set((s) => ({
      queue: s.queue.includes(id) ? s.queue.filter((q) => q !== id) : [...s.queue, id],
    })),
  clearQueue: () => set({ queue: [] }),

  // A new/updated item arrived: if it fits the current view, refresh from top.
  applyEvent: () => {
    void get().reload()
    void get().refreshStats()
  },

  setBoards: (boards) => {
    // If the currently-viewed board was deleted (or wiped), fall back to the
    // full library so the deck does not show an empty, dangling board view.
    const { boardId } = get()
    if (boardId && !boards.some((b) => b.id === boardId)) {
      set({ boards, boardId: null })
      void get().reload()
    } else {
      set({ boards })
    }
  },
  setSettings: (settings) => set({ settings }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),

  refreshStats: async () => {
    const [stats, syncStatus] = await Promise.all([api().getStorageStats(), api().getSyncStatus()])
    set({ stats, syncStatus })
  },
}))
