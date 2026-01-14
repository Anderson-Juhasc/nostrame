/**
 * Cryptographic Module for Secure Vault Operations
 *
 * SECURITY ARCHITECTURE:
 * - All key derivation uses PBKDF2 with 600,000 iterations (OWASP 2023)
 * - All encryption uses AES-256-GCM (authenticated encryption)
 * - CryptoKeys are NON-EXTRACTABLE - cannot be exported from memory
 * - This module should only be used in the background service worker
 *
 * FORMAT (v2):
 * "v2:" + base64(version[1] + salt[32] + iv[12] + ciphertext + authTag[16])
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const CRYPTO_VERSION = 2
const PBKDF2_ITERATIONS = 600_000  // OWASP 2023 recommendation for PBKDF2-SHA256
const SALT_LENGTH = 32             // 256 bits
const IV_LENGTH = 12               // 96 bits (recommended for AES-GCM)
const KEY_LENGTH = 256             // AES-256

// ============================================================================
// KEY DERIVATION
// ============================================================================

/**
 * Derive a non-extractable CryptoKey from password using PBKDF2
 *
 * @param {string} password - User's master password
 * @param {Uint8Array} salt - Random salt (32 bytes)
 * @returns {Promise<CryptoKey>} - Non-extractable AES-GCM key
 */
async function deriveKey(password, salt) {
  // Import password as raw key material for PBKDF2
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,  // Not extractable
    ['deriveKey']
  )

  // Derive AES-GCM key using PBKDF2
  // CRITICAL: extractable = false prevents key export
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,  // NON-EXTRACTABLE: Key can never be exported
    ['encrypt', 'decrypt']
  )
}

/**
 * Generate a new random salt and derive key (for new vault creation)
 *
 * @param {string} password - User's master password
 * @returns {Promise<{key: CryptoKey, salt: Uint8Array}>}
 */
export async function deriveNewKey(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const key = await deriveKey(password, salt)
  return { key, salt }
}

/**
 * Derive key from password using salt extracted from existing encrypted data
 *
 * @param {string} password - User's master password
 * @param {string} encryptedData - Existing v2 encrypted vault
 * @returns {Promise<{key: CryptoKey, salt: Uint8Array}>}
 */
export async function deriveKeyFromEncryptedVault(password, encryptedData) {
  if (!encryptedData.startsWith('v2:')) {
    throw new Error('Invalid format: expected v2 encrypted data')
  }

  // Decode and extract salt
  const combined = Uint8Array.from(
    atob(encryptedData.slice(3)),  // Remove "v2:" prefix (3 chars)
    c => c.charCodeAt(0)
  )

  const salt = combined.slice(1, 1 + SALT_LENGTH)
  const key = await deriveKey(password, salt)

  return { key, salt }
}

// ============================================================================
// ENCRYPTION (AES-256-GCM)
// ============================================================================

/**
 * Encrypt data using a pre-derived CryptoKey
 *
 * @param {any} data - Data to encrypt (will be JSON stringified)
 * @param {CryptoKey} key - Non-extractable AES-GCM key
 * @param {Uint8Array} salt - Salt used for key derivation (embedded in output)
 * @returns {Promise<string>} - Encrypted data with "v2:" prefix
 */
export async function encryptWithKey(data, key, salt) {
  // Generate random IV for this encryption (NEVER reuse IVs with GCM)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  // Encrypt the data
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    plaintext
  )

  // Combine: version(1) + salt(32) + iv(12) + ciphertext(includes 16-byte auth tag)
  const combined = new Uint8Array(1 + SALT_LENGTH + IV_LENGTH + ciphertext.byteLength)
  combined[0] = CRYPTO_VERSION
  combined.set(salt, 1)
  combined.set(iv, 1 + SALT_LENGTH)
  combined.set(new Uint8Array(ciphertext), 1 + SALT_LENGTH + IV_LENGTH)

  // Return with "v2:" prefix for format identification
  return 'v2:' + btoa(String.fromCharCode(...combined))
}

// ============================================================================
// DECRYPTION (AES-256-GCM)
// ============================================================================

/**
 * Decrypt data using a pre-derived CryptoKey
 *
 * @param {string} encryptedData - Encrypted string (v2 format)
 * @param {CryptoKey} key - Non-extractable AES-GCM key
 * @returns {Promise<any>} - Decrypted and parsed JSON data
 */
export async function decryptWithKey(encryptedData, key) {
  if (!encryptedData.startsWith('v2:')) {
    throw new Error('Invalid format: expected v2 encrypted data')
  }

  // Remove "v2:" prefix and decode base64
  const combined = Uint8Array.from(
    atob(encryptedData.slice(3)),  // Remove "v2:" prefix (3 chars)
    c => c.charCodeAt(0)
  )

  // Validate version
  const version = combined[0]
  if (version !== CRYPTO_VERSION) {
    throw new Error(`Unsupported crypto version: ${version}`)
  }

  // Extract components (skip version byte and salt - we already have the key)
  const iv = combined.slice(1 + SALT_LENGTH, 1 + SALT_LENGTH + IV_LENGTH)
  const ciphertext = combined.slice(1 + SALT_LENGTH + IV_LENGTH)

  // Decrypt (AES-GCM automatically verifies authentication tag)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    ciphertext
  )

  return JSON.parse(new TextDecoder().decode(plaintext))
}

// ============================================================================
// LEGACY SUPPORT (for migration only)
// ============================================================================

/**
 * Check if encrypted data is in legacy v1 format
 * @param {string} encryptedData
 * @returns {boolean}
 */
export function isLegacyFormat(encryptedData) {
  return encryptedData && !encryptedData.startsWith('v2:')
}

/**
 * Decrypt legacy v1 format (CryptoJS AES-CBC with 10k iterations)
 * Used only for one-time migration to v2 format
 *
 * @param {string} encryptedData - Legacy encrypted string
 * @param {string} password - User's password
 * @returns {Promise<any>} - Decrypted data
 */
export async function decryptLegacy(encryptedData, password) {
  // Legacy format: saltHex(32) + ivHex(32) + base64(ciphertext)
  const saltHex = encryptedData.substring(0, 32)
  const ivHex = encryptedData.substring(32, 64)
  const ciphertextB64 = encryptedData.substring(64)

  // Convert hex to bytes
  const salt = hexToBytes(saltHex)
  const iv = hexToBytes(ivHex)
  const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0))

  // Derive key with legacy parameters
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 10000,  // Legacy: weak iteration count
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt']
  )

  // Decrypt using AES-CBC
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv },
    key,
    ciphertext
  )

  return JSON.parse(new TextDecoder().decode(plaintext))
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

/**
 * Extract salt from an encrypted v2 blob
 * Used when re-encrypting vault without needing to persist salt in memory
 *
 * @param {string} encryptedData - Encrypted string (v2 format)
 * @returns {Uint8Array} - The 32-byte salt
 */
export function extractSaltFromBlob(encryptedData) {
  if (!encryptedData.startsWith('v2:')) {
    throw new Error('Invalid format: expected v2 encrypted data')
  }

  const combined = Uint8Array.from(
    atob(encryptedData.slice(3)),
    c => c.charCodeAt(0)
  )

  return combined.slice(1, 1 + SALT_LENGTH)
}
