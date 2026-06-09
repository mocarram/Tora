import { app, BrowserWindow, screen, shell } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC, type AppSettings, type ToraEvent } from '@shared/ipc'
import { shouldDismissOnBlur } from './dismissPolicy'

const dir = dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

// Panel geometry. The deck shows one card; the panel is sized to fit that card
// plus the surrounding chrome, and cannot shrink below that (so it can never
// collapse into a thin line). Keep in sync with the renderer: deck card = 216,
// topbar 44 + 1 border, statusbar 30 + 1 border, and the deck's vertical
// padding (--space-7 = 20) top and bottom.
const PANEL_CARD = 216
const PANEL_CHROME = 45 + 31 + 40
const PANEL_HEIGHT = PANEL_CARD + PANEL_CHROME
const PANEL_MIN_WIDTH = 480
const PANEL_MARGIN = 12
// Window-mode (grid) minimums.
const WINDOW_MIN_WIDTH = 640
const WINDOW_MIN_HEIGHT = 420
// Grid layout constants mirrored from VirtualDeck.tsx so window mode opens at a
// width that fits a whole number of columns - the content fills edge to edge
// instead of leaving a ragged gap on the right. Keep in sync with the renderer.
const SIDEBAR_W = 212 // .rail width in Sidebar.module.css
const GRID_PAD = 28 // GRID_PAD
const GRID_GAP = 16 // GAP
const GRID_COL_W = 280 // comfortable column width (>= GRID_MIN_COL of 250)
const GRID_MIN_COLS = 3
const GRID_MAX_COLS = 6

/**
 * Owns the single morphing BrowserWindow. "panel" mode is a frameless,
 * vibrancy-backed strip pinned to the bottom of the active display and summoned
 * by the hotkey; "window" mode is a centred, resizable full window. Secure web
 * preferences are enforced here.
 */
export class WindowManager {
  private win: BrowserWindow | null = null
  private mode: AppSettings['windowMode'] = 'panel'
  private quitting = false
  /** When true, panel auto-hide on blur is suppressed (a modal/overlay is open). */
  private hideSuppressed = false

  /** Allow the window to actually close (called when the app is quitting). */
  markQuitting(): void {
    this.quitting = true
  }

  setHideSuppressed(suppressed: boolean): void {
    this.hideSuppressed = suppressed
  }

  create(initialMode: AppSettings['windowMode']): BrowserWindow {
    this.mode = initialMode
    const win = new BrowserWindow({
      width: 960,
      height: 420,
      show: false,
      frame: false,
      resizable: true,
      fullscreenable: false,
      skipTaskbar: true,
      titleBarStyle: 'hiddenInset',
      // macOS frosted glass: transparent window + vibrancy material. (Without
      // transparent:true the alpha in backgroundColor is ignored and the window
      // paints opaque black, hiding the vibrancy.)
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(dir, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
      },
    })

    win.webContents.setWindowOpenHandler(({ url }) => {
      // Only ever hand http(s) URLs to the OS. Clipboard content is untrusted,
      // and shell.openExternal will happily launch file://, smb://, ssh:// and
      // custom-scheme handlers, so anything else is denied outright.
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        return { action: 'deny' }
      }
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        void shell.openExternal(url)
      }
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e) => e.preventDefault())

    // Panel mode is a modal popover: clicking outside (losing focus) dismisses
    // it. Window mode stays open like a normal app window. Guards prevent
    // glitchy hides: an open overlay (hideSuppressed), DevTools focus, or an
    // already-hidden window must not trigger a dismiss.
    win.on('blur', () => {
      if (win.isDestroyed()) return
      const dismiss = shouldDismissOnBlur({
        mode: this.mode,
        hideSuppressed: this.hideSuppressed,
        visible: win.isVisible(),
        devToolsFocused: win.webContents.isDevToolsFocused(),
      })
      if (dismiss) this.hide()
    })

    // Closing the window only hides it (menu-bar app stays alive). The window is
    // destroyed only when the app is actually quitting, so we never hold a dead
    // reference and keep sending to it.
    win.on('close', (e) => {
      if (!this.quitting) {
        e.preventDefault()
        this.hide()
      }
    })

    if (isDev && process.env.ELECTRON_RENDERER_URL) {
      void win.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      void win.loadFile(join(dir, '../renderer/index.html'))
    }

    this.win = win
    this.applyWorkspaceBehavior()
    return win
  }

  /**
   * In panel mode the window is a hotkey-summoned popover, so it must appear on
   * whichever Space (desktop) is currently active rather than yanking the user
   * back to the Space it was last shown on. Marking it visible on all Spaces
   * (NSWindowCollectionBehaviorCanJoinAllSpaces) does that and also lets it
   * surface over fullscreen apps. A full window stays a normal, Space-bound
   * window. macOS-only; not runtime-verified on the Linux host (see GAPS.md).
   */
  private applyWorkspaceBehavior(): void {
    const win = this.live
    if (!win || process.platform !== 'darwin') return
    win.setVisibleOnAllWorkspaces(this.mode === 'panel', {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    })
  }

  private positionPanel(): void {
    if (!this.win) return
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { x, y, width, height } = display.workArea
    // Fit one square card plus chrome, clamped to the display on small screens.
    const panelHeight = Math.min(PANEL_HEIGHT, height - PANEL_MARGIN * 2)
    // Prevent the panel from being resized down into a thin line; the minimum is
    // the height actually shown, so the full square card always stays visible.
    this.win.setMinimumSize(PANEL_MIN_WIDTH, panelHeight)
    this.win.setBounds({
      x: x + PANEL_MARGIN,
      y: y + height - panelHeight - PANEL_MARGIN,
      width: width - PANEL_MARGIN * 2,
      height: panelHeight,
    })
  }

  private positionWindow(): void {
    if (!this.win) return
    this.win.setMinimumSize(WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT)
    // Size the window to fit a whole number of grid columns so the deck fills it
    // edge to edge. Pick the most columns that fit ~92% of the display (clamped),
    // then derive the exact width from the grid metrics - no ragged right gap.
    const { width, height } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const budget = Math.min(1600, Math.round(width * 0.92))
    const usable = budget - SIDEBAR_W - GRID_PAD * 2
    const cols = Math.max(
      GRID_MIN_COLS,
      Math.min(GRID_MAX_COLS, Math.floor((usable + GRID_GAP) / (GRID_COL_W + GRID_GAP))),
    )
    const gridW = GRID_PAD * 2 + cols * GRID_COL_W + (cols - 1) * GRID_GAP
    const w = SIDEBAR_W + gridW
    const h = Math.min(1000, Math.round(height * 0.9))
    this.win.setBounds({ width: w, height: h })
    this.win.center()
  }

  /** The window if it exists and is not destroyed, otherwise null. */
  private get live(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null
  }

  setMode(mode: AppSettings['windowMode']): void {
    this.mode = mode
    const win = this.live
    if (!win) return
    win.setAlwaysOnTop(mode === 'panel', 'floating')
    this.applyWorkspaceBehavior()
    if (mode === 'panel') this.positionPanel()
    else this.positionWindow()
    // No visibility event here: a layout change is not a show/hide, and emitting
    // panel-hidden would spuriously re-trigger the app lock.
  }

  show(): void {
    const win = this.live
    if (!win) return
    if (this.mode === 'panel') {
      this.positionPanel()
      win.setAlwaysOnTop(true, 'floating')
    }
    win.show()
    win.focus()
    // Only the panel "summon" should reset the deck to the latest clip. In window
    // mode the window persists like a normal app window, so focusing/activating it
    // must not reset the user's selection mid-task.
    if (this.mode === 'panel') this.emit({ kind: 'panel-shown' })
  }

  hide(): void {
    const win = this.live
    if (!win) return
    win.hide()
    this.emit({ kind: 'panel-hidden' })
  }

  toggle(): void {
    const win = this.live
    if (!win) return
    if (win.isVisible() && win.isFocused()) this.hide()
    else this.show()
  }

  isVisible(): boolean {
    return this.live?.isVisible() ?? false
  }

  get window(): BrowserWindow | null {
    return this.live
  }

  emit(event: ToraEvent): void {
    const win = this.live
    if (win) win.webContents.send(IPC.event, event)
  }
}
