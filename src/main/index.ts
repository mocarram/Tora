import { app, protocol } from 'electron'
import { Application } from './app/application'

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

void app.whenReady().then(async () => {
  application = new Application()
  await application.start()
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
