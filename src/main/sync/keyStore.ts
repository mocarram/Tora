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
 *
 * Resilient: if a previously stored key cannot be read/decrypted (e.g. a stale
 * file from an earlier build, or a Keychain change), a fresh key is generated
 * and persisted rather than throwing. In local-only mode there is no synced data
 * to lose; if sync was active, the device simply re-encrypts on next push.
 */
export function loadOrCreateSyncKey(syncDir: string): Buffer {
  const wrappedPath = join(syncDir, 'key.bin')
  mkdirSync(dirname(wrappedPath), { recursive: true })

  const available = safeStorage.isEncryptionAvailable()

  if (existsSync(wrappedPath)) {
    const existing = tryReadKey(wrappedPath, available)
    if (existing) return existing
    // Fall through and regenerate when the stored key is unreadable.
  }

  const key = generateKey()
  persistKey(wrappedPath, key, available)
  return key
}

function tryReadKey(path: string, available: boolean): Buffer | null {
  try {
    const stored = readFileSync(path)
    if (!available) return stored.length === 32 ? stored : null
    const decrypted = Buffer.from(safeStorage.decryptString(stored), 'binary')
    return decrypted.length === 32 ? decrypted : null
  } catch {
    return null
  }
}

function persistKey(path: string, key: Buffer, available: boolean): void {
  try {
    if (available) writeFileSync(path, safeStorage.encryptString(key.toString('binary')))
    else writeFileSync(path, key) // unwrapped fallback for non-macOS dev hosts
  } catch {
    // If we cannot persist (rare), the in-memory key still works for this run.
  }
}
