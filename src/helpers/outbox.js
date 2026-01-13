import { SimplePool } from 'nostr-tools/pool'
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
export const DISCOVERY_RELAYS = [
  'wss://purplepag.es/',
  'wss://relay.damus.io/',
  'wss://nos.lol/',
  'wss://nostr.wine/',
]

// Create a dedicated pool for relay discovery
const discoveryPool = new SimplePool({
  eoseSubTimeout: 5000,
  getTimeout: 5000
})

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
 * Fetch kind 10002 (relay list) event for a pubkey
 * @param {string} pubkey - The public key in hex format
 * @param {boolean} forceRefresh - Force fresh fetch, ignoring cache
 * @returns {Promise<{relays: Array<{url: string, read: boolean, write: boolean}>, event: object|null, fromCache: boolean}>}
 */
export async function fetchRelayList(pubkey, forceRefresh = false) {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const { data: cached, isStale } = await getCachedRelayList(pubkey)
    if (cached && !isStale) {
      return { relays: cached.relays, event: cached.event, fromCache: true }
    }
  }

  try {
    const allRelays = getDiscoveryRelays()

    const events = await discoveryPool.querySync(allRelays, {
      kinds: [10002],
      authors: [pubkey],
      limit: 1
    })

    // Get the most recent event
    const event = events.length > 0
      ? events.reduce((latest, e) => e.created_at > latest.created_at ? e : latest)
      : null

    const relays = event ? parseRelayListEvent(event) : []

    // Cache the result
    await setCachedRelayList(pubkey, relays, event)

    return { relays, event, fromCache: false }
  } catch (error) {
    console.error('Failed to fetch relay list:', error)

    // On error, try to return stale cache if acceptably fresh (< 24 hours)
    // We don't want to use ancient cached data that could be completely outdated
    const { data: cached } = await getCachedRelayList(pubkey)
    if (cached && isAcceptablyStale(cached)) {
      console.warn(`Using stale cache for relay list (${pubkey.slice(0, 8)}...)`)
      return { relays: cached.relays, event: cached.event, fromCache: true }
    }

    // Cache too old or missing - return empty (will use default relays)
    return { relays: [], event: null, fromCache: false }
  }
}

/**
 * Batch fetch kind 10002 events for multiple pubkeys
 * Uses cache for fresh entries, fetches stale/missing in one query
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

      // Group events by pubkey, keep most recent
      const eventsByPubkey = new Map()
      for (const event of events) {
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
      const staleCache = await getCachedRelayListsBatch(pubkeysToFetch)
      for (const pubkey of pubkeysToFetch) {
        const { data } = staleCache.get(pubkey) || {}
        if (data && isAcceptablyStale(data)) {
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
 * STRICTLY follows outbox model - only returns relays where write === true
 * @param {string} pubkey
 * @param {boolean} forceRefresh
 * @returns {Promise<string[]>}
 */
export async function getWriteRelays(pubkey, forceRefresh = false) {
  const { relays } = await fetchRelayList(pubkey, forceRefresh)

  // Filter strictly: must have write === true (not just truthy) and valid URL
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
 * @param {string} pubkey
 * @param {boolean} forceRefresh
 * @returns {Promise<string[]>}
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
 * @param {object} signedEvent - The signed kind 10002 event
 * @param {Array<string>} relays - Relay URLs to publish to
 * @returns {Promise<void>}
 */
export async function publishRelayList(signedEvent, relays) {
  try {
    await Promise.any(
      discoveryPool.publish(relays, signedEvent)
    )
    // Invalidate cache after publishing
    await invalidateRelayListCache(signedEvent.pubkey)
  } catch (error) {
    console.error('Failed to publish relay list:', error)
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
