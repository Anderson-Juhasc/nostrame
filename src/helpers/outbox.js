/**
 * Outbox Model Implementation
 *
 * IMPORTANT ARCHITECTURAL NOTE:
 * The outbox model is a RELAY ROUTING PATTERN, not a protocol defined by NIP-65.
 *
 * - NIP-65 (kind 10002) defines HOW users publish their relay preferences
 * - The outbox model defines HOW CLIENTS USE that information:
 *   → When fetching a user's content, query THEIR write relays (where they publish)
 *   → Never fetch another user's profile from your own relays
 *
 * This distinction is critical for correct Nostr client behavior.
 */

import { SimplePool } from 'nostr-tools/pool'
import { verifyEvent } from 'nostr-tools/pure'
import { DEFAULT_RELAYS } from '../common'
import {
  getCachedRelayList,
  setCachedRelayList,
  getCachedRelayListsBatch,
  setCachedRelayListsBatch,
  invalidateRelayListCache,
  isAcceptablyStale
} from '../services/cache'

// Discovery relays known to index kind 10002 events
// These are semi-trusted bootstrap relays used only for relay list discovery
export const DISCOVERY_RELAYS = [
  'wss://purplepag.es/',
  'wss://relay.damus.io/',
  'wss://nos.lol/',
  'wss://nostr.wine/',
]

// Maximum allowed clock skew for event timestamps (5 minutes into future)
const MAX_FUTURE_TIMESTAMP = 5 * 60

// Create a dedicated pool for relay discovery
// Intentionally reused across requests for connection efficiency
// Must be closed on vault lock via closeDiscoveryPool()
const discoveryPool = new SimplePool({
  eoseSubTimeout: 5000,
  getTimeout: 5000
})

// In-flight request deduplication map
// Prevents duplicate network requests for the same pubkey
const pendingRequests = new Map()

/**
 * Validate a relay URL
 * @param {string} url
 * @returns {boolean}
 */
export function isValidRelayUrl(url) {
  if (typeof url !== 'string') return false

  try {
    const parsed = new URL(url)
    // Must be wss:// or ws:// (for local testing)
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') {
      return false
    }
    // Must have a hostname
    if (!parsed.hostname) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Get relays to query for NIP-65 discovery (kind 10002)
 * Only uses directory relays that index relay lists, not default relays
 * Default relays are only used as fallback when no kind 10002 is found
 * @returns {string[]}
 */
export function getDiscoveryRelays() {
  return DISCOVERY_RELAYS
}

/**
 * Close discovery pool connections
 * MUST be called on vault lock to prevent connection leaks
 * and ensure no cached connections remain accessible
 */
export function closeDiscoveryPool() {
  try {
    discoveryPool.close(DISCOVERY_RELAYS)
    pendingRequests.clear()
    console.log('Discovery pool connections closed')
  } catch (error) {
    console.error('Failed to close discovery pool:', error)
  }
}

/**
 * Fetch kind 10002 (relay list) event for a pubkey
 * Implements in-flight request deduplication to prevent duplicate network requests
 *
 * @param {string} pubkey - The public key in hex format
 * @param {boolean} forceRefresh - Force fresh fetch, ignoring cache
 * @returns {Promise<{relays: Array<{url: string, read: boolean, write: boolean}>, event: object|null, fromCache: boolean, degraded?: boolean}>}
 */
export async function fetchRelayList(pubkey, forceRefresh = false) {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const { data: cached, isStale } = await getCachedRelayList(pubkey)
    if (cached && !isStale) {
      return { relays: cached.relays, event: cached.event, fromCache: true }
    }
  }

  // In-flight request deduplication
  // If a request for this pubkey is already in progress, return the same promise
  const cacheKey = `${pubkey}:${forceRefresh}`
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)
  }

  const requestPromise = fetchRelayListInternal(pubkey, forceRefresh)
  pendingRequests.set(cacheKey, requestPromise)

  try {
    return await requestPromise
  } finally {
    pendingRequests.delete(cacheKey)
  }
}

/**
 * Internal implementation of relay list fetching
 * @private
 */
async function fetchRelayListInternal(pubkey, forceRefresh) {
  try {
    const allRelays = getDiscoveryRelays()

    const events = await discoveryPool.querySync(allRelays, {
      kinds: [10002],
      authors: [pubkey],
      limit: 5 // Fetch multiple to handle duplicates from different relays
    })

    // Filter to valid, verified events and select most recent
    const now = Math.floor(Date.now() / 1000)
    const validEvents = events.filter(event => {
      // Reject events with timestamps too far in the future (clock skew protection)
      if (event.created_at > now + MAX_FUTURE_TIMESTAMP) {
        console.warn(`Rejecting kind 10002 with future timestamp: ${event.created_at}`)
        return false
      }
      // Verify cryptographic signature
      if (!verifyEvent(event)) {
        console.warn(`Rejecting kind 10002 with invalid signature for ${pubkey.slice(0, 8)}...`)
        return false
      }
      return true
    })

    // Get the most recent valid event
    const event = validEvents.length > 0
      ? validEvents.reduce((latest, e) => e.created_at > latest.created_at ? e : latest)
      : null

    const relays = event ? parseRelayListEvent(event) : []

    // Cache the result
    await setCachedRelayList(pubkey, relays, event)

    return { relays, event, fromCache: false }
  } catch (error) {
    console.error('Failed to fetch relay list:', error)

    // On error, try to return stale cache if acceptably fresh (< 24 hours)
    // This is DEGRADED MODE - not normal operation
    const { data: cached } = await getCachedRelayList(pubkey)
    if (cached && isAcceptablyStale(cached)) {
      console.warn(`DEGRADED MODE: Using stale cache for relay list (${pubkey.slice(0, 8)}...)`)
      return { relays: cached.relays, event: cached.event, fromCache: true, degraded: true }
    }

    // Cache too old or missing - return empty (will use default relays)
    return { relays: [], event: null, fromCache: false }
  }
}

/**
 * Batch fetch kind 10002 events for multiple pubkeys
 * Uses cache for fresh entries, fetches stale/missing in one query
 * All events are cryptographically verified before use
 *
 * @param {string[]} pubkeys - Array of public keys
 * @param {boolean} forceRefresh - Force fresh fetch for all
 * @returns {Promise<Map<string, {relays: Array, event: object|null}>>}
 */
export async function fetchRelayListsBatch(pubkeys, forceRefresh = false) {
  const results = new Map()
  const pubkeysToFetch = []

  // Check cache first
  if (!forceRefresh) {
    const cachedResults = await getCachedRelayListsBatch(pubkeys)

    for (const [pubkey, { data, isStale }] of cachedResults) {
      if (data && !isStale) {
        results.set(pubkey, { relays: data.relays, event: data.event })
      } else {
        pubkeysToFetch.push(pubkey)
      }
    }
  } else {
    pubkeysToFetch.push(...pubkeys)
  }

  // Fetch missing/stale entries in one batch query
  if (pubkeysToFetch.length > 0) {
    try {
      const allRelays = getDiscoveryRelays()

      const events = await discoveryPool.querySync(allRelays, {
        kinds: [10002],
        authors: pubkeysToFetch
      })

      const now = Math.floor(Date.now() / 1000)

      // Group events by pubkey, keep most recent VALID event
      const eventsByPubkey = new Map()
      for (const event of events) {
        // Reject events with timestamps too far in the future
        if (event.created_at > now + MAX_FUTURE_TIMESTAMP) {
          console.warn(`Rejecting kind 10002 with future timestamp: ${event.created_at}`)
          continue
        }
        // Verify cryptographic signature (CRITICAL SECURITY CHECK)
        if (!verifyEvent(event)) {
          console.warn(`Rejecting kind 10002 with invalid signature for ${event.pubkey?.slice(0, 8)}...`)
          continue
        }

        const existing = eventsByPubkey.get(event.pubkey)
        if (!existing || event.created_at > existing.created_at) {
          eventsByPubkey.set(event.pubkey, event)
        }
      }

      // Process results and prepare cache updates
      const cacheUpdates = new Map()

      for (const pubkey of pubkeysToFetch) {
        const event = eventsByPubkey.get(pubkey) || null
        const relays = event ? parseRelayListEvent(event) : []

        results.set(pubkey, { relays, event })
        cacheUpdates.set(pubkey, { relays, event })
      }

      // Batch update cache
      await setCachedRelayListsBatch(cacheUpdates)
    } catch (error) {
      console.error('Failed to batch fetch relay lists:', error)

      // For failed fetches, try stale cache if acceptably fresh (< 24 hours)
      // This is DEGRADED MODE - not normal operation
      const staleCache = await getCachedRelayListsBatch(pubkeysToFetch)
      for (const pubkey of pubkeysToFetch) {
        const { data } = staleCache.get(pubkey) || {}
        if (data && isAcceptablyStale(data)) {
          console.warn(`DEGRADED MODE: Using stale cache for ${pubkey.slice(0, 8)}...`)
          results.set(pubkey, { relays: data.relays, event: data.event })
        } else {
          // Cache too old or missing - return empty (will use default relays)
          results.set(pubkey, { relays: [], event: null })
        }
      }
    }
  }

  return results
}

/**
 * Get write relays for a pubkey (from cache or fetch)
 *
 * OUTBOX MODEL USAGE:
 * - Use this to fetch a user's CONTENT (profiles, notes, etc.)
 * - These are the relays where the user PUBLISHES their events
 * - When you want to read User A's profile, call getWriteRelays(userA.pubkey)
 *
 * GUARANTEES:
 * - Only returns relays where write === true (strictly boolean, not truthy)
 * - Read-only relays are NEVER included
 * - Falls back to DEFAULT_RELAYS if no valid write relays exist
 * - All returned URLs are validated
 *
 * @param {string} pubkey - The user whose write relays you want
 * @param {boolean} forceRefresh - Force fresh fetch, ignoring cache
 * @returns {Promise<string[]>} - Array of validated write relay URLs
 */
export async function getWriteRelays(pubkey, forceRefresh = false) {
  const { relays } = await fetchRelayList(pubkey, forceRefresh)

  // Filter strictly: must have write === true (not just truthy) and valid URL
  // This ensures read-only relays are NEVER returned
  const writeRelays = relays
    .filter(r => r.write === true && isValidRelayUrl(r.url))
    .map(r => r.url)

  // Always return at least DEFAULT_RELAYS to ensure events can be published
  return writeRelays.length > 0 ? writeRelays : DEFAULT_RELAYS
}

/**
 * Get write relays for multiple pubkeys (batch version)
 * STRICTLY follows outbox model - only returns relays where write === true
 * @param {string[]} pubkeys
 * @param {boolean} forceRefresh
 * @returns {Promise<Map<string, string[]>>}
 */
export async function getWriteRelaysBatch(pubkeys, forceRefresh = false) {
  const relayListsMap = await fetchRelayListsBatch(pubkeys, forceRefresh)
  const results = new Map()

  for (const [pubkey, { relays }] of relayListsMap) {
    const writeRelays = relays
      .filter(r => r.write === true && isValidRelayUrl(r.url))
      .map(r => r.url)
    results.set(pubkey, writeRelays.length > 0 ? writeRelays : DEFAULT_RELAYS)
  }

  return results
}

/**
 * Get read relays for a pubkey (from cache or fetch)
 *
 * IMPORTANT: READ RELAYS ARE NOT USED FOR FETCHING PROFILES
 *
 * A user's read relays are where THEY subscribe to content from others.
 * This is the "inbox" side of the model.
 *
 * When using the outbox model to fetch User A's profile:
 * - You query User A's WRITE relays (where they publish)
 * - You do NOT query User A's read relays
 *
 * This function exists for:
 * - Completeness
 * - Future inbox-model publishing support
 * - Displaying the user's relay configuration
 *
 * @param {string} pubkey - The user whose read relays you want
 * @param {boolean} forceRefresh - Force fresh fetch, ignoring cache
 * @returns {Promise<string[]>} - Array of validated read relay URLs
 */
export async function getReadRelays(pubkey, forceRefresh = false) {
  const { relays } = await fetchRelayList(pubkey, forceRefresh)

  // Filter strictly: must have read === true and valid URL
  const readRelays = relays
    .filter(r => r.read === true && isValidRelayUrl(r.url))
    .map(r => r.url)

  return readRelays.length > 0 ? readRelays : DEFAULT_RELAYS
}

/**
 * Parse a kind 10002 event into a relay list
 * Validates URLs and handles malformed data defensively
 * @param {object} event - The kind 10002 event
 * @returns {Array<{url: string, read: boolean, write: boolean}>}
 */
export function parseRelayListEvent(event) {
  // Defensive checks for invalid input
  if (!event || typeof event !== 'object') return []
  if (event.kind !== 10002) return []
  if (!Array.isArray(event.tags)) return []

  const relays = []
  const seenUrls = new Set() // Deduplicate

  for (const tag of event.tags) {
    // Validate tag structure
    if (!Array.isArray(tag) || tag[0] !== 'r' || typeof tag[1] !== 'string') {
      continue
    }

    const url = normalizeRelayUrl(tag[1])

    // Validate URL format
    if (!isValidRelayUrl(url)) {
      console.warn('Invalid relay URL in kind 10002:', tag[1])
      continue
    }

    // Skip duplicates
    if (seenUrls.has(url)) continue
    seenUrls.add(url)

    const marker = typeof tag[2] === 'string' ? tag[2].toLowerCase() : null

    // Parse read/write flags
    // No marker = both read and write
    // 'read' = read only (write = false)
    // 'write' = write only (read = false)
    relays.push({
      url,
      read: marker === null || marker === 'read',
      write: marker === null || marker === 'write'
    })
  }

  return relays
}

/**
 * Create a kind 10002 event from a relay list
 * @param {Array<{url: string, read: boolean, write: boolean}>} relays
 * @returns {object} - Unsigned event object
 */
export function createRelayListEvent(relays) {
  const tags = relays.map(relay => {
    const tag = ['r', relay.url]
    if (relay.read && !relay.write) {
      tag.push('read')
    } else if (relay.write && !relay.read) {
      tag.push('write')
    }
    return tag
  })

  return {
    kind: 10002,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ''
  }
}

/**
 * Normalize a relay URL
 * @param {string} url
 * @returns {string}
 */
export function normalizeRelayUrl(url) {
  let normalized = url.trim().toLowerCase()
  if (!normalized.endsWith('/')) {
    normalized += '/'
  }
  return normalized
}

/**
 * Get default relay list with read/write flags
 * @returns {Array<{url: string, read: boolean, write: boolean}>}
 */
export function getDefaultRelayList() {
  return DEFAULT_RELAYS.map(url => ({
    url: normalizeRelayUrl(url),
    read: true,
    write: true
  }))
}

/**
 * Publish a kind 10002 event to relays
 *
 * TRADE-OFF DOCUMENTATION:
 * This function uses Promise.any() semantics:
 * - Success means AT LEAST ONE relay accepted the event
 * - Wide propagation is NOT guaranteed
 * - The event may exist on only 1 relay after "success"
 *
 * This is an INTENTIONAL trade-off for:
 * - Fast user feedback (don't wait for slow relays)
 * - Resilience (one success is better than all-or-nothing)
 *
 * Relay success/failure is logged for debugging and transparency.
 *
 * @param {object} signedEvent - The signed kind 10002 event
 * @param {Array<string>} relays - Relay URLs to publish to
 * @returns {Promise<{succeeded: string[], failed: string[]}>} - Publish results
 */
export async function publishRelayList(signedEvent, relays) {
  const succeeded = []
  const failed = []

  try {
    // Create individual publish promises with result tracking
    const publishPromises = relays.map(async (relay) => {
      try {
        await discoveryPool.publish([relay], signedEvent)
        succeeded.push(relay)
        return { relay, success: true }
      } catch (error) {
        failed.push(relay)
        console.warn(`Publish to ${relay} failed:`, error.message || error)
        throw error
      }
    })

    // Wait for at least one to succeed (Promise.any semantics)
    await Promise.any(publishPromises)

    // Log results for transparency
    console.log(`Relay list published: ${succeeded.length} succeeded, ${failed.length} failed`)
    if (succeeded.length > 0) {
      console.log('Succeeded:', succeeded.join(', '))
    }
    if (failed.length > 0) {
      console.warn('Failed:', failed.join(', '))
    }

    // Invalidate cache after publishing
    await invalidateRelayListCache(signedEvent.pubkey)

    return { succeeded, failed }
  } catch (error) {
    // All relays failed
    console.error('Failed to publish relay list to any relay:', error)
    console.error('All failed relays:', relays.join(', '))
    throw error
  }
}

/**
 * Check if account has a relay list, if not publish default relays
 * @param {string} pubkey - The public key in hex format
 * @param {Uint8Array} privateKey - The private key for signing
 * @param {function} signEvent - Function to sign event (finalizeEvent)
 * @returns {Promise<boolean>} - True if published, false if already exists
 */
export async function ensureRelayListExists(pubkey, privateKey, signEvent) {
  try {
    const { event } = await fetchRelayList(pubkey)

    if (event) {
      return false
    }

    // No relay list found, publish default relays
    const defaultRelays = getDefaultRelayList()
    const unsignedEvent = createRelayListEvent(defaultRelays)
    const signedEvent = signEvent(unsignedEvent, privateKey)

    // Publish to default relays + discovery relays
    const publishTo = [...new Set([...DEFAULT_RELAYS, ...DISCOVERY_RELAYS])]
    await publishRelayList(signedEvent, publishTo)

    console.log('Published default relay list for', pubkey)
    return true
  } catch (error) {
    console.error('Failed to ensure relay list exists:', error)
    return false
  }
}
