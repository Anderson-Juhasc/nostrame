/**
 * Vault Service - In-Memory Key Management
 *
 * SECURITY ARCHITECTURE:
 * This service manages the security-critical in-memory state.
 * It should ONLY be used in the background service worker.
 *
 * The vault is considered LOCKED when vaultKey is null.
 * The vault is considered UNLOCKED when vaultKey is a valid CryptoKey.
 *
 * When the service worker terminates:
 * - All JavaScript variables are garbage collected
 * - vaultKey and vaultSalt are destroyed
 * - Vault automatically becomes locked
 * - No explicit cleanup needed
 */

import browser from 'webextension-polyfill'
import {
  deriveNewKey,
  deriveKeyFromEncryptedVault,
  encryptWithKey,
  decryptWithKey,
  decryptLegacy,
  isLegacyFormat
} from '../crypto'
import { getSessionVault, setSessionVault, clearSessionVault } from '../common'
import {
  persistEncryptedCachesWithKey,
  restoreEncryptedCachesWithKey,
  clearAllCaches as clearProfileCaches
} from './cache'

// ============================================================================
// IN-MEMORY KEY STORAGE
// These variables are the ONLY place where cryptographic keys exist.
// When the service worker terminates, these are garbage collected.
// ============================================================================

let vaultKey = null      // CryptoKey - non-extractable AES-256-GCM key
let vaultSalt = null     // Uint8Array - salt used for key derivation

/**
 * Check if the vault is currently unlocked (key in memory)
 * This is the ONLY reliable way to check lock status.
 * Storage flags can be stale after worker restart.
 *
 * @returns {boolean}
 */
export function isVaultUnlocked() {
  return vaultKey !== null && vaultSalt !== null
}

/**
 * Clear the in-memory key material
 * Called on explicit lock or before worker termination
 */
function clearVaultKey() {
  vaultKey = null
  vaultSalt = null
}

// ============================================================================
// VAULT OPERATIONS
// ============================================================================

/**
 * Unlock the vault with the user's password
 *
 * Flow:
 * 1. Get encrypted vault from storage
 * 2. Extract salt from encrypted data (or generate new for legacy)
 * 3. Derive key using PBKDF2 (600k iterations)
 * 4. Decrypt vault data
 * 5. Store key in memory (non-extractable)
 * 6. Store decrypted vault in session storage
 * 7. Restore encrypted caches
 *
 * @param {string} password - User's master password
 * @returns {Promise<{success: boolean, error?: string, migrated?: boolean}>}
 */
export async function unlockVault(password) {
  try {
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])

    if (!encryptedVault) {
      return { success: false, error: 'No vault found' }
    }

    let vaultData
    let migrated = false

    // Check for legacy format - needs migration
    if (isLegacyFormat(encryptedVault)) {
      // Decrypt with legacy format (10k iterations, AES-CBC)
      vaultData = await decryptLegacy(encryptedVault, password)

      // Generate new key with strong parameters
      const { key, salt } = await deriveNewKey(password)
      vaultKey = key
      vaultSalt = salt

      // Re-encrypt with v2 format immediately
      const newEncryptedVault = await encryptWithKey(vaultData, vaultKey, vaultSalt)
      await browser.storage.local.set({ encryptedVault: newEncryptedVault })

      migrated = true
    } else {
      // v2 format - derive key from existing salt
      const { key, salt } = await deriveKeyFromEncryptedVault(password, encryptedVault)
      vaultKey = key
      vaultSalt = salt

      // Decrypt using the derived key
      vaultData = await decryptWithKey(encryptedVault, vaultKey)
    }

    // Store decrypted vault in session storage (for UI access)
    await setSessionVault(vaultData)
    await browser.storage.local.set({ isLocked: false })

    // Restore encrypted caches from local storage
    await restoreEncryptedCachesWithKey(vaultKey).catch(err => {
      console.warn('Failed to restore caches:', err)
    })

    return { success: true, migrated }
  } catch (err) {
    // Clear any partial state on failure
    clearVaultKey()
    console.error('Unlock vault error:', err)
    return { success: false, error: 'Invalid password' }
  }
}

/**
 * Lock the vault - clear all sensitive data from memory
 *
 * Flow:
 * 1. Persist encrypted caches (if key still in memory)
 * 2. Clear in-memory key
 * 3. Clear session storage
 * 4. Update lock status in storage
 *
 * @returns {Promise<void>}
 */
export async function lockVault() {
  const { isAuthenticated } = await browser.storage.local.get(['isAuthenticated'])

  // Don't lock if not authenticated (no vault exists)
  if (!isAuthenticated) return

  // Persist encrypted caches before clearing key
  if (isVaultUnlocked()) {
    await persistEncryptedCachesWithKey(vaultKey, vaultSalt).catch(err => {
      console.warn('Failed to persist caches:', err)
    })
  }

  // CRITICAL: Clear the in-memory key
  clearVaultKey()

  // Clear session storage
  await clearSessionVault()

  // Update storage flags
  await browser.storage.local.set({ isLocked: true })

  // Clear any other in-memory caches
  clearProfileCaches()
}

/**
 * Encrypt data using the in-memory key
 *
 * @param {any} data - Data to encrypt
 * @returns {Promise<{success: boolean, encryptedData?: string, error?: string}>}
 */
export async function encryptVaultData(data) {
  if (!isVaultUnlocked()) {
    return { success: false, error: 'Vault is locked' }
  }

  try {
    const encryptedData = await encryptWithKey(data, vaultKey, vaultSalt)
    return { success: true, encryptedData }
  } catch (err) {
    console.error('Encrypt error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Create a new vault with the given password
 *
 * @param {string} password - User's master password
 * @param {object} vaultData - Initial vault data
 * @returns {Promise<{success: boolean, encryptedVault?: string, error?: string}>}
 */
export async function createNewVault(password, vaultData) {
  try {
    // Generate new key with fresh salt
    const { key, salt } = await deriveNewKey(password)
    vaultKey = key
    vaultSalt = salt

    // Encrypt the vault data
    const encryptedVault = await encryptWithKey(vaultData, vaultKey, vaultSalt)

    // Store decrypted vault in session
    await setSessionVault(vaultData)

    return { success: true, encryptedVault }
  } catch (err) {
    clearVaultKey()
    console.error('Create vault error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Change the vault password
 *
 * Flow:
 * 1. Verify old password by decrypting
 * 2. Generate new key with new password
 * 3. Re-encrypt vault with new key
 * 4. Re-encrypt caches with new key
 *
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<{success: boolean, encryptedVault?: string, error?: string}>}
 */
export async function changePassword(oldPassword, newPassword) {
  try {
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])

    if (!encryptedVault) {
      return { success: false, error: 'No vault found' }
    }

    // Verify old password by attempting to decrypt
    let vaultData
    if (isLegacyFormat(encryptedVault)) {
      vaultData = await decryptLegacy(encryptedVault, oldPassword)
    } else {
      const { key } = await deriveKeyFromEncryptedVault(oldPassword, encryptedVault)
      vaultData = await decryptWithKey(encryptedVault, key)
    }

    // Generate new key with new password
    const { key, salt } = await deriveNewKey(newPassword)

    // Update in-memory key
    vaultKey = key
    vaultSalt = salt

    // Re-encrypt vault with new key
    const newEncryptedVault = await encryptWithKey(vaultData, vaultKey, vaultSalt)

    // Re-encrypt caches with new key
    await persistEncryptedCachesWithKey(vaultKey, vaultSalt).catch(() => {})

    return { success: true, encryptedVault: newEncryptedVault }
  } catch (err) {
    console.error('Change password error:', err)
    return { success: false, error: 'Current password is incorrect' }
  }
}

/**
 * Import a vault from a backup file
 *
 * @param {string} encryptedVault - Encrypted vault from backup
 * @param {string} password - Password for the backup
 * @returns {Promise<{success: boolean, vaultData?: any, encryptedVault?: string, error?: string}>}
 */
export async function importVaultBackup(encryptedVault, password) {
  try {
    let vaultData
    let finalEncryptedVault = encryptedVault

    if (isLegacyFormat(encryptedVault)) {
      // Decrypt legacy format
      vaultData = await decryptLegacy(encryptedVault, password)

      // Generate new key for v2 format
      const { key, salt } = await deriveNewKey(password)
      vaultKey = key
      vaultSalt = salt

      // Re-encrypt with v2 format
      finalEncryptedVault = await encryptWithKey(vaultData, vaultKey, vaultSalt)
    } else {
      // v2 format - derive key from existing salt
      const { key, salt } = await deriveKeyFromEncryptedVault(password, encryptedVault)
      vaultKey = key
      vaultSalt = salt

      // Decrypt vault
      vaultData = await decryptWithKey(encryptedVault, vaultKey)
    }

    // Store decrypted vault in session
    await setSessionVault(vaultData)

    return {
      success: true,
      vaultData,
      encryptedVault: finalEncryptedVault,
      migrated: isLegacyFormat(encryptedVault)
    }
  } catch (err) {
    clearVaultKey()
    console.error('Import vault error:', err)
    return { success: false, error: 'Invalid vault file or wrong password' }
  }
}

/**
 * Decrypt vault with password (for viewing secrets)
 * Does NOT change the in-memory key state
 *
 * @param {string} password - Password to verify
 * @returns {Promise<{success: boolean, vaultData?: any, error?: string}>}
 */
export async function decryptVaultWithPassword(password) {
  try {
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])

    if (!encryptedVault) {
      return { success: false, error: 'No vault found' }
    }

    let vaultData
    if (isLegacyFormat(encryptedVault)) {
      vaultData = await decryptLegacy(encryptedVault, password)
    } else {
      const { key } = await deriveKeyFromEncryptedVault(password, encryptedVault)
      vaultData = await decryptWithKey(encryptedVault, key)
    }

    return { success: true, vaultData }
  } catch (err) {
    return { success: false, error: 'Invalid password' }
  }
}

/**
 * Get the current in-memory key and salt (for cache encryption)
 * Only returns values if vault is unlocked
 *
 * @returns {{key: CryptoKey|null, salt: Uint8Array|null}}
 */
export function getVaultKey() {
  return { key: vaultKey, salt: vaultSalt }
}
