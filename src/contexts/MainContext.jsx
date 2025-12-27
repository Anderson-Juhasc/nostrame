import browser from 'webextension-polyfill'
import React, { createContext, useState, useEffect } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { hexToBytes } from 'nostr-tools/utils'
import { getPublicKey } from 'nostr-tools/pure'
import getIdenticon from '../helpers/identicon'
import { SimplePool } from 'nostr-tools/pool'

const MainContext = createContext()

export const MainProvider = ({ children }) => {
  const [accounts, setAccounts] = useState([])
  const [defaultAccount, setDefaultAccount] = useState({ index: '', name: '', type: '' })

  const pool = new SimplePool({
    eoseSubTimeout: 3000,
    getTimeout: 3000
  })

  useEffect(() => {
    fetchData()

    browser.storage.onChanged.addListener(async (changes, area) => {
      if (changes.vault) {
        let { newValue, oldValue } = changes.vault
        if (newValue.accountDefault !== oldValue.accountDefault) {
          //fetchData()
        }
      }
    })
  }, [])

  useEffect(() => {
    browser.storage.onChanged.addListener(async (changes, area) => {
      if (changes.vault) {
        let { newValue, oldValue } = changes.vault
        if (newValue.accountDefault !== oldValue.accountDefault) {
          //const storage = await browser.storage.local.get()
          //const defaultAccount = accounts.find(key => key.prvKey === storage.vault.accountDefault)
          //setDefaultAccount(defaultAccount)
          //fetchData()
        }
      }
    })
  }, [accounts])

  const fetchData = async () => {
    const storage = await browser.storage.local.get()

    let loadAccounts = []
    let authors = []

    if (storage.isAuthenticated && !storage.isLocked) {
      let l = storage.vault.accounts.length
      for (let i = 0; i < l; i++) {
        const prvKey = storage.vault.accounts[i].prvKey
        const nsec = nip19.nsecEncode(hexToBytes(prvKey))
        const pubKey = getPublicKey(prvKey)
        const npub = nip19.npubEncode(pubKey)
        authors.push(pubKey)
        loadAccounts = [
          ...loadAccounts, 
          { 
            index: i,
            name: '',
            prvKey,
            nsec,
            pubKey,
            npub,
            picture: await UserIdenticon(pubKey),
            format: 'bech32',
            type: 'derived',
          }
        ]
      }

      let len = storage.vault.importedAccounts.length
      for (let i = 0; i < len; i++) {
        const prvKey = storage.vault.importedAccounts[i].prvKey
        const nsec = nip19.nsecEncode(hexToBytes(prvKey))
        const pubKey = getPublicKey(prvKey)
        const npub = nip19.npubEncode(pubKey)
        authors.push(pubKey)
        loadAccounts = [
          ...loadAccounts, 
          { 
            index: i,
            name: '',
            prvKey,
            nsec,
            pubKey,
            npub,
            picture: await UserIdenticon(pubKey),
            format: 'bech32',
            type: 'imported',
          }
        ]
      }

      let relays = storage.relays
      let events = await pool.querySync(relays, { kinds: [0], authors })

      events.forEach(async (item) => {
        let content = JSON.parse(item.content)
        let len = loadAccounts.length
        for (let i = 0; i < len; i++) {
          if (loadAccounts[i].pubKey === item.pubkey) {
            loadAccounts[i].name = content.display_name
            loadAccounts[i].about = content.about
            loadAccounts[i].picture = !content.picture || content.picture === '' ? loadAccounts[i].picture : content.picture
            loadAccounts[i].banner = !content.banner || content.banner === '' ? '' : content.banner
            loadAccounts[i].nip05 = content.nip05
            loadAccounts[i].lud16 = content.lud16
          }
        }
      })

      if (!storage.vault.accountDefault) {
        storage.vault.accountDefault = storage.vault.accounts[0].prvKey
      }
      const defaultAccount = loadAccounts.find(key => key.prvKey === storage.vault.accountDefault)
      setDefaultAccount(defaultAccount)

      setAccounts(loadAccounts)
    }
  }

  const UserIdenticon = async ( pubkey ) => {
    const identicon = await getIdenticon(pubkey)

    return `data:image/svg+xml;base64,${identicon}`
  }

  const updateAccounts = async () => {
    await fetchData()
  }

  const updateDefaultAccount = async () => {
    const storage = await browser.storage.local.get(['vault'])
    const defaultAccount = accounts.find(key => key.prvKey === storage.vault.accountDefault)
    setDefaultAccount(defaultAccount)
  }

  return (
    <MainContext.Provider value={{ accounts, defaultAccount, updateAccounts, updateDefaultAccount }}>
      {children}
    </MainContext.Provider>
  )
}

export default MainContext
