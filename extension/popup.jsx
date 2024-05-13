import browser from 'webextension-polyfill'
import {render} from 'react-dom'
import React, { useState, useEffect } from 'react'
import CryptoJS from 'crypto-js'
import * as nip19 from 'nostr-tools/nip19'
import { privateKeyFromSeedWords, generateSeedWords, validateWords } from 'nostr-tools/nip06'
import {hexToBytes, bytesToHex} from '@noble/hashes/utils'
import { encrypt, decrypt } from './common'
import EditAccountModal from './components/EditAccountModal'
import ImportAccountModal from './components/ImportAccountModal'
import AccountDetailsModal from './components/AccountDetailsModal'
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import { Relay } from 'nostr-tools/relay'
import { SimplePool } from 'nostr-tools/pool'

function Popup() {
  const [masterPassword, setMasterPassword] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [password, setPassword] = useState('')
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [vault, setVault] = useState({
    mnemonic: '',
    passphrase: '',
    accountIndex: 0,
    accounts: [], // maybe change to derivedAccounts
    importedAccounts: [],
  })
  const [encryptedVault, setEncryptedVault] = useState('')
  const [accounts, setAccounts] = useState([])
  const [importedAccounts, setImportedAccounts] = useState([])
  const [accountEditing, setAccountEditing] = useState({})
  const [relay, setRelay] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [showEditAccountModal, setEditAccountModal] = useState(false)
  const [showImportAccountModal, setShowImportAccountModal] = useState(false)
  const [qrCodeKey, setQRCodeKey] = useState('')
  const [accountDetails, setAccountDetails] = useState('')
  const [showAccountDetails, setShowAccountDetails] = useState(false)

  const pool = new SimplePool()

  useEffect(async () => {
    fetchData()
  }, []);

  const fetchData = async () => {
    const storage = await browser.storage.local.get()

    console.log(storage)

    setIsAuthenticated(storage.isAuthenticated)

    if (storage.isLocked) {
      setIsLocked(true)
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
            format: 'bech32',
            type: 'imported',
          }
        ]
      }

      setVault(storage.vault)
      setEncryptedVault(storage.encryptedVault)

      let relays = storage.relays
      let events = await pool.querySync(relays, { kinds: [0], authors })

      events.forEach((item) => {
        let content = JSON.parse(item.content)
        let len = loadAccounts.length
        for (let i = 0; i < len; i++) {
          if (loadAccounts[i].pubKey === item.pubkey) {
            loadAccounts[i].name = content.display_name
            loadAccounts[i].about = content.about
            loadAccounts[i].picture = content.picture
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
  
  const handleVaultChange = (e) => {
    const { name, value } = e.target;
    setVault(prevVault => ({
      ...prevVault,
      [name]: value
    }))
  }

  const accountEditingChange = (e) => {
    const { name, value } = e.target;
    setAccountEditing(prev => ({
      ...prev,
      [name]: value
    }));
  };

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

  async function createNewAccount(e) {
    e.preventDefault()
    setStep(3)
    let mnemonic = generateSeedWords()
    setVault({
      ...vault,
      mnemonic: mnemonic
    })
  }

  async function saveAccount(e) {
    e.preventDefault()

    const vaultData = {
      mnemonic: vault.mnemonic,
      passphrase: vault.passphrase,
      accountIndex: 0,
      accounts: [],
      importedAccounts: [],
    }

    const prvKey = privateKeyFromSeedWords(vault.mnemonic, vault.passphrase, vaultData.accountIndex)
    vaultData.accounts.push({
      prvKey,
    })

    const encryptedVault = encrypt(vaultData, password)
    await browser.storage.local.set({ 
      vault: vaultData,
      encryptedVault,
      isAuthenticated: true,
      password
    })
    setStep(1)
    setPassword('')
    fetchData()
  }

  const openOptionsButton = async () => {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage()
    } else {
      window.open(browser.runtime.getURL('options.html'))
    }
  }

  const deriveNewAccount = async () => {
    const storage = await browser.storage.local.get(['vault', 'password'])
    let vaultData = storage.vault
    vaultData.accountIndex++
    const prvKey = privateKeyFromSeedWords(vaultData.mnemonic, vaultData.passphrase, vaultData.accountIndex)
    vaultData.accounts.push({
      prvKey,
    })
    const encryptedVault = encrypt(vaultData, storage.password)
    await browser.storage.local.set({ 
      vault: vaultData,
      encryptedVault,
    })
    setLoaded(false)
    fetchData()
  }

  const generateRandomAccount = async () => {
    const storage = await browser.storage.local.get(['vault', 'password'])
    const vault = storage.vault
    const prvKeyHex = bytesToHex(generateSecretKey())
    vault.importedAccounts.push({ prvKey: prvKeyHex })
    const encryptedVault = encrypt(vault, storage.password)
    await browser.storage.local.set({ 
      vault,
      encryptedVault,
    })
    setLoaded(false)
    fetchData()
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

  const unlockVault = async (e) => {
    e.preventDefault()
    const storage = await browser.storage.local.get(['encryptedVault'])
    const vaultData = decrypt(storage.encryptedVault, password) 
    setIsLocked(false)
    await browser.storage.local.set({ 
      isLocked: false,
      vault: vaultData,
      password,
    })
    setPassword('')
    fetchData()
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

  const deleteImportedAccount = async (index) => {
    if (await confirm("Are you sure you want to delete this account? Make sure if you have made a backup before you continue.")) {
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

  if (!isAuthenticated) {
    switch (step) {
      case 1: 
        return (
          <div className="Popup">
            <div className="container">
              <h1>Nostrame</h1>
              <button type="button" className="btn" onClick={() => setStep(2)}>I have an account</button>
              <br />
              <button type="button" className="btn" onClick={openOptionsButton}>Import backup</button>
              <br />
              <button type="button" className="btn" onClick={createNewAccount}>Create new account</button>
            </div>
          </div>
        )
      case 2: 
        return (
          <div className="Popup">
            <div className="container">
              <form onSubmit={saveAccount}>
                <h1>Create new account</h1>
                <textarea
                  rows="2"
                  placeholder="Mnemonic"
                  name="mnemonic"
                  required
                  value={vault.mnemonic}
                  onChange={handleVaultChange}
                ></textarea>
                <br />
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Passphrase"
                  name="passphrase"
                  value={vault.passphrase}
                  onChange={handleVaultChange}
                />
                <br />
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Password"
                  name="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <br />
                <button type="submit" className="btn">Save</button>
                <br />
                <button type="button" className="btn" onClick={() => { setStep(1); setVault({...vault, mnemonic: '', passphrase: '' }); setPassword('') } }>Back</button>
              </form>
            </div>
          </div>
        )
      case 3: 
        return (
          <div className="Popup">
            <div className="container">
              <form onSubmit={saveAccount}>
                <h1>Create new account</h1>
                <textarea
                  rows="2"
                  placeholder="Mnemonic"
                  name="mnemonic"
                  required
                  value={vault.mnemonic}
                  onChange={handleVaultChange}
                ></textarea>
                <br />
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Passphrase"
                  name="passphrase"
                  value={vault.passphrase}
                  onChange={handleVaultChange}
                />
                <br />
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Password"
                  name="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <br />
                <button type="submit" className="btn">Save</button>
                <br />
                <button type="button" className="btn" onClick={() => { setStep(1); setVault({...vault, mnemonic: '', passphrase: '' }); setPassword('') } }>Back</button>
              </form>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="Popup">
      {isLocked ? (
        <>
          <div className="header">
            <h1>Nostrame</h1>
          </div>

          <div className="container">
            <br />
            <form onSubmit={unlockVault}>
              <label>Vault is locked</label>
              <br />
              <input
                type="password"
                autoComplete="off"
                placeholder="Password"
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <br />
              <button type="submit" className="btn">
                <i className="icon-unlocked"></i>
                &nbsp;
                Unlock now
              </button>
            </form>
          </div>
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
                  <a href="#" onClick={lockVault} title="Lock now">
                    <i className="icon-lock"></i>
                  </a>
                  &nbsp;
                  <a href="#" onClick={generateRandomAccount} title="Generate random account">
                    <i className="icon-loop2"></i>
                  </a>
                  &nbsp;
                  <a href="#" onClick={openOptionsButton} title="Options">
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
                      <button type="button" onClick={deriveNewAccount} title="Derive new account">
                        <strong>+</strong>
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  {accounts.map((account, index) => (
                    <div key={index} className="card">
                      <header className="card-head">
                        <div className="title">
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
                            <a href="#" onClick={() => { setEditAccountModal(true); setAccountEditing(account) }}>
                              <i className="icon-pencil"></i> Edit
                            </a>
                            <a 
                              href="#"
                              onClick={() => { setAccountDetails(account); setShowAccountDetails(true) }}
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
                        <div className="card-title">
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
                            <a href="#" onClick={() => { setEditAccountModal(true); setAccountEditing(account) }} title="Edit">
                              <i className="icon-pencil"></i> Edit
                            </a>
                            <a 
                              href="#"
                              onClick={() => { setAccountDetails(account); setShowAccountDetails(true) }}
                              title="Account details"
                            >
                              <i className="icon-qrcode"></i> Account details
                            </a>
                            <a href="#" onClick={() => { deleteImportedAccount(index) }} title="Remove account">
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
        </>
      )}
    </div>
  );
}

render(<Popup />, document.getElementById('main'))
