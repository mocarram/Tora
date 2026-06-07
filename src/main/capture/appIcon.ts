/**
 * Resolves the icon of the application a clip was copied from, by bundle id.
 *
 * DISABLED: the previous implementation used Electron's `app.getFileIcon`, which
 * extracts an app bundle's icon in-process via macOS IconServices and was
 * crashing the main process natively (an uncatchable C++/Cocoa fault) on some
 * bundles. Until a crash-free path is in place - extracting the bundle's .icns
 * via a `sips` subprocess, fully isolated from the main process - this returns
 * null and cards show no source icon. The source app *name* is still captured
 * and shown in the card header.
 */
export function getAppIconDataUrl(_bundleId: string): Promise<string | null> {
  return Promise.resolve(null)
}
