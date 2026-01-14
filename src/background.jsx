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
  isLegacyFormat
} from './crypto'

// Non-crypto utilities
import {
  NO_PERMISSIONS_REQUIRED,
  getPermissionStatus,
  updatePermission,
  showNotification,
  getPosition,
  getSessionVault,
  setSessionVault,
  clearSessionVault
} from './common'

import { clearAllCaches as clearProfileCaches, persistEncryptedCachesWithKey, restoreEncryptedCachesWithKey } from './services/cache'
import { closeDiscoveryPool } from './helpers/outbox'

let openPrompt = null
let promptMutex = new Mutex()
let releasePromptMutex = () => {}
let secretsCache = new LRUCache(100)
let lastUsedAccount = null

// ============================================================================
// IN-MEMORY KEY STORAGE - Keys are wiped when service worker terminates
// This is the security boundary - keys NEVER leave this scope
// ============================================================================
let vaultKey = null      // CryptoKey - non-extractable AES-GCM key
let vaultSalt = null     // Uint8Array - salt for key derivation

/**
 * Check if the vault is unlocked (key is in memory)
 */
function isVaultUnlocked() {
  return vaultKey !== null && vaultSalt !== null
}

/**
 * Clear the in-memory key (called on lock or service worker termination)
 */
function clearVaultKey() {
  vaultKey = null
  vaultSalt = null
}

// Auto-lock timeout (default 5 minutes in milliseconds, converted to minutes for alarms API)
const DEFAULT_LOCK_TIMEOUT = 5 * 60 * 1000
const LOCK_ALARM_NAME = 'autoLockAlarm'

// ============================================================================
// KEEP-ALIVE MECHANISM
// Prevents Chrome from terminating the service worker while vault is unlocked.
// This maintains Bitwarden-like session persistence.
// ============================================================================
const KEEPALIVE_ALARM_NAME = 'keepAliveAlarm'
const KEEPALIVE_INTERVAL_MINUTES = 0.4  // ~24 seconds (under Chrome's 30s idle limit)

/**
 * Start the keep-alive alarm to prevent service worker termination.
 * Called when vault is unlocked.
 *
 * SECURITY NOTE: This does NOT store any sensitive data.
 * It simply keeps the service worker process alive so that
 * the in-memory vaultKey is not garbage collected.
 */
function startKeepAlive() {
  chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
    periodInMinutes: KEEPALIVE_INTERVAL_MINUTES
  })
}

/**
 * Stop the keep-alive alarm.
 * Called when vault is locked (explicit or auto-lock).
 * Once stopped, the service worker can terminate normally.
 */
function stopKeepAlive() {
  chrome.alarms.clear(KEEPALIVE_ALARM_NAME)
}

// Track active UI connections (popup/options pages)
let activeConnections = new Set()

async function lockVault() {
  const { isAuthenticated } = await browser.storage.local.get(['isAuthenticated'])
  if (!isAuthenticated) return // Don't lock if not authenticated

  // Stop keep-alive - allow service worker to terminate after lock
  stopKeepAlive()

  // Persist encrypted caches before clearing (if key is still in memory)
  if (isVaultUnlocked()) {
    await persistEncryptedCachesWithKey(vaultKey, vaultSalt)
  }

  // CRITICAL: Clear the in-memory key
  clearVaultKey()

  await clearSessionVault()
  await browser.storage.local.set({ isLocked: true })
  clearAllCaches()
}

async function resetLockTimer() {
  // Clear any existing alarm
  await chrome.alarms.clear(LOCK_ALARM_NAME)

  // Don't start timer if UI is actively open (popup or options page)
  if (activeConnections.size > 0) return

  // Check if vault is unlocked before setting timer
  const { isLocked, isAuthenticated } = await browser.storage.local.get(['isLocked', 'isAuthenticated'])
  if (!isAuthenticated || isLocked) return

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

// Always get fresh account from session storage - NEVER cache
async function getCurrentAccount() {
  const vault = await getSessionVault()
  if (!vault || !vault.accountDefault) {
    return null
  }
  return vault.accountDefault
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
    case 'UNLOCK_VAULT':
      return handleUnlockVault(message.password)
    case 'LOCK_VAULT':
      await lockVault()
      return { success: true }
    case 'GET_LOCK_STATUS':
      return { unlocked: isVaultUnlocked() }
    case 'ENCRYPT_VAULT':
      return handleEncryptVault(message.data)
    case 'CREATE_NEW_VAULT':
      return handleCreateNewVault(message.password, message.vaultData)
    case 'CHANGE_PASSWORD':
      return handleChangePassword(message.oldPassword, message.newPassword)
    case 'IMPORT_VAULT_BACKUP':
      return handleImportVaultBackup(message.encryptedVault, message.password)
    case 'DECRYPT_VAULT_WITH_PASSWORD':
      return handleDecryptVaultWithPassword(message.password)
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
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function handleUnlockVault(password) {
  try {
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])
    if (!encryptedVault) {
      return { success: false, error: 'No vault found' }
    }

    // Check if legacy format - need migration
    if (isLegacyFormat(encryptedVault)) {
      // Decrypt with legacy format (10k iterations, AES-CBC)
      const vaultData = await decryptLegacy(encryptedVault, password)

      // Generate new key with strong parameters for future use
      const { key, salt } = await deriveNewKey(password)
      vaultKey = key
      vaultSalt = salt

      // Re-encrypt with new format immediately
      const newEncryptedVault = await encryptWithKey(vaultData, vaultKey, vaultSalt)
      await browser.storage.local.set({ encryptedVault: newEncryptedVault })

      // Store decrypted vault in session
      await setSessionVault(vaultData)
      await browser.storage.local.set({ isLocked: false })

      // Restore encrypted caches (will be empty for legacy, that's ok)
      await restoreEncryptedCachesWithKey(vaultKey)

      // Start keep-alive to maintain session
      startKeepAlive()

      return { success: true, migrated: true }
    }

    // v2 format - derive key from existing salt
    const { key, salt } = await deriveKeyFromEncryptedVault(password, encryptedVault)
    vaultKey = key
    vaultSalt = salt

    // Decrypt vault using already-derived key (avoid double derivation)
    const vaultData = await decryptWithKey(encryptedVault, vaultKey)

    // Store decrypted vault in session
    await setSessionVault(vaultData)
    await browser.storage.local.set({ isLocked: false })

    // Restore encrypted caches from local storage
    await restoreEncryptedCachesWithKey(vaultKey)

    // Start keep-alive to maintain session
    startKeepAlive()

    return { success: true }
  } catch (err) {
    // Clear any partial state on failure
    clearVaultKey()
    console.error('Unlock vault error:', err)
    return { success: false, error: 'Invalid password' }
  }
}

/**
 * Handle vault encryption - encrypts data using in-memory key
 * @param {any} data - Data to encrypt
 * @returns {Promise<{success: boolean, encryptedData?: string, error?: string}>}
 */
async function handleEncryptVault(data) {
  if (!isVaultUnlocked()) {
    return { success: false, error: 'Vault is locked' }
  }

  try {
    const encryptedData = await encryptWithKey(data, vaultKey, vaultSalt)
    return { success: true, encryptedData }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Handle new vault creation - generates new key and encrypts vault
 * @param {string} password - User's password
 * @param {any} vaultData - Initial vault data
 * @returns {Promise<{success: boolean, encryptedVault?: string, error?: string}>}
 */
async function handleCreateNewVault(password, vaultData) {
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
    return { success: false, error: err.message }
  }
}

/**
 * Handle password change - verifies old password, re-encrypts with new password
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
    const { key, salt } = await deriveNewKey(newPassword)

    // Update in-memory key
    vaultKey = key
    vaultSalt = salt

    // Re-encrypt vault with new key
    const newEncryptedVault = await encryptWithKey(vaultData, vaultKey, vaultSalt)

    // Re-encrypt caches with new key
    await persistEncryptedCachesWithKey(vaultKey, vaultSalt)

    return { success: true, encryptedVault: newEncryptedVault }
  } catch (err) {
    return { success: false, error: 'Current password is incorrect' }
  }
}

/**
 * Handle vault backup import - decrypts backup, stores key, returns vault data
 * @param {string} encryptedVault - Encrypted vault from backup file
 * @param {string} password - Password to decrypt the backup
 * @returns {Promise<{success: boolean, vaultData?: any, encryptedVault?: string, error?: string}>}
 */
async function handleImportVaultBackup(encryptedVault, password) {
  try {
    // Check if legacy format
    if (isLegacyFormat(encryptedVault)) {
      // Decrypt with legacy format (10k iterations, AES-CBC)
      const vaultData = await decryptLegacy(encryptedVault, password)

      // Generate new key for storage
      const { key, salt } = await deriveNewKey(password)
      vaultKey = key
      vaultSalt = salt

      // Re-encrypt with new format
      const newEncryptedVault = await encryptWithKey(vaultData, vaultKey, vaultSalt)

      // Store decrypted vault in session
      await setSessionVault(vaultData)

      return { success: true, vaultData, encryptedVault: newEncryptedVault, migrated: true }
    }

    // v2 format - derive key from existing salt
    const { key, salt } = await deriveKeyFromEncryptedVault(password, encryptedVault)
    vaultKey = key
    vaultSalt = salt

    // Decrypt vault using already-derived key (avoid double derivation)
    const vaultData = await decryptWithKey(encryptedVault, vaultKey)

    // Store decrypted vault in session
    await setSessionVault(vaultData)

    return { success: true, vaultData, encryptedVault }
  } catch (err) {
    clearVaultKey()
    console.error('Import vault backup error:', err)
    return { success: false, error: 'Invalid vault file or wrong password' }
  }
}

/**
 * Handle decrypt vault with password - verifies password without changing state
 * Used for viewing secrets (requires password re-entry for security)
 * @param {string} password - Password to verify
 * @returns {Promise<{success: boolean, vaultData?: any, error?: string}>}
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
  // Clear all caches when vault changes (account switch) or vault locks
  if (area === 'session' && changes.vault) {
    clearAllCaches()
    resetLockTimer() // Reset timer on vault activity
  }
  if (changes.isLocked?.newValue === true) {
    clearAllCaches()
    chrome.alarms.clear(LOCK_ALARM_NAME)
  }
  // Reset timer when vault is unlocked
  if (changes.isLocked?.newValue === false) {
    resetLockTimer()
  }
})

// Chrome-specific listener for session storage (polyfill may not handle it)
if (globalThis.chrome?.storage?.onChanged) {
  globalThis.chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.vault) {
      clearAllCaches()
    }
  })
}

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
  let { isLocked } = await browser.storage.local.get(['isLocked'])

  if (isLocked) {
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
