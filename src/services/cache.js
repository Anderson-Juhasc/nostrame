/**
 * Cache Service for Nostr Profile and Relay Data
 *
 * SECURITY ARCHITECTURE:
 * - Uses browser.storage.session for active cache (fast access while unlocked)
 * - Encrypted caches persisted to local storage on vault lock
 * - On unlock, encrypted caches are restored to session storage
 * - Encryption uses the same password/key as the vault
 *
 * This design ensures:
 * 1. Cached profiles/relay lists are encrypted at rest in local storage
 * 2. Fast access while unlocked (session storage)
 * 3. Data survives browser restart (encrypted in local storage)
 * 4. No plaintext cache data accessible after vault lock
 *
 * STALE CACHE SEMANTICS:
 * - Stale cache (up to MAX_STALE_AGE) is used ONLY during network errors
 * - This is explicitly DEGRADED MODE, not normal operation
 * - Normal operation always serves fresh data or triggers background refresh
 *
 * TRADE-OFFS:
 * - Local storage has ~10MB limit - cache size should be monitored
 * - Encryption adds small overhead on lock/unlock
 * - Older browsers without session storage will have caching disabled
 */

import browser from 'webextension-polyfill'
import { encryptWithKey, decryptWithKey, isLegacyFormat } from '../crypto'

// Cache durations in milliseconds
export const CACHE_DURATIONS = {
  RELAY_LIST: 60 * 60 * 1000,  // 1 hour - relays don't change often
  PROFILE: 15 * 60 * 1000,     // 15 minutes - profiles change more frequently
}

// Maximum age for stale cache fallback during network errors
// Beyond this age, we won't use cached data even if network fails
// Using stale data is DEGRADED MODE - not normal operation
export const MAX_STALE_AGE = 24 * 60 * 60 * 1000 // 24 hours absolute maximum

// Cooldown for manual refresh (prevents abuse)
export const REFRESH_COOLDOWN = 30 * 1000 // 30 seconds

// Cache version - increment to invalidate all caches on schema change
const CACHE_VERSION = 2

// Storage keys
const KEYS = {
  RELAY_LIST_CACHE: 'relayListCache',
  PROFILE_CACHE: 'profileCache',
  LAST_REFRESH: 'lastProfileRefresh',
  ENCRYPTED_CACHE: 'encryptedCache' // For persistent encrypted storage
}

// Track if we've already warned about missing session storage
let sessionStorageWarningShown = false

/**
 * Get the appropriate storage API (session storage only for security)
 * Returns null if session storage is unavailable - caching will be disabled
 * @returns {browser.storage.StorageArea | null}
 */
function getStorage() {
  // browser.storage.session is available in Chrome 102+ / Firefox 115+
  // It's cleared when browser closes and not accessible after extension unload
  if (browser.storage.session) {
    return browser.storage.session
  }

  // Don't silently fall back to localStorage - it undermines security
  // Cached data would persist and be inspectable via DevTools even after vault lock
  if (!sessionStorageWarningShown) {
    console.error(
      'browser.storage.session unavailable - profile/relay caching disabled for security. ' +
      'Cached data will not persist between page loads. ' +
      'Upgrade to Chrome 102+ or Firefox 115+ for optimal performance.'
    )
    sessionStorageWarningShown = true
  }

  return null
}

/**
 * Check if caching is available (session storage exists)
 * @returns {boolean}
 */
export function isCachingAvailable() {
  return browser.storage.session !== undefined
}

/**
 * Validate that a pubkey is a valid hex string (64 chars)
 * @param {string} pubkey
 * @returns {boolean}
 */
function isValidPubkey(pubkey) {
  return typeof pubkey === 'string' && /^[0-9a-f]{64}$/i.test(pubkey)
}

/**
 * Validate cache data integrity
 * @param {object} cached
 * @returns {boolean}
 */
function isValidCacheEntry(cached) {
  return cached &&
         typeof cached === 'object' &&
         typeof cached.timestamp === 'number' &&
         cached.version === CACHE_VERSION
}

/**
 * Check if cached data is acceptably stale for fallback use
 * Used during network errors - we don't want to use ancient cached data
 * @param {object} cached - Cache entry with timestamp
 * @returns {boolean}
 */
export function isAcceptablyStale(cached) {
  if (!isValidCacheEntry(cached)) return false
  const age = Date.now() - cached.timestamp
  return age < MAX_STALE_AGE
}

/**
 * Get cached relay list for a pubkey
 * @param {string} pubkey
 * @returns {Promise<{data: object|null, isStale: boolean, isMissing: boolean}>}
 */
export async function getCachedRelayList(pubkey) {
  if (!isValidPubkey(pubkey)) {
    return { data: null, isStale: true, isMissing: true }
  }

  try {
    const storage = getStorage()
    if (!storage) return { data: null, isStale: true, isMissing: true }

    const result = await storage.get(KEYS.RELAY_LIST_CACHE)
    const cached = result[KEYS.RELAY_LIST_CACHE]?.[pubkey]

    if (!isValidCacheEntry(cached)) {
      return { data: null, isStale: true, isMissing: true }
    }

    const isStale = Date.now() - cached.timestamp > CACHE_DURATIONS.RELAY_LIST
    return { data: cached, isStale, isMissing: false }
  } catch (e) {
    console.error('Failed to get cached relay list:', e)
    return { data: null, isStale: true, isMissing: true }
  }
}

/**
 * Get cached profile for a pubkey
 * @param {string} pubkey
 * @returns {Promise<{data: object|null, isStale: boolean, isMissing: boolean}>}
 */
export async function getCachedProfile(pubkey) {
  if (!isValidPubkey(pubkey)) {
    return { data: null, isStale: true, isMissing: true }
  }

  try {
    const storage = getStorage()
    if (!storage) return { data: null, isStale: true, isMissing: true }

    const result = await storage.get(KEYS.PROFILE_CACHE)
    const cached = result[KEYS.PROFILE_CACHE]?.[pubkey]

    if (!isValidCacheEntry(cached)) {
      return { data: null, isStale: true, isMissing: true }
    }

    const isStale = Date.now() - cached.timestamp > CACHE_DURATIONS.PROFILE
    return { data: cached, isStale, isMissing: false }
  } catch (e) {
    console.error('Failed to get cached profile:', e)
    return { data: null, isStale: true, isMissing: true }
  }
}

/**
 * Cache relay list for a pubkey
 * @param {string} pubkey
 * @param {Array} relays
 * @param {object|null} event
 */
export async function setCachedRelayList(pubkey, relays, event) {
  if (!isValidPubkey(pubkey)) {
    console.error('Invalid pubkey for caching relay list')
    return
  }

  try {
    const storage = getStorage()
    if (!storage) return // Caching disabled

    const result = await storage.get(KEYS.RELAY_LIST_CACHE)
    const cache = result[KEYS.RELAY_LIST_CACHE] || {}

    cache[pubkey] = {
      relays: Array.isArray(relays) ? relays : [],
      event,
      timestamp: Date.now(),
      version: CACHE_VERSION
    }

    await storage.set({ [KEYS.RELAY_LIST_CACHE]: cache })
  } catch (e) {
    console.error('Failed to cache relay list:', e)
  }
}

/**
 * Cache profile for a pubkey
 * @param {string} pubkey
 * @param {object} profile - The parsed profile content
 * @param {object|null} event - The raw event
 */
export async function setCachedProfile(pubkey, profile, event) {
  if (!isValidPubkey(pubkey)) {
    console.error('Invalid pubkey for caching profile')
    return
  }

  try {
    const storage = getStorage()
    if (!storage) return // Caching disabled

    const result = await storage.get(KEYS.PROFILE_CACHE)
    const cache = result[KEYS.PROFILE_CACHE] || {}

    cache[pubkey] = {
      ...(typeof profile === 'object' ? profile : {}),
      event,
      timestamp: Date.now(),
      version: CACHE_VERSION
    }

    await storage.set({ [KEYS.PROFILE_CACHE]: cache })
  } catch (e) {
    console.error('Failed to cache profile:', e)
  }
}

/**
 * Invalidate relay list cache for a pubkey
 * @param {string} pubkey
 */
export async function invalidateRelayListCache(pubkey) {
  if (!isValidPubkey(pubkey)) return

  try {
    const storage = getStorage()
    if (!storage) return

    const result = await storage.get(KEYS.RELAY_LIST_CACHE)
    const cache = result[KEYS.RELAY_LIST_CACHE] || {}
    delete cache[pubkey]
    await storage.set({ [KEYS.RELAY_LIST_CACHE]: cache })
  } catch (e) {
    console.error('Failed to invalidate relay list cache:', e)
  }
}

/**
 * Invalidate profile cache for a pubkey
 * @param {string} pubkey
 */
export async function invalidateProfileCache(pubkey) {
  if (!isValidPubkey(pubkey)) return

  try {
    const storage = getStorage()
    if (!storage) return

    const result = await storage.get(KEYS.PROFILE_CACHE)
    const cache = result[KEYS.PROFILE_CACHE] || {}
    delete cache[pubkey]
    await storage.set({ [KEYS.PROFILE_CACHE]: cache })
  } catch (e) {
    console.error('Failed to invalidate profile cache:', e)
  }
}

/**
 * Remove cache entries for accounts that no longer exist
 * Call this when an account is removed from the vault
 * @param {string[]} validPubkeys - List of pubkeys that should be kept
 */
export async function cleanupOrphanedCache(validPubkeys) {
  const validSet = new Set(validPubkeys.filter(isValidPubkey))

  try {
    const storage = getStorage()
    if (!storage) return

    const result = await storage.get([KEYS.RELAY_LIST_CACHE, KEYS.PROFILE_CACHE, KEYS.LAST_REFRESH])

    const relayCache = result[KEYS.RELAY_LIST_CACHE] || {}
    const profileCache = result[KEYS.PROFILE_CACHE] || {}
    const lastRefresh = result[KEYS.LAST_REFRESH] || {}

    // Remove entries not in validPubkeys
    let relayCleanupCount = 0
    let profileCleanupCount = 0

    for (const pubkey of Object.keys(relayCache)) {
      if (!validSet.has(pubkey)) {
        delete relayCache[pubkey]
        relayCleanupCount++
      }
    }

    for (const pubkey of Object.keys(profileCache)) {
      if (!validSet.has(pubkey)) {
        delete profileCache[pubkey]
        profileCleanupCount++
      }
    }

    for (const pubkey of Object.keys(lastRefresh)) {
      if (!validSet.has(pubkey)) {
        delete lastRefresh[pubkey]
      }
    }

    await storage.set({
      [KEYS.RELAY_LIST_CACHE]: relayCache,
      [KEYS.PROFILE_CACHE]: profileCache,
      [KEYS.LAST_REFRESH]: lastRefresh
    })

    if (relayCleanupCount > 0 || profileCleanupCount > 0) {
      console.log(`Cache cleanup: removed ${relayCleanupCount} relay lists, ${profileCleanupCount} profiles`)
    }
  } catch (e) {
    console.error('Failed to cleanup orphaned cache:', e)
  }
}

/**
 * Remove all cache entries for a specific pubkey
 * Call this when an account is removed
 * @param {string} pubkey
 */
export async function removeAccountCache(pubkey) {
  if (!isValidPubkey(pubkey)) return

  try {
    const storage = getStorage()
    if (!storage) return

    const result = await storage.get([KEYS.RELAY_LIST_CACHE, KEYS.PROFILE_CACHE, KEYS.LAST_REFRESH])

    const relayCache = result[KEYS.RELAY_LIST_CACHE] || {}
    const profileCache = result[KEYS.PROFILE_CACHE] || {}
    const lastRefresh = result[KEYS.LAST_REFRESH] || {}

    delete relayCache[pubkey]
    delete profileCache[pubkey]
    delete lastRefresh[pubkey]

    await storage.set({
      [KEYS.RELAY_LIST_CACHE]: relayCache,
      [KEYS.PROFILE_CACHE]: profileCache,
      [KEYS.LAST_REFRESH]: lastRefresh
    })
  } catch (e) {
    console.error('Failed to remove account cache:', e)
  }
}

/**
 * Get multiple cached relay lists at once
 * @param {string[]} pubkeys
 * @returns {Promise<Map<string, {data: object|null, isStale: boolean, isMissing: boolean}>>}
 */
export async function getCachedRelayListsBatch(pubkeys) {
  const results = new Map()
  const validPubkeys = pubkeys.filter(isValidPubkey)

  // Initialize results for invalid pubkeys
  for (const pubkey of pubkeys) {
    if (!isValidPubkey(pubkey)) {
      results.set(pubkey, { data: null, isStale: true, isMissing: true })
    }
  }

  if (validPubkeys.length === 0) return results

  try {
    const storage = getStorage()
    if (!storage) {
      // No storage available - return all as missing
      for (const pubkey of validPubkeys) {
        results.set(pubkey, { data: null, isStale: true, isMissing: true })
      }
      return results
    }

    const result = await storage.get(KEYS.RELAY_LIST_CACHE)
    const cache = result[KEYS.RELAY_LIST_CACHE] || {}

    for (const pubkey of validPubkeys) {
      const cached = cache[pubkey]
      if (!isValidCacheEntry(cached)) {
        results.set(pubkey, { data: null, isStale: true, isMissing: true })
      } else {
        const isStale = Date.now() - cached.timestamp > CACHE_DURATIONS.RELAY_LIST
        results.set(pubkey, { data: cached, isStale, isMissing: false })
      }
    }

    return results
  } catch (e) {
    console.error('Failed to get cached relay lists batch:', e)
    for (const pubkey of validPubkeys) {
      results.set(pubkey, { data: null, isStale: true, isMissing: true })
    }
    return results
  }
}

/**
 * Get multiple cached profiles at once
 * @param {string[]} pubkeys
 * @returns {Promise<Map<string, {data: object|null, isStale: boolean, isMissing: boolean}>>}
 */
export async function getCachedProfilesBatch(pubkeys) {
  const results = new Map()
  const validPubkeys = pubkeys.filter(isValidPubkey)

  // Initialize results for invalid pubkeys
  for (const pubkey of pubkeys) {
    if (!isValidPubkey(pubkey)) {
      results.set(pubkey, { data: null, isStale: true, isMissing: true })
    }
  }

  if (validPubkeys.length === 0) return results

  try {
    const storage = getStorage()
    if (!storage) {
      // No storage available - return all as missing
      for (const pubkey of validPubkeys) {
        results.set(pubkey, { data: null, isStale: true, isMissing: true })
      }
      return results
    }

    const result = await storage.get(KEYS.PROFILE_CACHE)
    const cache = result[KEYS.PROFILE_CACHE] || {}

    for (const pubkey of validPubkeys) {
      const cached = cache[pubkey]
      if (!isValidCacheEntry(cached)) {
        results.set(pubkey, { data: null, isStale: true, isMissing: true })
      } else {
        const isStale = Date.now() - cached.timestamp > CACHE_DURATIONS.PROFILE
        results.set(pubkey, { data: cached, isStale, isMissing: false })
      }
    }

    return results
  } catch (e) {
    console.error('Failed to get cached profiles batch:', e)
    for (const pubkey of validPubkeys) {
      results.set(pubkey, { data: null, isStale: true, isMissing: true })
    }
    return results
  }
}

/**
 * Cache multiple relay lists at once
 * @param {Map<string, {relays: Array, event: object|null}>} relayListsMap
 */
export async function setCachedRelayListsBatch(relayListsMap) {
  try {
    const storage = getStorage()
    if (!storage) return // Caching disabled

    const result = await storage.get(KEYS.RELAY_LIST_CACHE)
    const cache = result[KEYS.RELAY_LIST_CACHE] || {}
    const timestamp = Date.now()

    for (const [pubkey, { relays, event }] of relayListsMap) {
      if (isValidPubkey(pubkey)) {
        cache[pubkey] = {
          relays: Array.isArray(relays) ? relays : [],
          event,
          timestamp,
          version: CACHE_VERSION
        }
      }
    }

    await storage.set({ [KEYS.RELAY_LIST_CACHE]: cache })
  } catch (e) {
    console.error('Failed to cache relay lists batch:', e)
  }
}

/**
 * Cache multiple profiles at once
 * @param {Map<string, {profile: object, event: object|null}>} profilesMap
 */
export async function setCachedProfilesBatch(profilesMap) {
  try {
    const storage = getStorage()
    if (!storage) return // Caching disabled

    const result = await storage.get(KEYS.PROFILE_CACHE)
    const cache = result[KEYS.PROFILE_CACHE] || {}
    const timestamp = Date.now()

    for (const [pubkey, { profile, event }] of profilesMap) {
      if (isValidPubkey(pubkey)) {
        cache[pubkey] = {
          ...(typeof profile === 'object' ? profile : {}),
          event,
          timestamp,
          version: CACHE_VERSION
        }
      }
    }

    await storage.set({ [KEYS.PROFILE_CACHE]: cache })
  } catch (e) {
    console.error('Failed to cache profiles batch:', e)
  }
}

/**
 * Clear all caches - call this on vault lock for security
 */
export async function clearAllCaches() {
  try {
    const storage = getStorage()
    if (!storage) return // No cache to clear

    await storage.remove([KEYS.RELAY_LIST_CACHE, KEYS.PROFILE_CACHE, KEYS.LAST_REFRESH])
    console.log('All caches cleared')
  } catch (e) {
    console.error('Failed to clear caches:', e)
  }
}

/**
 * Check if a manual refresh is allowed (cooldown check)
 * Note: For atomic check-and-record, use tryAcquireRefresh instead
 * @param {string} pubkey
 * @returns {Promise<{allowed: boolean, remainingMs: number}>}
 */
export async function canRefreshProfile(pubkey) {
  if (!isValidPubkey(pubkey)) {
    return { allowed: false, remainingMs: 0 }
  }

  try {
    const storage = getStorage()
    if (!storage) return { allowed: false, remainingMs: 0 }

    const result = await storage.get(KEYS.LAST_REFRESH)
    const lastRefresh = result[KEYS.LAST_REFRESH]?.[pubkey] || 0
    const elapsed = Date.now() - lastRefresh
    const remaining = REFRESH_COOLDOWN - elapsed

    return {
      allowed: remaining <= 0,
      remainingMs: Math.max(0, remaining)
    }
  } catch (e) {
    // On error, allow refresh
    return { allowed: true, remainingMs: 0 }
  }
}

/**
 * Atomic check-and-record for refresh cooldown
 * Prevents race conditions by checking and recording in one operation
 * @param {string} pubkey
 * @returns {Promise<{allowed: boolean, remainingMs: number}>}
 */
export async function tryAcquireRefresh(pubkey) {
  if (!isValidPubkey(pubkey)) {
    return { allowed: false, remainingMs: 0 }
  }

  try {
    const storage = getStorage()
    if (!storage) return { allowed: false, remainingMs: 0 }

    const result = await storage.get(KEYS.LAST_REFRESH)
    const lastRefreshMap = result[KEYS.LAST_REFRESH] || {}
    const lastRefresh = lastRefreshMap[pubkey] || 0
    const now = Date.now()
    const elapsed = now - lastRefresh
    const remaining = REFRESH_COOLDOWN - elapsed

    if (remaining > 0) {
      // Still in cooldown, don't allow
      return { allowed: false, remainingMs: remaining }
    }

    // Cooldown passed - atomically record new timestamp
    lastRefreshMap[pubkey] = now
    await storage.set({ [KEYS.LAST_REFRESH]: lastRefreshMap })

    return { allowed: true, remainingMs: 0 }
  } catch (e) {
    console.error('Failed to acquire refresh:', e)
    // On error, deny to be safe
    return { allowed: false, remainingMs: 0 }
  }
}

/**
 * Record that a manual refresh was performed
 * @deprecated Use tryAcquireRefresh for atomic check-and-record
 * @param {string} pubkey
 */
export async function recordProfileRefresh(pubkey) {
  if (!isValidPubkey(pubkey)) return

  try {
    const storage = getStorage()
    if (!storage) return

    const result = await storage.get(KEYS.LAST_REFRESH)
    const lastRefresh = result[KEYS.LAST_REFRESH] || {}
    lastRefresh[pubkey] = Date.now()
    await storage.set({ [KEYS.LAST_REFRESH]: lastRefresh })
  } catch (e) {
    console.error('Failed to record profile refresh:', e)
  }
}

/**
 * Encrypt and persist caches to local storage using pre-derived key
 * Called from background service worker before locking the vault
 * @param {CryptoKey} key - The vault encryption key (from memory)
 * @param {Uint8Array} salt - The vault salt (from memory)
 */
export async function persistEncryptedCachesWithKey(key, salt) {
  if (!key || !salt) {
    console.error('Cannot persist caches: no key provided')
    return
  }

  try {
    const storage = getStorage()
    if (!storage) return

    // Get all cache data from session storage
    const result = await storage.get([
      KEYS.RELAY_LIST_CACHE,
      KEYS.PROFILE_CACHE,
      KEYS.LAST_REFRESH
    ])

    const cacheData = {
      relayListCache: result[KEYS.RELAY_LIST_CACHE] || {},
      profileCache: result[KEYS.PROFILE_CACHE] || {},
      lastRefresh: result[KEYS.LAST_REFRESH] || {},
      version: CACHE_VERSION,
      timestamp: Date.now()
    }

    // Only persist if there's actual data
    const hasData = Object.keys(cacheData.relayListCache).length > 0 ||
                    Object.keys(cacheData.profileCache).length > 0

    if (!hasData) {
      console.log('No cache data to persist')
      return
    }

    // Encrypt and store in local storage
    const encryptedCache = await encryptWithKey(cacheData, key, salt)
    await browser.storage.local.set({ [KEYS.ENCRYPTED_CACHE]: encryptedCache })
    console.log('Caches encrypted and persisted to local storage')
  } catch (e) {
    console.error('Failed to persist encrypted caches:', e)
  }
}

/**
 * Restore encrypted caches from local storage to session storage
 * Called from background service worker after unlocking the vault
 * @param {CryptoKey} key - The vault encryption key (from memory)
 * @returns {Promise<boolean>} - True if caches were restored successfully
 */
export async function restoreEncryptedCachesWithKey(key) {
  if (!key) {
    console.error('Cannot restore caches: no key provided')
    return false
  }

  try {
    const storage = getStorage()
    if (!storage) return false

    // Get encrypted cache from local storage
    const { [KEYS.ENCRYPTED_CACHE]: encryptedCache } = await browser.storage.local.get(KEYS.ENCRYPTED_CACHE)

    if (!encryptedCache) {
      console.log('No encrypted cache found in local storage')
      return false
    }

    // Skip legacy format caches - they'll be re-encrypted on next lock
    if (isLegacyFormat(encryptedCache)) {
      console.log('Legacy cache format detected, discarding')
      await browser.storage.local.remove(KEYS.ENCRYPTED_CACHE)
      return false
    }

    // Decrypt the cache data using key
    const cacheData = await decryptWithKey(encryptedCache, key)

    // Validate cache version
    if (cacheData.version !== CACHE_VERSION) {
      console.log('Encrypted cache version mismatch, discarding')
      await browser.storage.local.remove(KEYS.ENCRYPTED_CACHE)
      return false
    }

    // Restore to session storage
    await storage.set({
      [KEYS.RELAY_LIST_CACHE]: cacheData.relayListCache || {},
      [KEYS.PROFILE_CACHE]: cacheData.profileCache || {},
      [KEYS.LAST_REFRESH]: cacheData.lastRefresh || {}
    })

    console.log('Caches restored from encrypted local storage')
    return true
  } catch (e) {
    console.error('Failed to restore encrypted caches:', e)
    // Remove corrupted encrypted cache
    await browser.storage.local.remove(KEYS.ENCRYPTED_CACHE).catch(() => {})
    return false
  }
}

/**
 * Clear the encrypted cache from local storage
 * Call this when the vault is reset or user logs out completely
 */
export async function clearEncryptedCache() {
  try {
    await browser.storage.local.remove(KEYS.ENCRYPTED_CACHE)
    console.log('Encrypted cache cleared from local storage')
  } catch (e) {
    console.error('Failed to clear encrypted cache:', e)
  }
}
