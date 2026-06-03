import { app, protocol } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Application } from './app/application'

// Product name for menus, notifications, and the userData folder. The dock
// *name* in development still reads "Electron" because that is the dev binary's
// bundle; the packaged app (electron-builder productName + build/icon) shows
// "Tora" with the Tora icon.
app.setName('Tora')

// In development, set the dock icon so it at least looks like Tora.
if (process.platform === 'darwin' && !app.isPackaged) {
  const iconPath = join(dirname(fileURLToPath(import.meta.url)), '../../build/icon.png')
  app
    .whenReady()
    .then(() => app.dock?.setIcon(iconPath))
    .catch(() => {})
}

// Single-instance: a second launch just focuses the existing one.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

// Custom scheme for serving on-disk blob thumbnails/images to the renderer
// without inlining base64. Must be registered before app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tora-blob',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

let application: Application | null = null

void app
  .whenReady()
  .then(async () => {
    application = new Application()
    await application.start()
  })
  .catch((err: unknown) => {
    console.error('Failed to start Tora:', err)
  })

app.on('second-instance', () => {
  // The running instance handles summon via tray/hotkey; nothing to do here.
})

// This is a menu-bar app: keep running when all windows are closed.
app.on('window-all-closed', () => {
  // Intentionally do not quit on macOS/Windows; the tray keeps it alive.
  if (process.platform === 'linux') app.quit()
})

app.on('before-quit', () => {
  application?.dispose()
})
