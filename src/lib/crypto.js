// src/lib/crypto.js
// AES-256-GCM encryption for provider credentials at rest (D-009).
// GATEWAY_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars).
// Generate with: openssl rand -hex 32
//
// Ciphertext format (returned as a single string for storage in a text column):
//   <iv-hex>:<auth-tag-hex>:<ciphertext-hex>
//
// Decrypt only inside the routing code path. Never log decrypted credentials.

import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits, recommended for GCM
const KEY_LENGTH = 32 // 256 bits

function getKey() {
  const raw = process.env.GATEWAY_ENCRYPTION_KEY
  if (!raw) throw new Error('Missing GATEWAY_ENCRYPTION_KEY environment variable')
  const key = Buffer.from(raw, 'hex')
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `GATEWAY_ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (got ${raw.length})`
    )
  }
  return key
}

/**
 * Encrypt a plaintext string. Returns a single colon-separated string safe to
 * store in a text column.
 */
export function encrypt(plaintext) {
  if (plaintext == null) throw new Error('encrypt() called with null/undefined')
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':')
}

/**
 * Decrypt a string produced by encrypt(). Throws if the ciphertext is
 * tampered or the key does not match.
 */
export function decrypt(stored) {
  if (!stored) throw new Error('decrypt() called with empty value')
  const parts = String(stored).split(':')
  if (parts.length !== 3) throw new Error('decrypt(): malformed ciphertext')
  const [ivHex, authTagHex, ciphertextHex] = parts
  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}

/**
 * SHA-256 hash helper for app bearer tokens (D-008). Stored in apps.token_hash.
 */
export function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex')
}
