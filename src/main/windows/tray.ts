import { app, Menu, Tray, nativeImage } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

export interface TrayCallbacks {
  onToggleWindow: () => void
  onToggleCapture: () => void
  onOpenSettings: () => void
  onQuit: () => void
}

/**
 * Menu-bar presence with pause/resume capture, summon, settings, and quit. Uses
 * the generated monochrome template image so macOS tints it for light/dark
 * menu bars. Not runtime-verified on this Linux host; see GAPS.md.
 */
export class TrayController {
  private tray: Tray | null = null
  private capturing = true

  constructor(private readonly callbacks: TrayCallbacks) {}

  create(): void {
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'trayTemplate.png')
      : join(dir, '../../build/trayTemplate.png')
    const image = nativeImage.createFromPath(iconPath)
    const hasIcon = !image.isEmpty()
    if (hasIcon) image.setTemplateImage(true)
    this.tray = new Tray(hasIcon ? image : nativeImage.createEmpty())
    // If the icon failed to load, show a text title so the menu bar entry is
    // still visible and clickable rather than an invisible gap.
    if (!hasIcon) this.tray.setTitle('Tora')
    this.tray.setToolTip('Tora')
    // Left-click summons the app; right-click opens the menu. We deliberately do
    // NOT call setContextMenu, since on macOS that makes a left-click open the
    // menu instead of the app.
    this.tray.on('click', () => this.callbacks.onToggleWindow())
    this.tray.on('right-click', () => {
      if (this.tray) this.tray.popUpContextMenu(this.buildMenu())
    })
  }

  setCapturing(capturing: boolean): void {
    this.capturing = capturing
  }

  private buildMenu(): Menu {
    return Menu.buildFromTemplate([
      { label: 'Open Tora', click: () => this.callbacks.onToggleWindow() },
      { type: 'separator' },
      {
        label: this.capturing ? 'Pause capture' : 'Resume capture',
        click: () => this.callbacks.onToggleCapture(),
      },
      { label: 'Settings', click: () => this.callbacks.onOpenSettings() },
      { type: 'separator' },
      { label: 'Quit Tora', click: () => this.callbacks.onQuit() },
    ])
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
