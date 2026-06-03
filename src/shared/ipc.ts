/**
 * IPC contract shared between main and renderer.
 *
 * The renderer never touches disk, clipboard, or Node APIs directly. Every
 * capability is a typed request/response over a single contextBridge surface
 * (`window.tora`). Events flow main -> renderer through `onEvent`.
 */

import type { Board, ClipItem, ClipItemType, QuickFilter, RetentionDays } from '@core/model'

export type ThemePreference = 'system' | 'light' | 'dark'
export type PasteFormat = 'keep' | 'plain'

export interface AppSettings {
  theme: ThemePreference
  globalHotkey: string
  launchAtLogin: boolean
  retentionDays: RetentionDays
  /** Soft cap that drives the storage indicator (bytes). 0 = no cap. */
  storageSoftCapBytes: number
  pasteFormatDefault: PasteFormat
  soundFeedback: boolean
  visualFeedback: boolean
  /** Fetch link titles/favicons locally. Off by default for privacy. */
  fetchLinkPreviews: boolean
  /** Bundle ids excluded from capture (password managers etc). */
  excludedBundleIds: string[]
  appLockEnabled: boolean
  onboardingComplete: boolean
  captureEnabled: boolean
  syncProvider: 'local' | 'icloud' | 'cloudkit'
  reduceMotion: boolean
  windowMode: 'panel' | 'window'
}

export interface StorageStats {
  itemCount: number
  totalBytes: number
  blobBytes: number
  oldestItemAt: number | null
  softCapBytes: number
}

export interface QueryItemsRequest {
  /** Free-text fuzzy query. Empty string returns recents. */
  query: string
  filter: QuickFilter
  /** Restrict to a board id; null = all items. */
  boardId: string | null
  limit: number
  offset: number
  /** Include pinned-only when true. */
  pinnedOnly: boolean
}

export interface QueryItemsResponse {
  items: ClipItem[]
  total: number
}

export interface FullContent {
  type: ClipItemType
  text?: string
  html?: string
  rtf?: string
  /** Data URL for images, served from disk on demand. */
  imageDataUrl?: string
  filePaths?: string[]
}

export interface PasteRequest {
  itemId: string
  format: PasteFormat
}

export interface QueuePasteRequest {
  itemIds: string[]
  format: PasteFormat
  /** Delay between sequential pastes, ms. */
  delayMs: number
}

export interface EditItemRequest {
  itemId: string
  text: string
}

export interface CreateBoardRequest {
  name: string
}

export interface ReorderRequest {
  /** Ordered list of ids defining the new sort order. */
  orderedIds: string[]
}

export interface AddToBoardRequest {
  boardId: string
  itemId: string
}

export interface PermissionStatus {
  accessibility: boolean
  /** Whether app-lock biometric (Touch ID) is available on this device. */
  biometricsAvailable: boolean
}

export type SyncState = 'idle' | 'syncing' | 'error' | 'disabled'

export interface SyncStatus {
  provider: AppSettings['syncProvider']
  state: SyncState
  lastSyncedAt: number | null
  lastError: string | null
  pendingChanges: number
}

/** Events pushed from main to renderer. */
export type ToraEvent =
  | { kind: 'item-added'; item: ClipItem }
  | { kind: 'item-updated'; item: ClipItem }
  | { kind: 'item-removed'; id: string }
  | { kind: 'items-cleared' }
  | { kind: 'boards-changed' }
  | { kind: 'settings-changed'; settings: AppSettings }
  | { kind: 'capture-state'; enabled: boolean }
  | { kind: 'sync-status'; status: SyncStatus }
  | { kind: 'panel-shown' }
  | { kind: 'panel-hidden' }
  | { kind: 'open-settings' }
  | { kind: 'locked' }
  | { kind: 'unlocked' }
  | { kind: 'update-status'; status: UpdateStatus }

/** In-app update lifecycle, surfaced to the renderer for the update banner. */
export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateStatus {
  state: UpdateState
  /** The version being offered/downloaded, when known. */
  version: string | null
  /** Download progress 0-100 while downloading. */
  percent: number | null
  /** Human-readable message when state is "error". */
  error: string | null
}

/**
 * The full bridge API. Implemented in main (handlers) and surfaced to the
 * renderer via preload's contextBridge as `window.tora`.
 */
export interface ToraApi {
  // Items
  queryItems(req: QueryItemsRequest): Promise<QueryItemsResponse>
  getFullContent(itemId: string): Promise<FullContent | null>
  copyItem(itemId: string): Promise<void>
  pasteItem(req: PasteRequest): Promise<void>
  queuePaste(req: QueuePasteRequest): Promise<void>
  pinItem(itemId: string, pinned: boolean): Promise<void>
  deleteItem(itemId: string): Promise<void>
  editItem(req: EditItemRequest): Promise<ClipItem | null>
  clearAll(): Promise<void>

  // Boards
  listBoards(): Promise<Board[]>
  createBoard(req: CreateBoardRequest): Promise<Board>
  renameBoard(id: string, name: string): Promise<void>
  deleteBoard(id: string): Promise<void>
  reorderBoards(req: ReorderRequest): Promise<void>
  addItemToBoard(req: AddToBoardRequest): Promise<void>
  removeItemFromBoard(req: AddToBoardRequest): Promise<void>
  reorderBoardItems(boardId: string, req: ReorderRequest): Promise<void>

  // Settings + stats
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getStorageStats(): Promise<StorageStats>

  // Capture
  setCaptureEnabled(enabled: boolean): Promise<void>

  // Permissions + lock
  getPermissions(): Promise<PermissionStatus>
  requestAccessibility(): Promise<void>
  unlock(): Promise<boolean>

  // Sync
  getSyncStatus(): Promise<SyncStatus>
  triggerSync(): Promise<void>

  // Window
  hidePanel(): Promise<void>
  setWindowMode(mode: AppSettings['windowMode']): Promise<void>
  /** Suppress panel auto-hide on blur while a modal/overlay is open. */
  setHideSuppressed(suppressed: boolean): Promise<void>

  // Updates
  getUpdateStatus(): Promise<UpdateStatus>
  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>

  /** The running app version (from package.json), for the About section. */
  getAppVersion(): Promise<string>

  // Events
  onEvent(listener: (event: ToraEvent) => void): () => void
}

/** Channel names. Centralised so main and preload cannot drift. */
export const IPC = {
  invoke: 'tora:invoke',
  event: 'tora:event',
} as const

/** Method names callable over the single invoke channel. */
export type ToraMethod = keyof Omit<ToraApi, 'onEvent'>
