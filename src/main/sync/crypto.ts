import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Client-side encryption for synced data. AES-256-GCM with a per-message random
 * IV; the auth tag is prepended so tampering is detected on decrypt. The key
 * never leaves the device unencrypted (see keyStore.ts), so even iCloud Drive
 * files are ciphertext at rest.
 *
 * Wire format: [12-byte IV][16-byte tag][ciphertext].
 */
const IV_LEN = 12
const TAG_LEN = 16

export class SyncCrypto {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('SyncCrypto requires a 32-byte key')
  }

  encrypt(plain: string): Buffer {
    const iv = randomBytes(IV_LEN)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, enc])
  }

  decrypt(buf: Buffer): string {
    const iv = buf.subarray(0, IV_LEN)
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const data = buf.subarray(IV_LEN + TAG_LEN)
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  }
}

/** Derive a 32-byte key from a passphrase (scrypt). */
export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32)
}

export function generateKey(): Buffer {
  return randomBytes(32)
}
