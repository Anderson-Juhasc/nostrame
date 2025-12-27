import browser from 'webextension-polyfill'
import React, { createContext, useState, useEffect, useCallback, useRef } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { hexToBytes } from 'nostr-tools/utils'
import { getPublicKey } from 'nostr-tools/pure'
import getIdenticon from '../helpers/identicon'
import { pool, DEFAULT_RELAYS } from '../common'

const MainContext = createContext()

// Identicon cache to avoid regenerating for same pubkeys
const identiconCache = new Map()

export const MainProvider = ({ children }) => {
  const [accounts, setAccounts] = useState([])
  const [defaultAccount, setDefaultAccount] = useState({ index: '', name: '', type: '' })
  const [loading, setLoading] = useState(true)
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

  const fetchData = useCallback(async () => {
    try {
      const storage = await browser.storage.local.get()

      if (!mountedRef.current) return

      if (!storage.isAuthenticated || storage.isLocked) {
        setLoading(false)
        return
      }

      let loadAccounts = []
      let authors = []

      // Process derived accounts
      const derivedAccounts = storage.vault?.accounts || []
      for (let i = 0; i < derivedAccounts.length; i++) {
        const prvKey = derivedAccounts[i].prvKey
        const pubKey = getPublicKey(prvKey)
        authors.push(pubKey)
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
      const importedAccounts = storage.vault?.importedAccounts || []
      for (let i = 0; i < importedAccounts.length; i++) {
        const prvKey = importedAccounts[i].prvKey
        const pubKey = getPublicKey(prvKey)
        authors.push(pubKey)
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

      // Fetch profiles from relays
      if (authors.length > 0) {
        const relays = storage.relays?.length > 0 ? storage.relays : DEFAULT_RELAYS
        try {
          const events = await pool.querySync(relays, { kinds: [0], authors })

          events.forEach((item) => {
            try {
              const content = JSON.parse(item.content)
              const account = loadAccounts.find(acc => acc.pubKey === item.pubkey)
              if (account) {
                account.name = content.display_name || content.name || ''
                account.about = content.about || ''
                account.picture = content.picture || account.picture
                account.banner = content.banner || ''
                account.nip05 = content.nip05 || ''
                account.lud16 = content.lud16 || ''
              }
            } catch (e) {
              // Invalid profile JSON, skip
            }
          })
        } catch (e) {
          console.error('Failed to fetch profiles from relays:', e)
        }
      }

      if (!mountedRef.current) return

      // Set default account
      const defaultPrvKey = storage.vault?.accountDefault || derivedAccounts[0]?.prvKey
      const defaultAcc = loadAccounts.find(acc => acc.prvKey === defaultPrvKey)

      setAccounts(loadAccounts)
      setDefaultAccount(defaultAcc || { index: '', name: '', type: '' })
      setLoading(false)
    } catch (e) {
      console.error('MainContext fetchData error:', e)
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [getIdenticonCached])

  // Initial fetch and storage listener with proper cleanup
  useEffect(() => {
    mountedRef.current = true
    fetchData()

    const handleStorageChange = (changes) => {
      if (changes.vault || changes.isAuthenticated || changes.isLocked) {
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
    const storage = await browser.storage.local.get(['vault'])
    const defaultAcc = accounts.find(acc => acc.prvKey === storage.vault?.accountDefault)
    if (defaultAcc) {
      setDefaultAccount(defaultAcc)
    }
  }, [accounts])

  return (
    <MainContext.Provider value={{
      accounts,
      defaultAccount,
      loading,
      updateAccounts,
      updateDefaultAccount
    }}>
      {children}
    </MainContext.Provider>
  )
}

export default MainContext
