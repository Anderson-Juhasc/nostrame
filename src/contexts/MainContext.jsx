import browser from 'webextension-polyfill'
import React, { createContext, useState, useEffect, useCallback, useRef } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { hexToBytes } from 'nostr-tools/utils'
import { getPublicKey } from 'nostr-tools/pure'
import getIdenticon from '../helpers/identicon'
import { pool, DEFAULT_RELAYS, getSessionVault } from '../common'
import { getWriteRelaysBatch } from '../helpers/outbox'
import {
  getCachedProfilesBatch,
  setCachedProfile,
  canRefreshProfile,
  tryAcquireRefresh,
  cleanupOrphanedCache,
  REFRESH_COOLDOWN
} from '../services/cache'

const MainContext = createContext()

// Identicon cache to avoid regenerating for same pubkeys
const identiconCache = new Map()

/**
 * Validate a profile image/banner URL
 * Prevents malicious URLs (javascript:, extremely long, etc.)
 * @param {string} url
 * @returns {boolean}
 */
function isValidProfileUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (url.length > 2048) return false // Reasonable URL length limit

  try {
    const parsed = new URL(url)
    // Only allow http, https, and data URLs
    return ['http:', 'https:', 'data:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

export const MainProvider = ({ children }) => {
  const [accounts, setAccounts] = useState([])
  const [defaultAccount, setDefaultAccount] = useState({ index: '', name: '', type: '' })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const mountedRef = useRef(true)

  // Memoized identicon generator with caching
  const getIdenticonCached = useCallback(async (pubkey) => {
    if (identiconCache.has(pubkey)) {
      return identiconCache.get(pubkey)
    }
    const identicon = await getIdenticon(pubkey)
    const dataUri = `data:image/svg+xml;base64,${identicon}`
    identiconCache.set(pubkey, dataUri)
    return dataUri
  }, [])

  /**
   * Build initial account objects from vault
   */
  const buildAccountsFromVault = useCallback(async (vault) => {
    const loadAccounts = []

    // Process derived accounts
    const derivedAccounts = vault.accounts || []
    for (let i = 0; i < derivedAccounts.length; i++) {
      const prvKey = derivedAccounts[i].prvKey
      const pubKey = getPublicKey(prvKey)
      loadAccounts.push({
        index: i,
        name: '',
        prvKey,
        nsec: nip19.nsecEncode(hexToBytes(prvKey)),
        pubKey,
        npub: nip19.npubEncode(pubKey),
        picture: await getIdenticonCached(pubKey),
        format: 'bech32',
        type: 'derived',
      })
    }

    // Process imported accounts
    const importedAccounts = vault.importedAccounts || []
    for (let i = 0; i < importedAccounts.length; i++) {
      const prvKey = importedAccounts[i].prvKey
      const pubKey = getPublicKey(prvKey)
      loadAccounts.push({
        index: i,
        name: '',
        prvKey,
        nsec: nip19.nsecEncode(hexToBytes(prvKey)),
        pubKey,
        npub: nip19.npubEncode(pubKey),
        picture: await getIdenticonCached(pubKey),
        format: 'bech32',
        type: 'imported',
      })
    }

    return loadAccounts
  }, [getIdenticonCached])

  /**
   * Apply cached profiles to accounts (instant display)
   * Returns accounts that need refreshing (stale or missing cache)
   */
  const applyCachedProfiles = useCallback(async (accounts) => {
    const pubkeys = accounts.map(a => a.pubKey)
    const cachedProfiles = await getCachedProfilesBatch(pubkeys)
    const staleAccounts = []

    for (const account of accounts) {
      const { data: cached, isStale, isMissing } = cachedProfiles.get(account.pubKey) || { isStale: true, isMissing: true }

      if (cached) {
        account.name = cached.name || cached.display_name || ''
        account.about = cached.about || ''
        // Validate URLs even from cache (defense in depth)
        account.picture = isValidProfileUrl(cached.picture) ? cached.picture : account.picture
        account.banner = isValidProfileUrl(cached.banner) ? cached.banner : ''
        account.nip05 = cached.nip05 || ''
        account.lud16 = cached.lud16 || ''
      }

      // Track accounts that need refreshing
      if (isStale || isMissing) {
        staleAccounts.push(account)
      }
    }

    return { accounts, staleAccounts }
  }, [])

  /**
   * Refresh profiles from network in background
   * Uses outbox model: batch fetch relay lists, then fetch each profile from their write relays
   */
  const refreshProfilesInBackground = useCallback(async (accounts) => {
    if (accounts.length === 0) return

    setRefreshing(true)

    try {
      const pubkeys = accounts.map(a => a.pubKey)

      // Batch fetch validated write relays for all accounts
      const writeRelaysMap = await getWriteRelaysBatch(pubkeys)

      // Fetch each account's profile from their own write relays (in parallel)
      const profilePromises = accounts.map(async (account) => {
        try {
          // Get validated write relays (with URL validation and fallback to defaults)
          const relays = writeRelaysMap.get(account.pubKey) || DEFAULT_RELAYS

          const events = await pool.querySync(relays, {
            kinds: [0],
            authors: [account.pubKey],
            limit: 1
          })

          if (events.length > 0) {
            const event = events.reduce((latest, e) =>
              e.created_at > latest.created_at ? e : latest
            )

            // Safely parse profile JSON
            let content
            try {
              content = JSON.parse(event.content)
              if (typeof content !== 'object' || content === null) {
                console.warn(`Invalid profile content for ${account.pubKey}: not an object`)
                return null
              }
            } catch (parseError) {
              console.warn(`Malformed profile JSON for ${account.pubKey}:`, parseError.message)
              return null
            }

            // Validate profile picture URL
            const validatedPicture = isValidProfileUrl(content.picture)
              ? content.picture
              : account.picture

            // Validate banner URL
            const validatedBanner = isValidProfileUrl(content.banner)
              ? content.banner
              : ''

            // Cache the profile
            await setCachedProfile(account.pubKey, content, event)

            // Return updated account data
            return {
              pubKey: account.pubKey,
              name: content.display_name || content.name || '',
              about: content.about || '',
              picture: validatedPicture,
              banner: validatedBanner,
              nip05: content.nip05 || '',
              lud16: content.lud16 || ''
            }
          }
        } catch (e) {
          console.error(`Failed to fetch profile for ${account.pubKey}:`, e)
        }
        return null
      })

      const results = await Promise.all(profilePromises)

      // Update accounts with fresh data
      if (mountedRef.current) {
        setAccounts(prev => {
          const updated = [...prev]
          for (const result of results) {
            if (result) {
              const idx = updated.findIndex(a => a.pubKey === result.pubKey)
              if (idx !== -1) {
                updated[idx] = { ...updated[idx], ...result }
              }
            }
          }
          return updated
        })

        // Update default account if it was refreshed
        setDefaultAccount(prev => {
          const result = results.find(r => r?.pubKey === prev.pubKey)
          if (result) {
            return { ...prev, ...result }
          }
          return prev
        })
      }
    } catch (e) {
      console.error('Failed to refresh profiles:', e)
    } finally {
      if (mountedRef.current) {
        setRefreshing(false)
      }
    }
  }, [])

  /**
   * Main data fetch with stale-while-revalidate pattern
   */
  const fetchData = useCallback(async () => {
    try {
      const storage = await browser.storage.local.get()
      const vault = await getSessionVault()

      if (!mountedRef.current) return

      if (!storage.isAuthenticated || storage.isLocked || !vault) {
        setLoading(false)
        return
      }

      // Step 1: Build accounts from vault
      const loadAccounts = await buildAccountsFromVault(vault)

      // Step 2: Apply cached profiles immediately (instant display)
      // Also returns which accounts have stale/missing cache
      const { accounts: accountsWithProfiles, staleAccounts } = await applyCachedProfiles(loadAccounts)

      // Set default account
      const defaultPrvKey = vault.accountDefault || vault.accounts?.[0]?.prvKey
      const defaultAcc = accountsWithProfiles.find(acc => acc.prvKey === defaultPrvKey)

      // Display with cached data immediately
      setAccounts(accountsWithProfiles)
      setDefaultAccount(defaultAcc || { index: '', name: '', type: '' })
      setLoading(false)

      // Step 3: Only refresh stale/missing profiles from network (non-blocking)
      if (staleAccounts.length > 0) {
        console.log(`Refreshing ${staleAccounts.length} stale profile(s)`)
        refreshProfilesInBackground(staleAccounts)
      }
    } catch (e) {
      console.error('MainContext fetchData error:', e)
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [buildAccountsFromVault, applyCachedProfiles, refreshProfilesInBackground])

  // Initial fetch and storage listener
  useEffect(() => {
    mountedRef.current = true
    fetchData()

    const handleStorageChange = (changes) => {
      if (changes.isAuthenticated || changes.isLocked) {
        fetchData()
      }
    }

    browser.storage.onChanged.addListener(handleStorageChange)

    return () => {
      mountedRef.current = false
      browser.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [fetchData])

  const updateAccounts = useCallback(async () => {
    await fetchData()
  }, [fetchData])

  const updateDefaultAccount = useCallback(async () => {
    const vault = await getSessionVault()
    const defaultAcc = accounts.find(acc => acc.prvKey === vault?.accountDefault)
    if (defaultAcc) {
      setDefaultAccount(defaultAcc)
    }
  }, [accounts])

  /**
   * Force refresh current profile from network (user-triggered)
   * Respects cooldown to prevent abuse
   * Uses atomic check-and-record to prevent race conditions
   * @returns {Promise<{success: boolean, remainingMs?: number}>}
   */
  const forceRefreshCurrentProfile = useCallback(async () => {
    if (!defaultAccount?.pubKey) {
      return { success: false, remainingMs: 0 }
    }

    // Atomic cooldown check and record
    const { allowed, remainingMs } = await tryAcquireRefresh(defaultAccount.pubKey)
    if (!allowed) {
      return { success: false, remainingMs }
    }

    // Only refresh the current account, not all accounts
    const currentAccount = accounts.find(a => a.pubKey === defaultAccount.pubKey)
    if (currentAccount) {
      await refreshProfilesInBackground([currentAccount])
    }

    return { success: true }
  }, [accounts, defaultAccount, refreshProfilesInBackground])

  /**
   * Check if manual refresh is allowed (cooldown check)
   * @returns {Promise<{allowed: boolean, remainingMs: number}>}
   */
  const checkRefreshCooldown = useCallback(async () => {
    if (!defaultAccount?.pubKey) {
      return { allowed: true, remainingMs: 0 }
    }
    return canRefreshProfile(defaultAccount.pubKey)
  }, [defaultAccount])

  return (
    <MainContext.Provider value={{
      accounts,
      defaultAccount,
      loading,
      refreshing,
      updateAccounts,
      updateDefaultAccount,
      forceRefreshCurrentProfile,
      checkRefreshCooldown,
      REFRESH_COOLDOWN
    }}>
      {children}
    </MainContext.Provider>
  )
}

export default MainContext
