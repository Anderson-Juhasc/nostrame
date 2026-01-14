import browser from 'webextension-polyfill'
import {validateEvent, finalizeEvent, getPublicKey} from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import * as nip04 from 'nostr-tools/nip04'
import * as nip44 from 'nostr-tools/nip44'
import {Mutex} from 'async-mutex'
import {LRUCache} from './utils'

// Crypto operations - all happen in this service worker only
import {
  deriveNewKey,
  deriveKeyFromEncryptedVault,
  encryptWithKey,
  decryptWithKey,
  decryptLegacy,
  isLegacyFormat,
  extractSaltFromBlob
} from './crypto'

// Non-crypto utilities
import {
  NO_PERMISSIONS_REQUIRED,
  getPermissionStatus,
  updatePermission,
  showNotification,
  getPosition
} from './common'

import { clearAllCaches as clearProfileCaches, persistEncryptedCachesWithKey, restoreEncryptedCachesWithKey } from './services/cache'
import { closeDiscoveryPool } from './helpers/outbox'

let openPrompt = null
let promptMutex = new Mutex()
let releasePromptMutex = () => {}
let secretsCache = new LRUCache(100)
let lastUsedAccount = null

// ============================================================================
// SECURITY INVARIANTS
// ============================================================================
//
// INV-1: vaultKey in memory is the SINGLE SOURCE OF CRYPTOGRAPHIC TRUTH.
//        If vaultKey === null, the vault is LOCKED, regardless of any storage flags.
//
// INV-2: UX state ≠ Cryptographic state.
//        Storage flags (uiHintLocked) are HINTS for UI rendering only.
//        They may be stale after service worker restart.
//
// INV-3: Service worker termination = Automatic lock.
//        All in-memory secrets are garbage collected. No mechanism can prevent this.
//        Keep-alive is BEST-EFFORT only.
//
// INV-4: Private keys NEVER leave background memory.
//        UI receives only pubkeys, signed results, or encrypted blobs.
//
// INV-5: sessionStorage contains NO secrets.
//        All decrypted data lives in background memory only.
//
// ============================================================================
// IN-MEMORY STATE - PARTITIONED FOR SECURITY
// ============================================================================
//
// We partition in-memory vault data into two categories:
//
// 1. PRIVATE MATERIAL (High sensitivity)
//    - Private keys, seed phrases, signing material
//    - Wiped AGGRESSIVELY on lock, error, or any security event
//    - NEVER serialized or sent to UI
//
// 2. PUBLIC METADATA (Low sensitivity)
//    - Account names, relay lists, settings
//    - May be cached slightly longer but still memory-only
//    - Can be sent to UI for display
//
// ============================================================================

// CRYPTOGRAPHIC KEY - The single source of unlock truth
let vaultKey = null  // CryptoKey - non-extractable AES-GCM key

// PRIVATE MATERIAL - High sensitivity, wiped aggressively
// Contains: private keys, mnemonic, accountDefault (which is a prvKey)
let privateMaterial = null

// PUBLIC METADATA - Lower sensitivity, still memory-only
// Contains: account indices, settings, relay lists, profile names
let publicMetadata = null

// Note: vaultSalt is NOT stored here. It's extracted from the encrypted blob
// when needed for re-encryption. This minimizes exposure of crypto metadata.

/**
 * Check if the vault is unlocked (key is in memory)
 *
 * THIS IS THE SOLE AUTHORITATIVE SOURCE FOR UNLOCK STATE.
 *
 * Storage flags (uiHintLocked) are UX hints only and may be stale
 * after service worker restart. Always use this function or
 * GET_VAULT_STATUS message to check actual unlock state.
 */
function isVaultUnlocked() {
  return vaultKey !== null
}

/**
 * Clear all in-memory sensitive data
 *
 * Called on:
 * - Explicit lock (user clicks lock)
 * - Auto-lock timeout
 * - Any security-sensitive error
 * - Service worker termination (automatic via GC)
 *
 * SECURITY: privateMaterial is wiped FIRST as it's highest sensitivity
 */
function clearInMemorySecrets() {
  // Clear private material FIRST (highest sensitivity)
  if (privateMaterial) {
    // Attempt to overwrite sensitive fields before nulling
    // (defense in depth - helps with memory inspection attacks)
    if (privateMaterial.accounts) {
      privateMaterial.accounts.forEach(acc => {
        if (acc.prvKey) acc.prvKey = null
      })
    }
    if (privateMaterial.importedAccounts) {
      privateMaterial.importedAccounts.forEach(acc => {
        if (acc.prvKey) acc.prvKey = null
      })
    }
    privateMaterial.mnemonic = null
    privateMaterial.accountDefault = null
  }
  privateMaterial = null

  // Clear public metadata (lower sensitivity but still memory-only)
  publicMetadata = null

  // Clear the cryptographic key last
  vaultKey = null
}

/**
 * Store decrypted vault data in partitioned memory
 * Separates private material from public metadata
 */
function storeDecryptedVault(vaultData) {
  // Extract PRIVATE MATERIAL (high sensitivity)
  privateMaterial = {
    accounts: vaultData.accounts || [],           // Array of {prvKey}
    importedAccounts: vaultData.importedAccounts || [], // Array of {prvKey}
    mnemonic: vaultData.mnemonic,                 // BIP39 mnemonic (if stored)
    accountDefault: vaultData.accountDefault      // Currently selected prvKey
  }

  // Extract PUBLIC METADATA (lower sensitivity)
  publicMetadata = {
    // Account count and types (no private keys)
    accountCount: (vaultData.accounts?.length || 0),
    importedAccountCount: (vaultData.importedAccounts?.length || 0),
    // Any other non-sensitive settings can go here
  }
}

/**
 * Reconstruct full vault from partitioned memory
 * Used when vault needs to be re-encrypted
 */
function getFullVaultFromMemory() {
  if (!privateMaterial) return null

  return {
    accounts: privateMaterial.accounts,
    importedAccounts: privateMaterial.importedAccounts,
    mnemonic: privateMaterial.mnemonic,
    accountDefault: privateMaterial.accountDefault
  }
}

// Legacy accessor for backward compatibility
// TODO: Migrate all code to use partitioned access
function getDecryptedVault() {
  return getFullVaultFromMemory()
}

// Auto-lock timeout (default 5 minutes in milliseconds, converted to minutes for alarms API)
const DEFAULT_LOCK_TIMEOUT = 5 * 60 * 1000
const LOCK_ALARM_NAME = 'autoLockAlarm'

// ============================================================================
// KEEP-ALIVE MECHANISM - BEST EFFORT ONLY
// ============================================================================
//
// IMPORTANT: Keep-alive is a UX OPTIMIZATION, not a security guarantee.
//
// How it works:
// - A periodic alarm fires every ~24 seconds while vault is unlocked
// - This prevents Chrome from terminating the idle service worker
// - If successful, user doesn't need to re-enter password frequently
//
// CRITICAL LIMITATIONS:
// - Chrome may STILL terminate the worker at any time (memory pressure, updates, etc.)
// - Keep-alive alarms may fail to fire (browser bugs, system sleep, etc.)
// - There is NO mechanism that can guarantee the worker stays alive
//
// SECURITY IMPLICATIONS:
// - Service worker termination at ANY TIME must be treated as vault lock
// - UI must ALWAYS call GET_VAULT_STATUS on focus/reload to verify state
// - UI must NEVER assume the vault is unlocked based on previous state
// - Storage flags (uiHintLocked) may be stale after unexpected termination
//
// ============================================================================
const KEEPALIVE_ALARM_NAME = 'keepAliveAlarm'
const KEEPALIVE_INTERVAL_MINUTES = 0.4  // ~24 seconds (under Chrome's 30s idle limit)

/**
 * Start the keep-alive alarm to prevent service worker termination.
 * Called when vault is unlocked.
 *
 * BEST EFFORT ONLY - This is a UX optimization, not a security guarantee.
 * The service worker may still be terminated by Chrome at any time.
 * All security logic must assume termination can happen unexpectedly.
 */
function startKeepAlive() {
  chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
    periodInMinutes: KEEPALIVE_INTERVAL_MINUTES
  })
}

/**
 * Stop the keep-alive alarm.
 * Called when vault is locked (explicit or auto-lock).
 * Once stopped, the service worker can terminate normally,
 * which will garbage collect all in-memory secrets.
 */
function stopKeepAlive() {
  chrome.alarms.clear(KEEPALIVE_ALARM_NAME)
}

// Track active UI connections (popup/options pages)
let activeConnections = new Set()

async function lockVault() {
  const { isAuthenticated, encryptedVault } = await browser.storage.local.get(['isAuthenticated', 'encryptedVault'])
  if (!isAuthenticated) return // Don't lock if not authenticated

  // Stop keep-alive - allow service worker to terminate after lock
  stopKeepAlive()

  // Persist encrypted caches before clearing key (if key is still in memory)
  if (isVaultUnlocked() && encryptedVault) {
    // Extract salt from existing blob - don't store it in memory
    const salt = extractSaltFromBlob(encryptedVault)
    await persistEncryptedCachesWithKey(vaultKey, salt).catch(err => {
      console.warn('Failed to persist caches:', err)
    })
  }

  // CRITICAL: Clear ALL in-memory secrets
  // Order matters: privateMaterial first, then publicMetadata, then vaultKey
  clearInMemorySecrets()

  // Update UX hint flag
  // NOTE: This is a UI HINT ONLY, not a security flag.
  // The authoritative lock state is vaultKey === null.
  // This flag may be stale after service worker restart.
  await browser.storage.local.set({ uiHintLocked: true })

  clearAllCaches()
}

async function resetLockTimer() {
  // Clear any existing alarm
  await chrome.alarms.clear(LOCK_ALARM_NAME)

  // Don't start timer if UI is actively open (popup or options page)
  if (activeConnections.size > 0) return

  // Check if vault is unlocked using AUTHORITATIVE source (in-memory key)
  // Storage flags are hints only and may be stale
  if (!isVaultUnlocked()) return

  const { isAuthenticated } = await browser.storage.local.get(['isAuthenticated'])
  if (!isAuthenticated) return

  // Get timeout setting (default 5 minutes)
  const { autoLockTimeout = DEFAULT_LOCK_TIMEOUT } = await browser.storage.local.get(['autoLockTimeout'])
  if (autoLockTimeout <= 0) return // Disabled if 0 or negative

  // Convert milliseconds to minutes for alarms API (minimum 0.5 minutes = 30 seconds in dev mode)
  const delayInMinutes = Math.max(autoLockTimeout / 60000, 0.5)
  await chrome.alarms.create(LOCK_ALARM_NAME, { delayInMinutes })
}

// Handle UI connections (popup/options) - pause timer while connected
browser.runtime.onConnect.addListener((port) => {
  if (port.name === 'ui-active') {
    activeConnections.add(port)
    // Pause the timer while UI is open
    chrome.alarms.clear(LOCK_ALARM_NAME)

    port.onDisconnect.addListener(() => {
      activeConnections.delete(port)
      // Resume timer when all UI connections are closed
      if (activeConnections.size === 0) {
        resetLockTimer()
      }
    })
  }
})

// Listen for alarm to trigger lock
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOCK_ALARM_NAME) {
    lockVault()
  } else if (alarm.name === KEEPALIVE_ALARM_NAME) {
    // Keep-alive: This handler firing is enough to keep the service worker alive.
    // No action needed - just receiving the alarm prevents termination.
    // The in-memory vaultKey remains intact.
  }
})

/**
 * Clear all caches on vault lock or account change
 * This is a SECURITY-CRITICAL function - ensures no sensitive data remains accessible
 */
function clearAllCaches() {
  secretsCache.clear()
  lastUsedAccount = null
  // Clear profile and relay caches from session storage
  clearProfileCaches()
  // Close discovery pool WebSocket connections
  // This prevents stale connections and ensures clean state
  closeDiscoveryPool()
}

function getSharedSecret(sk, peer) {
  // Clear cache if account changed
  if (lastUsedAccount !== sk) {
    secretsCache.clear()
    lastUsedAccount = sk
  }

  let key = secretsCache.get(peer)

  if (!key) {
    key = nip44.v2.utils.getConversationKey(sk, peer)
    secretsCache.set(peer, key)
  }

  return key
}

/**
 * Get the current active account's private key from in-memory PRIVATE MATERIAL
 * Returns null if vault is locked or no default account set
 *
 * SECURITY: This accesses privateMaterial which contains sensitive keys.
 * The returned value must NEVER be sent to UI or stored outside this worker.
 */
function getCurrentAccount() {
  if (!privateMaterial || !privateMaterial.accountDefault) {
    return null
  }
  return privateMaterial.accountDefault
}

const width = 400
const height = 600

browser.runtime.onInstalled.addListener(async (_, __, reason) => {
  if (reason === 'install') browser.runtime.openOptionsPage()

  // Set default auto-lock timeout
  await browser.storage.local.set({
    "autoLockTimeout": DEFAULT_LOCK_TIMEOUT
  })

  // Cleanup: remove unencrypted vault and legacy relays from local storage
  await browser.storage.local.remove(['vault', 'relays'])
})

// Start lock timer on extension startup
resetLockTimer()

browser.runtime.onMessage.addListener(async (message, sender) => {
  // Reset lock timer on any message (user activity)
  resetLockTimer()

  // Handle vault operations (UI -> background)
  switch (message.type) {
    // ========================================================================
    // VAULT STATUS & LOCK OPERATIONS
    // ========================================================================
    case 'UNLOCK_VAULT':
      return handleUnlockVault(message.password)
    case 'LOCK_VAULT':
      await lockVault()
      return { success: true }
    case 'GET_VAULT_STATUS': {
      // Authoritative unlock check - this is the ONLY reliable way to check
      const { encryptedVault, isAuthenticated } = await browser.storage.local.get(['encryptedVault', 'isAuthenticated'])
      const unlocked = isVaultUnlocked()

      // Sync storage hint flag if desync detected (worker restarted)
      // NOTE: uiHintLocked is a UX hint ONLY, not authoritative state
      if (isAuthenticated && !unlocked) {
        await browser.storage.local.set({ uiHintLocked: true })
      }

      return {
        unlocked,
        hasVault: !!encryptedVault,
        isAuthenticated: !!isAuthenticated
      }
    }
    // Legacy alias - TODO: remove after migration
    case 'GET_LOCK_STATUS':
      return { unlocked: isVaultUnlocked() }

    // ========================================================================
    // VAULT DATA ACCESS (UI requests data, background returns public info only)
    // Private keys NEVER leave background memory
    // ========================================================================
    case 'GET_VAULT_DATA':
      return handleGetVaultData()
    case 'GET_ACCOUNTS_LIST':
      return handleGetAccountsList()
    case 'UPDATE_VAULT':
      return handleUpdateVault(message.vault)
    case 'GET_SESSION_VAULT':
      // Returns full vault from memory (replaces getSessionVault())
      // SECURITY: Vault is in memory only, NOT in session storage
      // This is for UI components that need to modify vault structure
      if (!isVaultUnlocked() || !privateMaterial) {
        return null
      }
      return getFullVaultFromMemory()
    case 'SET_SESSION_VAULT':
      // Updates vault in memory and encrypts to storage (replaces setSessionVault())
      // SECURITY: Vault is stored in memory only, NOT in session storage
      return handleUpdateVault(message.vault)

    // ========================================================================
    // VAULT MANAGEMENT
    // ========================================================================
    case 'ENCRYPT_VAULT':
      return handleEncryptVault(message.data)
    case 'CREATE_NEW_VAULT':
      return handleCreateNewVault(message.password, message.vaultData)
    case 'CHANGE_PASSWORD':
      return handleChangePassword(message.oldPassword, message.newPassword)
    case 'IMPORT_VAULT_BACKUP':
      return handleImportVaultBackup(message.encryptedVault, message.password)
    case 'VERIFY_PASSWORD':
      return handleVerifyPassword(message.password)
    // Legacy alias - TODO: remove after migration
    case 'DECRYPT_VAULT_WITH_PASSWORD':
      return handleDecryptVaultWithPassword(message.password)

    // ========================================================================
    // HIGH-SENSITIVITY SECRET EXPORT (Requires password re-verification)
    // ========================================================================
    case 'REQUEST_SECRET_FOR_DISPLAY':
      return handleRequestSecretForDisplay(message.password, message.secretType, message.accountIndex)
  }

  if (message.openSignUp) {
    openSignUpWindow()
    browser.windows.remove(sender.tab.windowId)
  } else {
    let {prompt} = message
    if (prompt) {
      handlePromptMessage(message, sender)
    } else {
      return handleContentScriptMessage(message)
    }
  }
})

// ============================================================================
// VAULT OPERATION HANDLERS - All crypto operations happen here
// ============================================================================

/**
 * Handle vault unlock - derives key, stores in memory, decrypts vault
 *
 * SECURITY: Decrypted vault is stored ONLY in background memory (decryptedVault).
 * sessionStorage contains NO secrets - UI accesses data via messages.
 * Salt is NOT stored in memory after derivation.
 *
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function handleUnlockVault(password) {
  try {
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])
    if (!encryptedVault) {
      return { success: false, error: 'No vault found' }
    }

    let vaultData
    let migrated = false

    // Check if legacy format - need migration
    if (isLegacyFormat(encryptedVault)) {
      // Decrypt with legacy format (10k iterations, AES-CBC)
      vaultData = await decryptLegacy(encryptedVault, password)

      // Generate new key with strong parameters for future use
      // Salt is used only here, then discarded (not stored in memory)
      const { key, salt } = await deriveNewKey(password)
      vaultKey = key

      // Re-encrypt with new format immediately
      const newEncryptedVault = await encryptWithKey(vaultData, vaultKey, salt)
      await browser.storage.local.set({ encryptedVault: newEncryptedVault })
      // salt goes out of scope here - automatically garbage collected

      migrated = true
    } else {
      // v2 format - derive key from existing salt (salt is in the blob)
      // We only keep the key, salt is extracted and discarded
      const { key } = await deriveKeyFromEncryptedVault(password, encryptedVault)
      vaultKey = key

      // Decrypt vault using already-derived key
      vaultData = await decryptWithKey(encryptedVault, vaultKey)
    }

    // Store decrypted vault in partitioned MEMORY ONLY (not session storage!)
    storeDecryptedVault(vaultData)

    // Update storage hint flag (UX hint only - not authoritative)
    await browser.storage.local.set({ uiHintLocked: false })

    // Restore encrypted caches from local storage
    await restoreEncryptedCachesWithKey(vaultKey).catch(err => {
      console.warn('Failed to restore caches:', err)
    })

    // Start keep-alive to maintain session
    startKeepAlive()

    return { success: true, migrated }
  } catch (err) {
    // Clear any partial state on failure
    clearInMemorySecrets()
    console.error('Unlock vault error:', err)
    return { success: false, error: 'Invalid password' }
  }
}

/**
 * Handle vault encryption - encrypts data using in-memory key
 * Salt is extracted from existing encrypted vault (not stored in memory)
 *
 * @param {any} data - Data to encrypt
 * @returns {Promise<{success: boolean, encryptedData?: string, error?: string}>}
 */
async function handleEncryptVault(data) {
  if (!isVaultUnlocked()) {
    return { success: false, error: 'Vault is locked' }
  }

  try {
    // Extract salt from existing encrypted vault (not stored in memory)
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])
    if (!encryptedVault || isLegacyFormat(encryptedVault)) {
      return { success: false, error: 'No valid encrypted vault found' }
    }

    const salt = extractSaltFromBlob(encryptedVault)
    const encryptedData = await encryptWithKey(data, vaultKey, salt)

    // Also update in-memory vault (partitioned)
    storeDecryptedVault(data)

    return { success: true, encryptedData }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Handle new vault creation - generates new key and encrypts vault
 * Salt is used for encryption then discarded (not stored in memory)
 *
 * @param {string} password - User's password
 * @param {any} vaultData - Initial vault data
 * @returns {Promise<{success: boolean, encryptedVault?: string, error?: string}>}
 */
async function handleCreateNewVault(password, vaultData) {
  try {
    // Generate new key with fresh salt
    // Salt is used only here, then discarded
    const { key, salt } = await deriveNewKey(password)
    vaultKey = key

    // Encrypt the vault data
    const encryptedVault = await encryptWithKey(vaultData, vaultKey, salt)
    // salt goes out of scope here

    // Store decrypted vault in partitioned MEMORY ONLY
    storeDecryptedVault(vaultData)

    // Start keep-alive
    startKeepAlive()

    return { success: true, encryptedVault }
  } catch (err) {
    clearInMemorySecrets()
    return { success: false, error: err.message }
  }
}

/**
 * Handle password change - verifies old password, re-encrypts with new password
 * Salt is used for encryption then discarded
 *
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<{success: boolean, encryptedVault?: string, error?: string}>}
 */
async function handleChangePassword(oldPassword, newPassword) {
  try {
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])
    if (!encryptedVault) {
      return { success: false, error: 'No vault found' }
    }

    // Verify old password by decrypting
    let vaultData
    if (isLegacyFormat(encryptedVault)) {
      vaultData = await decryptLegacy(encryptedVault, oldPassword)
    } else {
      const { key } = await deriveKeyFromEncryptedVault(oldPassword, encryptedVault)
      vaultData = await decryptWithKey(encryptedVault, key)
    }

    // Generate new key with new password
    // Salt is used only here, then discarded
    const { key, salt } = await deriveNewKey(newPassword)

    // Update in-memory key
    vaultKey = key

    // Re-encrypt vault with new key
    const newEncryptedVault = await encryptWithKey(vaultData, vaultKey, salt)

    // Re-encrypt caches with new key (using the new salt)
    await persistEncryptedCachesWithKey(vaultKey, salt).catch(() => {})
    // salt goes out of scope here

    // Update in-memory vault (partitioned)
    storeDecryptedVault(vaultData)

    return { success: true, encryptedVault: newEncryptedVault }
  } catch (err) {
    return { success: false, error: 'Current password is incorrect' }
  }
}

/**
 * Handle vault backup import - decrypts backup, stores key in memory
 * Salt is used for encryption then discarded (not stored in memory)
 *
 * SECURITY: Returns ONLY public data (account count, etc.)
 * Private keys NEVER leave this function.
 *
 * @param {string} encryptedVault - Encrypted vault from backup file
 * @param {string} password - Password to decrypt the backup
 * @returns {Promise<{success: boolean, encryptedVault?: string, accountCount?: number, error?: string}>}
 */
async function handleImportVaultBackup(encryptedVault, password) {
  try {
    let vaultData
    let finalEncryptedVault = encryptedVault
    let migrated = false

    // Check if legacy format
    if (isLegacyFormat(encryptedVault)) {
      // Decrypt with legacy format (10k iterations, AES-CBC)
      vaultData = await decryptLegacy(encryptedVault, password)

      // Generate new key for storage
      // Salt is used only here, then discarded
      const { key, salt } = await deriveNewKey(password)
      vaultKey = key

      // Re-encrypt with new format
      finalEncryptedVault = await encryptWithKey(vaultData, vaultKey, salt)
      // salt goes out of scope here

      migrated = true
    } else {
      // v2 format - derive key from existing salt
      // We only keep the key, salt is extracted and discarded
      const { key } = await deriveKeyFromEncryptedVault(password, encryptedVault)
      vaultKey = key

      // Decrypt vault using already-derived key
      vaultData = await decryptWithKey(encryptedVault, vaultKey)
    }

    // Store decrypted vault in partitioned MEMORY ONLY
    storeDecryptedVault(vaultData)

    // Start keep-alive
    startKeepAlive()

    // Return only public info - NO private keys
    const accountCount = (vaultData.accounts?.length || 0) + (vaultData.importedAccounts?.length || 0)

    return {
      success: true,
      encryptedVault: finalEncryptedVault,
      accountCount,
      migrated
    }
  } catch (err) {
    clearInMemorySecrets()
    console.error('Import vault backup error:', err)
    return { success: false, error: 'Invalid vault file or wrong password' }
  }
}

/**
 * Handle decrypt vault with password - verifies password without changing state
 * Used for viewing secrets (requires password re-entry for security)
 *
 * WARNING: This returns decrypted vault data including private keys.
 * Only use for explicit "show secret" functionality with password re-verification.
 *
 * @param {string} password - Password to verify
 * @returns {Promise<{success: boolean, vaultData?: any, error?: string}>}
 * @deprecated Use VERIFY_PASSWORD + in-memory vault access instead
 */
async function handleDecryptVaultWithPassword(password) {
  try {
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])
    if (!encryptedVault) {
      return { success: false, error: 'No vault found' }
    }

    // Decrypt vault to verify password
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
 * Handle request for secret display - REQUIRES password re-verification
 *
 * SECURITY: This is a HIGH-SENSITIVITY operation.
 * - Requires password re-entry even if vault is unlocked
 * - Only returns ONE secret at a time
 * - Used for explicit "show private key" or "show mnemonic" UI actions
 *
 * @param {string} password - Password for verification
 * @param {string} secretType - Type of secret: 'privateKey' or 'mnemonic'
 * @param {number} accountIndex - For privateKey, index of account (derived accounts) or null for current
 * @returns {Promise<{success: boolean, secret?: string, error?: string}>}
 */
async function handleRequestSecretForDisplay(password, secretType, accountIndex) {
  // Step 1: Verify password (always required, even if unlocked)
  try {
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])
    if (!encryptedVault) {
      return { success: false, error: 'No vault found' }
    }

    // Verify password by attempting decryption
    let vaultData
    if (isLegacyFormat(encryptedVault)) {
      vaultData = await decryptLegacy(encryptedVault, password)
    } else {
      const { key } = await deriveKeyFromEncryptedVault(password, encryptedVault)
      vaultData = await decryptWithKey(encryptedVault, key)
    }

    // Step 2: Extract the requested secret
    switch (secretType) {
      case 'mnemonic': {
        // Return the BIP39 mnemonic (seed phrase)
        if (!vaultData.mnemonic) {
          return { success: false, error: 'No mnemonic found in vault' }
        }
        return { success: true, secret: vaultData.mnemonic }
      }
      case 'privateKey': {
        // Return private key for a specific account
        // If accountIndex is null/undefined, use current default account
        let prvKey

        if (accountIndex === null || accountIndex === undefined) {
          // Get current default account's private key
          prvKey = vaultData.accountDefault
          if (!prvKey) {
            return { success: false, error: 'No default account set' }
          }
        } else {
          // Get account at specified index
          // accountIndex format: "derived:N" or "imported:N" or just N (assumes derived)
          let type = 'derived'
          let idx = accountIndex

          if (typeof accountIndex === 'string') {
            if (accountIndex.startsWith('imported:')) {
              type = 'imported'
              idx = parseInt(accountIndex.split(':')[1], 10)
            } else if (accountIndex.startsWith('derived:')) {
              idx = parseInt(accountIndex.split(':')[1], 10)
            } else {
              idx = parseInt(accountIndex, 10)
            }
          }

          const accounts = type === 'imported' ? vaultData.importedAccounts : vaultData.accounts
          if (!accounts || !accounts[idx]) {
            return { success: false, error: 'Account not found' }
          }
          prvKey = accounts[idx].prvKey
        }

        if (!prvKey) {
          return { success: false, error: 'Private key not found' }
        }

        return { success: true, secret: prvKey }
      }
      default:
        return { success: false, error: `Unknown secret type: ${secretType}` }
    }
  } catch (err) {
    // Password verification failed
    return { success: false, error: 'Invalid password' }
  }
}

/**
 * Handle password verification - checks if password is correct without returning secrets
 * Used for settings operations that require re-authentication
 *
 * @param {string} password - Password to verify
 * @returns {Promise<{success: boolean, valid?: boolean, error?: string}>}
 */
async function handleVerifyPassword(password) {
  try {
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])
    if (!encryptedVault) {
      return { success: false, error: 'No vault found' }
    }

    // Try to decrypt - if it works, password is correct
    if (isLegacyFormat(encryptedVault)) {
      await decryptLegacy(encryptedVault, password)
    } else {
      const { key } = await deriveKeyFromEncryptedVault(password, encryptedVault)
      await decryptWithKey(encryptedVault, key)
    }

    return { success: true, valid: true }
  } catch (err) {
    return { success: true, valid: false }
  }
}

/**
 * Get vault data for UI display
 * Returns public info and account indices - NO private keys
 *
 * SECURITY: This function NEVER returns private keys.
 * Private keys stay in background memory only.
 *
 * @returns {Promise<{success: boolean, vault?: object, error?: string}>}
 */
function handleGetVaultData() {
  if (!isVaultUnlocked() || !privateMaterial) {
    return { success: false, error: 'Vault is locked' }
  }

  // Return vault structure without private keys
  // UI can use this to understand account structure
  const safeVault = {
    accountDefault: privateMaterial.accountDefault,
    // Return account indices, NOT private keys
    accounts: (privateMaterial.accounts || []).map((acc, index) => ({
      index,
      // prvKey is intentionally NOT included
    })),
    importedAccounts: (privateMaterial.importedAccounts || []).map((acc, index) => ({
      index,
      // prvKey is intentionally NOT included
    })),
    mnemonic: undefined // NEVER expose mnemonic
  }

  return { success: true, vault: safeVault }
}

/**
 * Get list of accounts with public info only
 * Used by UI to display account list
 *
 * SECURITY: This function NEVER returns private keys.
 *
 * @returns {Promise<{success: boolean, accounts?: array, error?: string}>}
 */
function handleGetAccountsList() {
  if (!isVaultUnlocked() || !privateMaterial) {
    return { success: false, error: 'Vault is locked' }
  }

  const accounts = []

  // Process derived accounts
  const derivedAccounts = privateMaterial.accounts || []
  for (let i = 0; i < derivedAccounts.length; i++) {
    const prvKey = derivedAccounts[i].prvKey
    const pubKey = getPublicKey(prvKey)
    accounts.push({
      index: i,
      type: 'derived',
      pubKey,
      // prvKey is intentionally NOT included
      isDefault: privateMaterial.accountDefault === prvKey
    })
  }

  // Process imported accounts
  const importedAccounts = privateMaterial.importedAccounts || []
  for (let i = 0; i < importedAccounts.length; i++) {
    const prvKey = importedAccounts[i].prvKey
    const pubKey = getPublicKey(prvKey)
    accounts.push({
      index: i,
      type: 'imported',
      pubKey,
      // prvKey is intentionally NOT included
      isDefault: privateMaterial.accountDefault === prvKey
    })
  }

  return { success: true, accounts }
}

/**
 * Update vault with new data
 * Encrypts and persists to storage, updates in-memory vault
 *
 * @param {object} newVault - Updated vault data (includes private keys for storage)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function handleUpdateVault(newVault) {
  if (!isVaultUnlocked()) {
    return { success: false, error: 'Vault is locked' }
  }

  try {
    // Extract salt from existing encrypted vault
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])
    if (!encryptedVault || isLegacyFormat(encryptedVault)) {
      return { success: false, error: 'No valid encrypted vault found' }
    }

    const salt = extractSaltFromBlob(encryptedVault)

    // Encrypt and save
    const newEncryptedVault = await encryptWithKey(newVault, vaultKey, salt)
    await browser.storage.local.set({ encryptedVault: newEncryptedVault })

    // Update in-memory vault (partitioned)
    storeDecryptedVault(newVault)

    return { success: true }
  } catch (err) {
    console.error('Update vault error:', err)
    return { success: false, error: err.message }
  }
}

browser.runtime.onMessageExternal.addListener(
  async ({type, params}, sender) => {
    // Reset lock timer on external message (user activity)
    resetLockTimer()

    let extensionId = new URL(sender.url).host
    return handleContentScriptMessage({type, params, host: extensionId})
  }
)

browser.windows.onRemoved.addListener(_ => {
  if (openPrompt) {
    // calling this with a simple "no" response will not store anything, so it's fine
    // it will just return a failure
    handlePromptMessage({accept: false}, null)
  }
})

browser.storage.onChanged.addListener((changes, area) => {
  // Handle UX hint flag changes (hint flags in localStorage)
  // NOTE: These are UX hints only, not authoritative lock state
  if (changes.uiHintLocked?.newValue === true) {
    clearAllCaches()
    chrome.alarms.clear(LOCK_ALARM_NAME)
  }
  // Reset timer when vault is unlocked (UX hint)
  if (changes.uiHintLocked?.newValue === false) {
    resetLockTimer()
  }
})

// Note: We no longer listen for session storage changes because
// decrypted vault is now stored ONLY in background memory, not session storage

async function handleContentScriptMessage({type, params, host}) {
  if (NO_PERMISSIONS_REQUIRED[type]) {
    // authorized, and we won't do anything with private key here, so do a separate handler
    switch (type) {
      case 'replaceURL': {
        let {protocol_handler: ph} = await browser.storage.local.get([
          'protocol_handler'
        ])
        if (!ph) return false

        let {url} = params
        let raw = url.split('nostr:')[1]
        let {type, data} = nip19.decode(raw)
        let replacements = {
          raw,
          hrp: type,
          hex:
            type === 'npub' || type === 'note'
              ? data
              : type === 'nprofile'
              ? data.pubkey
              : type === 'nevent'
              ? data.id
              : null,
          p_or_e: {npub: 'p', note: 'e', nprofile: 'p', nevent: 'e'}[type],
          u_or_n: {npub: 'u', note: 'n', nprofile: 'u', nevent: 'n'}[type],
          relay0: type === 'nprofile' ? data.relays[0] : null,
          relay1: type === 'nprofile' ? data.relays[1] : null,
          relay2: type === 'nprofile' ? data.relays[2] : null
        }
        let result = ph
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        Object.entries(replacements).forEach(([pattern, value]) => {
          result = result.replace(new RegExp(`\\{ *${escapeRegex(pattern)} *\\}`, 'g'), value)
        })

        return result
      }
    }

    return
  } else {
    // acquire mutex here before reading policies
    releasePromptMutex = await promptMutex.acquire()

    // Check if vault is locked (key not in memory) - if so, we must show prompt for unlock
    const isVaultLocked = !isVaultUnlocked()

    let allowed = await getPermissionStatus(
      host,
      type,
      type === 'signEvent' ? params.event : undefined
    )

    // If vault is locked, always show prompt for unlock (even if permission granted)
    const needsPrompt = isVaultLocked || allowed === undefined

    if (allowed === false) {
      // denied, just refuse immediately
      releasePromptMutex()
      showNotification(host, allowed, type, params)
      return {
        error: {message: 'denied'}
      }
    } else if (needsPrompt) {
      // vault locked OR permission not yet granted - show prompt
      try {
        const array = new Uint32Array(2)
        crypto.getRandomValues(array)
        let id = Array.from(array, x => x.toString(16)).join('')

        // Get current account to show in prompt (will be null if locked)
        const currentAccount = await getCurrentAccount()
        const currentPubkey = currentAccount ? getPublicKey(currentAccount) : null

        let qs = new URLSearchParams({
          host,
          id,
          params: JSON.stringify(params),
          type,
          pubkey: currentPubkey || '',
          // If permission already granted, just need unlock (no permission UI needed)
          unlockOnly: allowed === true ? 'true' : ''
        })
        // center prompt
        const {top, left} = await getPosition(width, height)
        // prompt will be resolved with true or false
        let accept = await new Promise((resolve, reject) => {
          openPrompt = {resolve, reject}

          browser.windows.create({
            url: `${browser.runtime.getURL('prompt.html')}?${qs.toString()}`,
            type: 'popup',
            width: width,
            height: height,
            top: top,
            left: left
          })
        })

        // denied, stop here
        if (!accept) return {error: {message: 'denied'}}
      } catch (err) {
        // errored, stop here
        releasePromptMutex()
        return {
          error: {message: err.message, stack: err.stack}
        }
      }
    } else {
      // authorized and unlocked, proceed without prompt
      releasePromptMutex()
      showNotification(host, allowed, type, params)
    }
  }

  // if we're here this means it was accepted
  // Check AUTHORITATIVE unlock state (in-memory key), not UX hint flag
  if (!isVaultUnlocked()) {
    return {error: {message: 'vault is locked, please unlock it first'} }
  }

  // ALWAYS get fresh account - never use cached value
  const activeAccount = await getCurrentAccount()

  if (!activeAccount) {
    return {error: {message: 'no private key found'} }
  }

  try {
    switch (type) {
      case 'getPublicKey': {
        return getPublicKey(activeAccount)
      }
      case 'signEvent': {
        const event = finalizeEvent(params.event, activeAccount)

        return validateEvent(event)
          ? event
          : {error: {message: 'invalid event'}}
      }
      case 'nip04.encrypt': {
        let {peer, plaintext} = params
        return nip04.encrypt(activeAccount, peer, plaintext)
      }
      case 'nip04.decrypt': {
        let {peer, ciphertext} = params
        return nip04.decrypt(activeAccount, peer, ciphertext)
      }
      case 'nip44.encrypt': {
        const {peer, plaintext} = params
        const key = getSharedSecret(activeAccount, peer)

        return nip44.v2.encrypt(plaintext, key)
      }
      case 'nip44.decrypt': {
        const {peer, ciphertext} = params
        const key = getSharedSecret(activeAccount, peer)

        return nip44.v2.decrypt(ciphertext, key)
      }
    }
  } catch (error) {
    return {error: {message: error.message, stack: error.stack}}
  }
}

async function handlePromptMessage({host, type, accept, conditions}, sender) {
  // return response
  openPrompt?.resolve?.(accept)

  // Only store permission if conditions is explicitly set (not null/undefined)
  // "authorize just this" passes null, "authorize forever" passes {remember: 'forever'}
  if (conditions !== null && conditions !== undefined && typeof conditions === 'object') {
    await updatePermission(host, type, accept, conditions)
  }

  // cleanup this
  openPrompt = null

  // release mutex here after updating policies
  releasePromptMutex()

  // close prompt
  if (sender) {
    browser.windows.remove(sender.tab.windowId)
  }
}

async function openSignUpWindow() {
  const {top, left} = await getPosition(width, height)

  browser.windows.create({
    url: `${browser.runtime.getURL('signup.html')}`,
    type: 'popup',
    width: width,
    height: height,
    top: top,
    left: left
  })
}
