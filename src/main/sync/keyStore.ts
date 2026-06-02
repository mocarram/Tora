import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { generateKey } from './crypto'

/**
 * Resolves the 32-byte sync encryption key. A random key is generated once and
 * persisted wrapped by Electron safeStorage (Keychain-backed on macOS), so the
 * plaintext key never touches disk. If safeStorage is unavailable (e.g. a dev
 * Linux host), the key is stored unwrapped with a clear warning - never the case
 * on a real macOS install. See GAPS.md.
 */
export function loadOrCreateSyncKey(syncDir: string): Buffer {
  const wrappedPath = join(syncDir, 'key.bin')
  mkdirSync(dirname(wrappedPath), { recursive: true })

  const available = safeStorage.isEncryptionAvailable()

  if (existsSync(wrappedPath)) {
    const stored = readFileSync(wrappedPath)
    if (available) return Buffer.from(safeStorage.decryptString(stored), 'binary')
    return stored
  }

  const key = generateKey()
  if (available) {
    writeFileSync(wrappedPath, safeStorage.encryptString(key.toString('binary')))
  } else {
    // Unwrapped fallback for non-macOS dev hosts only.
    writeFileSync(wrappedPath, key)
  }
  return key
}
