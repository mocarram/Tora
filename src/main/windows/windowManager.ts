import { app, BrowserWindow, screen, shell } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC, type AppSettings, type ToraEvent } from '@shared/ipc'

const dir = dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

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

  /** Allow the window to actually close (called when the app is quitting). */
  markQuitting(): void {
    this.quitting = true
  }

  create(initialMode: AppSettings['windowMode']): BrowserWindow {
    this.mode = initialMode
    const win = new BrowserWindow({
      width: 960,
      height: 420,
      show: false,
      frame: false,
      transparent: true,
      resizable: true,
      fullscreenable: false,
      skipTaskbar: true,
      titleBarStyle: 'hiddenInset',
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
      void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e) => e.preventDefault())

    // In panel mode, hide when focus is lost (click-away dismiss).
    win.on('blur', () => {
      if (this.mode === 'panel' && !isDev) this.hide()
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
    return win
  }

  private positionPanel(): void {
    if (!this.win) return
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { x, y, width, height } = display.workArea
    const panelHeight = Math.min(440, Math.round(height * 0.5))
    const margin = 12
    this.win.setBounds({
      x: x + margin,
      y: y + height - panelHeight - margin,
      width: width - margin * 2,
      height: panelHeight,
    })
  }

  private positionWindow(): void {
    if (!this.win) return
    this.win.setBounds({ width: 1040, height: 680 })
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
    if (mode === 'panel') this.positionPanel()
    else this.positionWindow()
    this.emit(mode === 'panel' ? { kind: 'panel-shown' } : { kind: 'panel-hidden' })
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
    this.emit({ kind: 'panel-shown' })
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
