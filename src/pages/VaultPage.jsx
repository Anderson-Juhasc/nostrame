import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { hexToBytes } from '@noble/hashes/utils'
import { encrypt } from '../common'
import EditAccountModal from '../modals/EditAccountModal'
import ImportAccountModal from '../modals/ImportAccountModal'
import AccountDetailsModal from '../modals/AccountDetailsModal'
import GenerateRandomAccountModal from '../modals/GenerateRandomAccountModal'
import DeriveAccountModal from '../modals/DeriveAccountModal'
import LockedVault from '../components/LockedVault'
import getIdenticon from '../helpers/identicon'
import { getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'

const VaultPage = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [importedAccounts, setImportedAccounts] = useState([])
  const [accountEditing, setAccountEditing] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [showEditAccountModal, setEditAccountModal] = useState(false)
  const [showImportAccountModal, setShowImportAccountModal] = useState(false)
  const [accountDetails, setAccountDetails] = useState({})
  const [showAccountDetails, setShowAccountDetails] = useState(false)
  const [showRandomAccount, setShowRandomAccount] = useState(false)
  const [showDeriveAccount, setShowDeriveAccount] = useState(false)
  const [vault, setVault] = useState({
    mnemonic: '',
    passphrase: '',
    accountIndex: 0,
    accounts: [], // maybe change to derivedAccounts
    importedAccounts: [],
  })

  const pool = new SimplePool()

  useEffect(() => {
    fetchData()
  }, []);

  const fetchData = async () => {
    const storage = await browser.storage.local.get()

    setIsAuthenticated(storage.isAuthenticated)

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

      setVault(storage.vault)

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

  const hideStringMiddle = (inputString, startChars = 10, endChars = 8) => {
    if (inputString.length <= startChars + endChars) {
        return inputString; // Return the string as is if its length is less than or equal to the combined length of startChars and endChars
    }
    
    const hiddenChars = inputString.length - startChars - endChars; // Calculate the number of characters to hide
    const hiddenPart = '.'.repeat(3); // Create a string of dots (or any character you want to use to hide)
    
    // Slice and combine the string to show the startChars, hiddenPart, and endChars
    const result = inputString.slice(0, startChars) + hiddenPart + inputString.slice(-endChars);
    
    return result;
  }

  const copyToClipboard = (e, text) => {
    e.preventDefault()
    navigator.clipboard.writeText(text)
  }
  
  async function toggleFormat(e, account) {
    e.preventDefault()
    let newFormat = account.format === 'bech32' ? 'hex' : 'bech32'

    if (account.type === 'derived') {
      setAccounts((prevAccounts) => {
        prevAccounts[account.index]['format'] = newFormat
        return [...prevAccounts]
      })
      return false
    }

    setImportedAccounts((prevAccounts) => {
      prevAccounts[account.index]['format'] = newFormat
      return [...prevAccounts]
    })
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

  const editAccountCallback = () => {
    setLoaded(false)
    setEditAccountModal(false)
    fetchData()
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

  const deleteImportedAccount = async (index) => {
    if (confirm("Are you sure you want to delete this account? Make sure if you have made a backup before you continue.")) {
      const storage = await browser.storage.local.get(['vault', 'password'])
      const vault = storage.vault
      const newImportedAccounts = [...vault.importedAccounts]
      if (index !== -1) {
        newImportedAccounts.splice(index, 1)
      }
      vault.importedAccounts = newImportedAccounts
      const encryptedVault = encrypt(vault, storage.password)
      await browser.storage.local.set({ 
        encryptedVault,
        vault,
      })
      setLoaded(false)
      fetchData()
    }
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
                  {accounts.map((account, index) => (
                    <div key={index} className="card">
                      <header className="card-head">
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
                          <img src={account.picture} width="30" style={{ borderRadius: '50%' }} />
                          &nbsp;
                          <strong>{account.name ? account.name : 'Account ' + index}:</strong>
                          &nbsp;
                          <a href="#" onClick={(e) => toggleFormat(e, account)} title={account.format === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
                            <i className="icon-tab"></i>
                          </a>
                          &nbsp;
                        </div>
                        <div className="dropdown">
                          <a href="#" onClick={(e) => e.preventDefault()} className="dropdown-btn">
                            <i className="icon-dots-three-vertical"></i>
                          </a>
                          <div className="dropdown-content">
                            <a href="#" onClick={(e) => { e.preventDefault(); setEditAccountModal(true); setAccountEditing(account) }}>
                              <i className="icon-pencil"></i> Edit
                            </a>
                            <a 
                              href="#"
                              onClick={(e) => { e.preventDefault(); setAccountDetails(account); setShowAccountDetails(true) }}
                              title="Account details"
                            >
                              <i className="icon-qrcode"></i> Account details
                            </a>
                          </div>
                        </div>
                      </header>
                      <strong>{account.format === 'bech32' ? 'Npub' : 'Public Key'}:</strong>
                      &nbsp;
                      {account.format === 'bech32' ? hideStringMiddle(account.npub) : hideStringMiddle(account.pubKey)}
                      &nbsp;
                      <a href="" onClick={(e) => copyToClipboard(e, account.format === 'bech32' ? account.npub : account.pubKey)} title="Copy">
                        <i className="icon-copy"></i>
                      </a>
                    </div>
                  ))}
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
                  {importedAccounts.map((account, index) => (
                    <div key={index} className="card">
                      <header className="card-head">
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
                          <img src={account.picture} width="30" style={{ borderRadius: '50%' }} />
                          &nbsp;
                          <strong>{account.name ? account.name : 'Account ' + index}:</strong>
                          &nbsp;
                          <a href="#" onClick={(e) => toggleFormat(e, account)} title={account.format === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
                            <i className="icon-tab"></i>
                          </a>
                          &nbsp;
                        </div>
                        <div className="dropdown">
                          <a href="#" onClick={(e) => e.preventDefault()} className="dropdown-btn">
                            <i className="icon-dots-three-vertical"></i>
                          </a>
                          <div className="dropdown-content">
                            <a href="#" onClick={(e) => { e.preventDefault(); setEditAccountModal(true); setAccountEditing(account) }} title="Edit">
                              <i className="icon-pencil"></i> Edit
                            </a>
                            <a 
                              href="#"
                              onClick={(e) => { e.preventDefault(); setAccountDetails(account); setShowAccountDetails(true) }}
                              title="Account details"
                            >
                              <i className="icon-qrcode"></i> Account details
                            </a>
                            <a href="#" onClick={(e) => { e.preventDefault(); deleteImportedAccount(index) }} title="Remove account">
                              <i className="icon-bin"></i> Remove account
                            </a>
                          </div>
                        </div>
                      </header>
                      <strong>{account.format === 'bech32' ? 'npub' : 'Public Key'}:</strong>
                      &nbsp;
                      {account.format === 'bech32' ? hideStringMiddle(account.npub) : hideStringMiddle(account.pubKey)}
                      &nbsp;
                      <a href="#" onClick={(e) => copyToClipboard(e, account.format === 'bech32' ? account.npub : account.pubKey)} title="Copy">
                        <i className="icon-copy"></i>
                      </a>
                    </div>
                  ))}
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

          <EditAccountModal 
            isOpen={showEditAccountModal}
            accountData={accountEditing}
            callBack={editAccountCallback}
            onClose={() => setEditAccountModal(false)}
          ></EditAccountModal>

          <AccountDetailsModal 
            isOpen={showAccountDetails}
            accountData={accountDetails}
            onClose={() => setShowAccountDetails(false)}
          ></AccountDetailsModal>

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
