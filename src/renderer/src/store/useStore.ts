import { create } from 'zustand'
import type { Board, ClipItem, QuickFilter } from '@core/model'
import type { AppSettings, StorageStats, SyncStatus } from '@shared/ipc'

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

  setLocked: (locked: boolean) => void
  init: () => Promise<void>
  reload: () => Promise<void>
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
  refreshStats: () => Promise<void>
}

const api = (): Window['tora'] => window.tora

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

  setLocked: (locked) => set({ locked }),

  init: async () => {
    const [settings, boards, stats, syncStatus] = await Promise.all([
      api().getSettings(),
      api().listBoards(),
      api().getStorageStats(),
      api().getSyncStatus(),
    ])
    set({ settings, boards, stats, syncStatus, ready: true, locked: settings.appLockEnabled })
    await get().reload()
  },

  reload: async () => {
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
    set((s) => ({
      items: res.items,
      total: res.total,
      loading: false,
      selectedId: res.items.some((i) => i.id === s.selectedId)
        ? s.selectedId
        : (res.items[0]?.id ?? null),
    }))
  },

  loadMore: async () => {
    const { items, total, query, filter, boardId, pinnedOnly, loading } = get()
    if (loading || items.length >= total) return
    set({ loading: true })
    const res = await api().queryItems({
      query,
      filter,
      boardId,
      pinnedOnly,
      limit: PAGE_SIZE,
      offset: items.length,
    })
    set((s) => ({ items: [...s.items, ...res.items], total: res.total, loading: false }))
  },

  setView: (patch) => {
    set(patch)
    void get().reload()
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

  setBoards: (boards) => set({ boards }),
  setSettings: (settings) => set({ settings }),

  refreshStats: async () => {
    const [stats, syncStatus] = await Promise.all([api().getStorageStats(), api().getSyncStatus()])
    set({ stats, syncStatus })
  },
}))
