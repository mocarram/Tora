import { app, globalShortcut, ipcMain, nativeImage, nativeTheme, protocol, session } from 'electron'
import { readFile } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ClipItem, FileMetadata } from '@core/model'
import { FAVOURITES_BOARD_ID } from '@core/model'
import { isPreviewableImage } from '@core/fileType'
import {
  IPC,
  type AccentTheme,
  type AddToBoardRequest,
  type AppSettings,
  type ClearDataRequest,
  type CreateBoardRequest,
  type EditItemRequest,
  type FullContent,
  type PasteRequest,
  type QueryItemsRequest,
  type QueryItemsResponse,
  type QueuePasteRequest,
  type ReorderRequest,
  type StorageStats,
  type ToraEvent,
  type ToraMethod,
} from '@shared/ipc'
import { toPreviewLine, countWords } from '@core/format'
import { hashString } from '@core/hash'
import { classifyCapture, type CaptureInput } from '@core/capture'
import { resolvePaths } from '../paths'
import { Storage } from '../storage'
import { secureDir } from '../storage/dataSecurity'
import { DEFAULT_SETTINGS } from '../storage/settingsRepo'
import { matchesQuickFilter } from '../storage/itemsRepo'
import { CapturePipeline } from '../capture/capturePipeline'
import { ClipboardWatcher } from '../capture/clipboardWatcher'
import { getFrontmostApp } from '../capture/sourceApp'
import { getAppIconDataUrl } from '../capture/appIcon'
import { SearchIndex } from '../services/searchIndex'
import { ClipboardWriter } from '../services/clipboardWriter'
import { ElectronPasteboard } from '../services/pasteboard'
import { RetentionService } from '../services/retention'
import { Updater } from '../services/updater'
import { fetchLinkPreview } from '../services/linkPreview'
import { pasteIntoFrontApp } from '../services/pasteInjector'
import { getPermissions, requestAccessibility, biometricUnlock } from '../services/permissions'
import { createSyncProvider, type SyncController, type SyncDeps } from '../sync'
import { loadOrCreateSyncKey } from '../sync/keyStore'
import { resolveSharedSyncDir, loadOrCreateDeviceId } from '../sync/environment'
import { WindowManager } from '../windows/windowManager'
import { TrayController } from '../windows/tray'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Top-level orchestrator. Owns storage, capture, windows, the tray, the global
 * hotkey, and sync, and exposes the typed ToraApi over a single IPC channel.
 */
export class Application {
  private readonly storage: Storage
  private readonly pipeline: CapturePipeline
  private readonly search: SearchIndex
  private readonly writer: ClipboardWriter
  private readonly retention: RetentionService
  private readonly watcher: ClipboardWatcher
  private readonly windows = new WindowManager()
  private readonly tray: TrayController
  private sync!: SyncController
  private syncDeps!: SyncDeps
  private readonly updater = new Updater((status) => this.emit({ kind: 'update-status', status }))
  private readonly paths = resolvePaths()
  private settings: AppSettings

  constructor() {
    const paths = this.paths
    this.storage = new Storage({ dbFile: paths.dbFile, blobDir: paths.blobDir })
    this.pipeline = new CapturePipeline(this.storage)
    this.search = new SearchIndex(this.storage)
    this.writer = new ClipboardWriter(
      this.storage,
      new ElectronPasteboard(),
      join(paths.base, 'paste-cache'),
    )
    this.retention = new RetentionService(this.storage)
    this.settings = { ...this.storage.settings.get() }
    this.watcher = new ClipboardWatcher((input) => this.onCapture(input))
    this.tray = new TrayController({
      onToggleWindow: () => this.windows.toggle(),
      onToggleCapture: () => void this.setCaptureEnabled(!this.settings.captureEnabled),
      onOpenSettings: () => {
        this.windows.show()
        this.emit({ kind: 'open-settings' })
      },
      onQuit: () => app.quit(),
    })
  }

  async start(): Promise<void> {
    // Lock the whole data tree to the owner before anything is written into it,
    // so the clipboard db, blobs, and sync key are never world-readable.
    await secureDir(this.paths.base)
    await this.storage.init()
    // Re-read settings post-init (defaults written) and apply.
    this.settings = this.storage.settings.get()

    // Resolve sync dependencies (key from the OS keychain, device id, dirs).
    this.syncDeps = {
      storage: this.storage,
      getSettings: () => this.settings,
      sharedDir: resolveSharedSyncDir(this.paths.syncDir),
      localDir: this.paths.syncDir,
      key: loadOrCreateSyncKey(this.paths.syncDir),
      deviceId: loadOrCreateDeviceId(this.paths.base),
    }
    this.sync = createSyncProvider(this.settings.syncProvider, this.syncDeps)

    // Drive the OS appearance from the saved preference so the native window
    // vibrancy (and traffic lights) match the chosen theme, not just the OS one.
    nativeTheme.themeSource = this.settings.theme

    // Match the Dock icon to the chosen accent vibe.
    this.applyDockIcon(this.settings.accent)

    this.hardenSession()
    this.registerBlobProtocol()
    this.windows.create(this.settings.windowMode)
    this.tray.create()
    this.tray.setCapturing(this.settings.captureEnabled)
    this.registerIpc()
    this.registerHotkey()
    // Login item is applied only when the user toggles it (below), not on every
    // launch: an unsigned dev build cannot write it and macOS logs a benign
    // "Operation not permitted". Signed builds register it via the toggle.

    if (this.settings.captureEnabled) this.watcher.start()
    this.retention.start()
    await this.sync.start()

    // Show the window on a manual launch (but not when auto-launched at login,
    // where it should start quietly in the menu bar), and whenever the user
    // re-activates the app (clicking the Dock icon).
    app.on('activate', () => this.windows.show())
    const openedAtLogin =
      process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin
    if (!openedAtLogin) this.windows.show()

    // Retroactively thumbnail image files captured before the feature existed.
    void this.backfillFileThumbnails()

    // Begin checking for updates (no-op in dev / unsigned builds).
    this.updater.start()
  }

  /** Bring the window to the front (used by the dock icon / second instance). */
  reveal(): void {
    this.windows.show()
  }

  dispose(): void {
    this.windows.markQuitting()
    this.updater.stop()
    globalShortcut.unregisterAll()
    this.watcher.stop()
    this.retention.stop()
    this.tray.destroy()
    this.sync.stop()
    this.storage.close()
  }

  // ---- Capture flow ------------------------------------------------------

  private async onCapture(input: CaptureInput): Promise<void> {
    if (!input.concealed && (input.sourceApp == null || input.sourceBundleId == null)) {
      const front = await getFrontmostApp()
      input = {
        ...input,
        sourceApp: input.sourceApp ?? front.name,
        sourceBundleId: input.sourceBundleId ?? front.bundleId,
      }
    }
    const result = await this.pipeline.ingest(input)
    if (result.kind === 'added' && result.item) {
      // Persist the image blob for image items (watcher holds the buffers) and
      // record the thumbnail ref so the deck can render it via tora-blob://.
      if (result.item.type === 'image' && result.item.metadata.kind === 'image') {
        const blobs = ClipboardWatcher.imageBlobs()
        if (blobs) {
          await this.pipeline.attachImage(result.item.id, blobs)
          this.storage.items.setMetadata(result.item.id, {
            ...result.item.metadata,
            thumbnailRef: `${result.item.id}/thumb.png`,
          })
          result.item = this.storage.items.getById(result.item.id) ?? result.item
        }
      }

      // Generate a thumbnail for image FILES so file cards show a preview.
      if (result.item.type === 'file' && result.item.metadata.kind === 'file') {
        const updated = await this.attachFileThumbnail(result.item.id, result.item.metadata)
        if (updated) result.item = updated
      }

      this.search.markStale()
      this.emit({ kind: 'item-added', item: result.item })
      this.sync.notifyLocalChange()

      // Enrich link cards with a title + favicon out of band (opt-in), so
      // capture stays instant and a network hiccup never blocks it.
      if (result.item.type === 'url' && this.settings.fetchLinkPreviews) {
        void this.enrichLinkPreview(result.item.id)
      }
    } else if (result.kind === 'deduped' && result.item) {
      this.emit({ kind: 'item-updated', item: result.item })
    }
  }

  /**
   * If a captured file is an image, render a thumbnail from it so the file card
   * shows a preview. Non-image files (zip, pdf, etc.) are left as name + size.
   * Returns the updated item, or null when no thumbnail was produced.
   */
  private async attachFileThumbnail(id: string, meta: FileMetadata): Promise<ClipItem | null> {
    const index = meta.paths.findIndex((p) => isPreviewableImage(p))
    if (index < 0) return null

    // Prefer the cached bytes (already read at capture) over re-reading the
    // original, which is more reliable and survives the source being moved.
    let image = nativeImage.createEmpty()
    if (this.storage.blobs.has(id, `f${index}`)) {
      const buf = await this.storage.blobs.readBuffer(id, `f${index}`)
      if (buf) image = nativeImage.createFromBuffer(buf)
    }
    if (image.isEmpty()) {
      const p = meta.paths[index]
      if (p) image = nativeImage.createFromPath(p)
    }
    if (image.isEmpty()) return null

    if (image.getSize().width > 1024) image = image.resize({ width: 1024, quality: 'best' })
    await this.storage.blobs.writeBuffer(id, 'thumb.png', image.toPNG())
    this.storage.items.setContentRef(id, id) // ensure blob cleanup on delete
    this.storage.items.setMetadata(id, { ...meta, thumbnailRef: `${id}/thumb.png` })
    return this.storage.items.getById(id)
  }

  /**
   * Fetch a link's title + favicon and fold them into the url item's metadata,
   * storing the favicon as a blob (served via tora-blob://). Best-effort: does
   * nothing if the fetch yields neither. Emits item-updated so the card lights up.
   */
  private async enrichLinkPreview(id: string): Promise<void> {
    const item = this.storage.items.getById(id)
    if (!item || item.metadata.kind !== 'url') return
    const preview = await fetchLinkPreview(item.metadata.url)
    if (!preview.title && !preview.faviconPng) return

    const nextMeta = { ...item.metadata }
    if (preview.title) nextMeta.title = preview.title
    if (preview.faviconPng) {
      await this.storage.blobs.writeBuffer(id, 'favicon.png', preview.faviconPng)
      nextMeta.faviconRef = `${id}/favicon.png`
      this.storage.items.setContentRef(id, id) // so the blob is cleaned on delete
    }
    this.storage.items.setMetadata(id, nextMeta)
    const updated = this.storage.items.getById(id)
    if (updated) {
      this.search.markStale()
      this.emit({ kind: 'item-updated', item: updated })
    }
  }

  /**
   * When the user turns link previews on, backfill the most recent link items
   * that have no preview yet. Bounded and sequential so it never floods the
   * network. New links are handled at capture time.
   */
  private async backfillLinkPreviews(): Promise<void> {
    const links = this.storage.items.query({
      filter: 'links',
      boardId: null,
      pinnedOnly: false,
      limit: 50,
      offset: 0,
    }).items
    for (const item of links) {
      if (item.metadata.kind === 'url' && !item.metadata.title && !item.metadata.faviconRef) {
        await this.enrichLinkPreview(item.id)
      }
    }
  }

  /**
   * Generate thumbnails for existing image-file items that predate the feature
   * (or were captured before a thumbnail could be made), so they light up too.
   * Runs once on startup; updates flow to the renderer as item-updated events.
   */
  private async backfillFileThumbnails(): Promise<void> {
    const files = this.storage.items.query({
      filter: 'files',
      boardId: null,
      pinnedOnly: false,
      limit: 100_000,
      offset: 0,
    }).items
    let changed = false
    for (const item of files) {
      if (item.metadata.kind !== 'file') continue
      if (item.metadata.thumbnailRef) continue
      if (!item.metadata.paths.some((p) => isPreviewableImage(p))) continue
      const updated = await this.attachFileThumbnail(item.id, item.metadata)
      if (updated) {
        changed = true
        this.emit({ kind: 'item-updated', item: updated })
      }
    }
    if (changed) this.search.markStale()
  }

  // ---- Events ------------------------------------------------------------

  private emit(event: ToraEvent): void {
    this.windows.emit(event)
  }

  /** Serve blob files (thumbnails/images) to the renderer by path, sandboxed
   *  to the blob directory so a crafted URL cannot escape it. */
  /**
   * Tighten the default session. Tora renders only its own local content and
   * never needs web permissions (camera, mic, geolocation, notifications, etc.),
   * so deny every permission request and check outright. Defence in depth on top
   * of the locked-down navigation and CSP.
   */
  private hardenSession(): void {
    const ses = session.defaultSession
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    ses.setPermissionCheckHandler(() => false)
  }

  private registerBlobProtocol(): void {
    const root = this.paths.blobDir
    protocol.handle('tora-blob', async (request) => {
      const { pathname } = new URL(request.url)
      const rel = normalize(decodeURIComponent(pathname)).replace(/^([/.]+)/, '')
      const file = join(root, rel)
      // Containment check with a separator boundary so a sibling directory that
      // merely shares the prefix (e.g. "<root>-evil") cannot be served.
      if (file !== root && !file.startsWith(root + sep)) {
        return new Response('Forbidden', { status: 403 })
      }
      try {
        const data = await readFile(file)
        return new Response(new Uint8Array(data), {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' },
        })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    })
  }

  // ---- Settings ----------------------------------------------------------

  private async applySettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const prev = this.settings
    this.settings = this.storage.settings.update(patch)

    if (patch.globalHotkey && patch.globalHotkey !== prev.globalHotkey) this.registerHotkey()
    if (patch.launchAtLogin !== undefined) this.applyLoginItem()
    if (patch.captureEnabled !== undefined && patch.captureEnabled !== prev.captureEnabled) {
      this.watcher.setEnabled(patch.captureEnabled)
      this.tray.setCapturing(patch.captureEnabled)
      this.emit({ kind: 'capture-state', enabled: patch.captureEnabled })
    }
    if (patch.windowMode && patch.windowMode !== prev.windowMode) {
      this.windows.setMode(patch.windowMode)
    }
    if (patch.theme && patch.theme !== prev.theme) {
      // Keep the native vibrancy material in step with the renderer theme.
      nativeTheme.themeSource = patch.theme
    }
    if (patch.accent && patch.accent !== prev.accent) {
      this.applyDockIcon(patch.accent)
    }
    if (patch.fetchLinkPreviews && !prev.fetchLinkPreviews) {
      void this.backfillLinkPreviews()
    }
    if (patch.syncProvider && patch.syncProvider !== prev.syncProvider) {
      this.sync.stop()
      this.sync = createSyncProvider(patch.syncProvider, this.syncDeps)
      await this.sync.start()
      this.emit({ kind: 'sync-status', status: this.sync.status() })
    }

    this.emit({ kind: 'settings-changed', settings: this.settings })
    return this.settings
  }

  /**
   * Recolour the macOS Dock icon to match the chosen accent vibe. The bundle
   * icon (.icns) is fixed at build time; this swaps the live Dock icon at
   * runtime (the variants ship as resources). No-op off macOS or if the asset
   * is missing. Not runtime-verified on the Linux build host; see GAPS.md.
   */
  private applyDockIcon(accent: AccentTheme): void {
    if (process.platform !== 'darwin' || !app.dock) return
    const file = app.isPackaged
      ? join(process.resourcesPath, 'icons', `${accent}.png`)
      : join(dirname(fileURLToPath(import.meta.url)), '../../build/accent-icons', `${accent}.png`)
    const image = nativeImage.createFromPath(file)
    if (!image.isEmpty()) app.dock.setIcon(image)
  }

  private async setCaptureEnabled(enabled: boolean): Promise<void> {
    await this.applySettings({ captureEnabled: enabled })
  }

  private registerHotkey(): void {
    globalShortcut.unregisterAll()
    try {
      globalShortcut.register(this.settings.globalHotkey, () => this.windows.toggle())
    } catch {
      // Invalid accelerator; leave unregistered until the user fixes it.
    }
  }

  private applyLoginItem(): void {
    if (process.platform === 'linux') return
    try {
      app.setLoginItemSettings({ openAtLogin: this.settings.launchAtLogin })
    } catch {
      // Unsigned dev builds cannot register a login item; ignore.
    }
  }

  // ---- IPC ---------------------------------------------------------------

  private registerIpc(): void {
    const handlers = this.buildHandlers()
    ipcMain.handle(IPC.invoke, (_e, method: ToraMethod, args: unknown[]) => {
      const fn = handlers[method] as ((...a: unknown[]) => unknown) | undefined
      if (!fn) throw new Error(`Unknown IPC method: ${method}`)
      return fn(...args)
    })
  }

  private async getFullContent(itemId: string): Promise<FullContent | null> {
    const item = this.storage.items.getById(itemId)
    if (!item) return null
    const ref = item.contentRef
    if (item.type === 'image' && ref) {
      const buf = await this.storage.blobs.readBuffer(ref, 'image.png')
      return {
        type: 'image',
        ...(buf ? { imageDataUrl: `data:image/png;base64,${buf.toString('base64')}` } : {}),
      }
    }
    if (item.type === 'file' && item.metadata.kind === 'file') {
      // Image files: include the thumbnail so the large preview shows the image.
      const thumb = ref ? await this.storage.blobs.readBuffer(ref, 'thumb.png') : null
      return {
        type: 'file',
        filePaths: item.metadata.paths,
        ...(thumb ? { imageDataUrl: `data:image/png;base64,${thumb.toString('base64')}` } : {}),
      }
    }
    const text = ref ? await this.storage.blobs.readText(ref, 'text.txt') : null
    const html = ref ? await this.storage.blobs.readText(ref, 'content.html') : null
    const rtf = ref ? await this.storage.blobs.readText(ref, 'content.rtf') : null
    return {
      type: item.type,
      text: text ?? item.previewText,
      ...(html ? { html } : {}),
      ...(rtf ? { rtf } : {}),
    }
  }

  private queryItems(req: QueryItemsRequest): QueryItemsResponse {
    if (req.query.trim().length === 0) {
      return this.storage.items.query({
        filter: req.filter,
        boardId: req.boardId,
        pinnedOnly: req.pinnedOnly,
        limit: req.limit,
        offset: req.offset,
      })
    }
    const rankedIds = this.search.search(req.query)
    const boardSet = req.boardId ? this.storage.boards.itemIdsInBoard(req.boardId) : null
    const matched = this.storage.items
      .getMany(rankedIds)
      .filter((it) => matchesQuickFilter(it.type, req.filter))
      .filter((it) => (req.pinnedOnly ? it.isPinned : true))
      .filter((it) => (boardSet ? boardSet.has(it.id) : true))
    const page = matched.slice(req.offset, req.offset + req.limit)
    return { items: page, total: matched.length }
  }

  private async copyItem(itemId: string): Promise<void> {
    const item = this.storage.items.getById(itemId)
    if (!item) return
    const text = await this.writer.write(item, this.settings.pasteFormatDefault)
    this.watcher.markSelfCopy(text)
    const updated = this.storage.items.touch(itemId)
    // The copied item is now what is on the clipboard, so it becomes the most
    // recent and jumps to the front of the list (after any pinned items, per the
    // query ordering). Emit so an open panel reorders immediately instead of
    // only reflecting it on the next reopen. The renderer keeps the viewport and
    // selection where they are.
    if (updated) this.emit({ kind: 'item-updated', item: updated })
  }

  /**
   * Dismiss Tora so the previously active app regains focus. On macOS hiding the
   * window is not enough (the app stays active and Cmd+V would go nowhere), so
   * we hide the whole app, which returns focus to the prior app.
   */
  private dismissForPaste(): void {
    if (process.platform === 'darwin') app.hide()
    else this.windows.hide()
  }

  /**
   * True when we can synthesise the paste keystroke. If Accessibility is not
   * granted yet, the content is already on the clipboard and we open the prompt
   * so the next paste works (the user can also paste manually with Cmd+V).
   */
  private canInjectPaste(): boolean {
    if (process.platform !== 'darwin') return true
    if (getPermissions().accessibility) return true
    void requestAccessibility()
    return false
  }

  private async pasteItem(req: PasteRequest): Promise<void> {
    const item = this.storage.items.getById(req.itemId)
    if (!item) return
    const text = await this.writer.write(item, req.format)
    this.watcher.markSelfCopy(text)
    this.storage.items.touch(req.itemId)
    if (!this.canInjectPaste()) return
    this.dismissForPaste()
    await delay(150)
    try {
      await pasteIntoFrontApp()
    } catch {
      // Content is on the clipboard; a manual Cmd+V still works.
    }
  }

  private async queuePaste(req: QueuePasteRequest): Promise<void> {
    if (!this.canInjectPaste()) return
    this.dismissForPaste()
    await delay(150)
    for (const id of req.itemIds) {
      const item = this.storage.items.getById(id)
      if (!item) continue
      const text = await this.writer.write(item, req.format)
      this.watcher.markSelfCopy(text)
      try {
        await pasteIntoFrontApp()
      } catch {
        // Skip a failed paste; keep the queue going.
      }
      await delay(Math.max(40, req.delayMs))
    }
  }

  private editItem(req: EditItemRequest): ClipItem | null {
    const item = this.storage.items.getById(req.itemId)
    if (!item) return null
    // Re-classify the edited text so a URL stays a URL, code stays code, etc.
    const classified = classifyCapture({ text: req.text })
    const fallback = {
      kind: 'text' as const,
      charCount: req.text.length,
      wordCount: countWords(req.text),
    }
    const updated = this.storage.items.updateText(req.itemId, {
      type: classified?.type ?? 'text',
      previewText: classified?.previewText ?? toPreviewLine(req.text),
      contentHash: classified?.contentHash ?? hashString(req.text),
      byteSize: Buffer.byteLength(req.text, 'utf8'),
      metadata: classified?.metadata ?? fallback,
    })
    if (updated?.contentRef) {
      void this.storage.blobs.writeText(updated.contentRef, 'text.txt', req.text)
    }
    this.search.markStale()
    if (updated) this.emit({ kind: 'item-updated', item: updated })
    this.sync.notifyLocalChange()
    return updated
  }

  private storageStats(): StorageStats {
    const stats = this.storage.items.stats()
    return {
      itemCount: stats.itemCount,
      totalBytes: stats.totalBytes,
      blobBytes: 0,
      oldestItemAt: stats.oldestItemAt,
      softCapBytes: this.settings.storageSoftCapBytes,
    }
  }

  private buildHandlers(): Record<ToraMethod, (...args: never[]) => unknown> {
    const s = this.storage
    const refreshBoards = (): void => {
      this.emit({ kind: 'boards-changed' })
      this.sync.notifyLocalChange()
    }
    const removed = (id: string): void => {
      this.search.markStale()
      this.emit({ kind: 'item-removed', id })
      this.sync.notifyLocalChange()
    }

    return {
      queryItems: (req: QueryItemsRequest) => this.queryItems(req),
      getFullContent: (id: string) => this.getFullContent(id),
      copyItem: (id: string) => this.copyItem(id),
      pasteItem: (req: PasteRequest) => this.pasteItem(req),
      queuePaste: (req: QueuePasteRequest) => this.queuePaste(req),
      pinItem: (id: string, pinned: boolean) => {
        s.items.setPinned(id, pinned)
        // Pinning mirrors into the default Favourites board.
        if (pinned) s.boards.addItem(FAVOURITES_BOARD_ID, id)
        else s.boards.removeItem(FAVOURITES_BOARD_ID, id)
        const item = s.items.getById(id)
        if (item) this.emit({ kind: 'item-updated', item })
        this.sync.notifyLocalChange()
        refreshBoards()
      },
      deleteItem: (id: string) => {
        const item = s.items.getById(id)
        s.items.softDelete(id)
        if (item?.contentRef) void s.blobs.remove(item.contentRef)
        s.items.hardDelete(id)
        removed(id)
      },
      editItem: (req: EditItemRequest) => this.editItem(req),
      setItemTitle: (id: string, title: string | null) => {
        s.items.setTitle(id, title)
        const item = s.items.getById(id)
        if (item) this.emit({ kind: 'item-updated', item })
        this.search.markStale()
        this.sync.notifyLocalChange()
      },
      clearData: async (req: ClearDataRequest) => {
        await s.wipeData()
        this.search.markStale()
        this.emit({ kind: 'items-cleared' })
        this.emit({ kind: 'boards-changed' })
        this.sync.notifyLocalChange()
        if (req.resetSettings) {
          // Reset every setting to its default but keep onboarding done, so a
          // factory reset does not relaunch the first-run flow. applySettings
          // re-applies the side effects (hotkey, login item, theme, mode).
          await this.applySettings({ ...DEFAULT_SETTINGS, onboardingComplete: true })
        }
      },
      listBoards: () => s.boards.list(),
      createBoard: (req: CreateBoardRequest) => {
        const board = s.boards.create(req.name)
        refreshBoards()
        return board
      },
      renameBoard: (id: string, name: string) => {
        s.boards.rename(id, name)
        refreshBoards()
      },
      deleteBoard: (id: string) => {
        s.boards.remove(id)
        refreshBoards()
      },
      reorderBoards: (req: ReorderRequest) => {
        s.boards.reorder(req.orderedIds)
        refreshBoards()
      },
      addItemToBoard: (req: AddToBoardRequest) => {
        s.boards.addItem(req.boardId, req.itemId)
        refreshBoards()
      },
      removeItemFromBoard: (req: AddToBoardRequest) => {
        s.boards.removeItem(req.boardId, req.itemId)
        refreshBoards()
      },
      reorderBoardItems: (boardId: string, req: ReorderRequest) => {
        s.boards.reorderItems(boardId, req.orderedIds)
        refreshBoards()
      },
      getItemBoards: (id: string) => s.boards.boardsForItem(id),
      getSettings: () => this.settings,
      updateSettings: (patch: Partial<AppSettings>) => this.applySettings(patch),
      getStorageStats: () => this.storageStats(),
      setCaptureEnabled: (enabled: boolean) => this.setCaptureEnabled(enabled),
      getPermissions: () => getPermissions(),
      requestAccessibility: () => requestAccessibility(),
      relaunchApp: () => {
        app.relaunch()
        app.exit(0)
      },
      unlock: () => biometricUnlock('Unlock Tora'),
      getSyncStatus: () => this.sync.status(),
      triggerSync: () => this.sync.syncNow(),
      hidePanel: () => this.windows.hide(),
      setWindowMode: (mode: AppSettings['windowMode']) => this.applySettings({ windowMode: mode }),
      setHideSuppressed: (suppressed: boolean) => this.windows.setHideSuppressed(suppressed),
      getUpdateStatus: () => this.updater.getStatus(),
      checkForUpdates: () => this.updater.check(),
      installUpdate: () => this.updater.install(),
      getAppVersion: () => app.getVersion(),
      getAppIcon: (bundleId: string) => getAppIconDataUrl(bundleId),
    }
  }
}
