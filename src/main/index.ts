import { app, protocol } from 'electron'
import { Application } from './app/application'

// Last-resort handlers so a stray rejection or throw in the main process is
// logged instead of taking the app down silently. The menu-bar app should keep
// running; individual operations already guard their own failures.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in main process:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err)
})

// Product name for menus, notifications, and the userData folder. The dock
// *name* in development still reads "Electron" because that is the dev binary's
// bundle; the packaged app (electron-builder productName + build/icon) shows
// "Tora" with the Tora icon.
app.setName('Tora')

// The Dock icon (default + per-accent variants) is set by Application once
// settings are loaded, in both dev and packaged builds.

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
  // A second launch reveals the existing window instead of starting anew.
  application?.reveal()
})

// This is a menu-bar app: keep running when all windows are closed.
app.on('window-all-closed', () => {
  // Intentionally do not quit on macOS/Windows; the tray keeps it alive.
  if (process.platform === 'linux') app.quit()
})

app.on('before-quit', () => {
  application?.dispose()
})
