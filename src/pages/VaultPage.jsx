import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { hexToBytes } from '@noble/hashes/utils'
import ImportAccountModal from '../modals/ImportAccountModal'
import GenerateRandomAccountModal from '../modals/GenerateRandomAccountModal'
import DeriveAccountModal from '../modals/DeriveAccountModal'
import LockedVault from '../components/LockedVault'
import getIdenticon from '../helpers/identicon'
import { getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import AccountListings from '../components/AccountListings'

const VaultPage = () => {
  const [isLocked, setIsLocked] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [importedAccounts, setImportedAccounts] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [showImportAccountModal, setShowImportAccountModal] = useState(false)
  const [showRandomAccount, setShowRandomAccount] = useState(false)
  const [showDeriveAccount, setShowDeriveAccount] = useState(false)

  const pool = new SimplePool()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const storage = await browser.storage.local.get()

    if (storage.isLocked) {
      setIsLocked(true)
    }

    if (!storage.isLocked) {
      setIsLocked(false)
    }

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
            loadAccounts[i].nip05 = content.nip05
            loadAccounts[i].lud16 = content.lud16
          }
        }
      })

      const dAccounts = loadAccounts.filter(obj => obj.type === 'derived')
      const iAccounts = loadAccounts.filter(obj => obj.type === 'imported')

      setAccounts(dAccounts)
      setImportedAccounts(iAccounts)
      setLoaded(true)
    }
  }

  const UserIdenticon = async ( pubkey ) => {
    const identicon = await getIdenticon(pubkey)

    return `data:image/svg+xml;base64,${identicon}`
  }

  const openOptionsButton = async () => {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage()
    } else {
      window.open(browser.runtime.getURL('options.html'))
    }
  }

  const lockVault = async () => {
    setIsLocked(true)
    setAccounts([])
    setLoaded(false)
    await browser.storage.local.set({ 
      isLocked: true,
      vault: {
        accounts: [],
      },
      password: '',
    })
  }

  const importAccountCallback = () => {
    setLoaded(false)
    setShowImportAccountModal(false)
    fetchData()
  }

  const deriveAccountCallback = () => {
    setLoaded(false)
    setShowDeriveAccount(false)
    fetchData()
  }

  return (
    <div className="Popup">
      {isLocked ? (
        <>
          <LockedVault fetchData={fetchData} />
        </>
      ) : (
        <>
          {loaded ? (
            <>
              <div className="header">
                <h1>
                  Nostrame
                </h1>

                <div>
                  <a href="#" onClick={(e) => { e.preventDefault(); lockVault() }} title="Lock now">
                    <i className="icon-lock"></i>
                  </a>
                  &nbsp;
                  <a href="#" onClick={(e) => { e.preventDefault(); setShowRandomAccount(true) }} title="Generate random account">
                    <i className="icon-loop2"></i>
                  </a>
                  &nbsp;
                  <a href="#" onClick={(e) => { e.preventDefault(); openOptionsButton() }} title="Options">
                    <i className="icon-cog"></i>
                  </a>
                </div>
              </div>
              <div>
                <div className="container">
                  <div className="card-head">
                    <h3>
                      Derived accounts
                    </h3>

                    <div>
                      <button type="button" onClick={() => setShowDeriveAccount(true)} title="Derive new account">
                        <strong>+</strong>
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <AccountListings accountsData={accounts} type="derived" fetchData={fetchData} reloadData={() => {setLoaded(false)}} />
                </div>
                <div className="container">
                  <div className="card-head">
                    <h3>
                      Imported accounts
                    </h3>

                    <div>
                      <button type="button" onClick={() => setShowImportAccountModal(true)} title="Import account">
                        <i className="icon-download"></i>
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <AccountListings accountsData={importedAccounts} type="imported" fetchData={fetchData} reloadData={() => {setLoaded(false)}} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="container">
                <h1>Nostrame</h1>
                Loading...
              </div>
            </>
          )}

          <ImportAccountModal 
            isOpen={showImportAccountModal}
            callBack={importAccountCallback}
            onClose={() => setShowImportAccountModal(false)}
          ></ImportAccountModal>

          <GenerateRandomAccountModal 
            isOpen={showRandomAccount}
            callBack={importAccountCallback}
            onClose={() => setShowRandomAccount(false)}
          ></GenerateRandomAccountModal>

          <DeriveAccountModal 
            isOpen={showDeriveAccount}
            callBack={deriveAccountCallback}
            onClose={() => setShowDeriveAccount(false)}
          ></DeriveAccountModal>
        </>
      )}
    </div>
  )
}

export default VaultPage
