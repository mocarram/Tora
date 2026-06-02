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
    image.setTemplateImage(true)
    this.tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
    this.tray.setToolTip('Tora')
    this.tray.on('click', () => this.callbacks.onToggleWindow())
    this.refresh()
  }

  setCapturing(capturing: boolean): void {
    this.capturing = capturing
    this.refresh()
  }

  private refresh(): void {
    if (!this.tray) return
    const menu = Menu.buildFromTemplate([
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
    this.tray.setContextMenu(menu)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
