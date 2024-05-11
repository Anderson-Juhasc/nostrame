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
import QRCodeModal from './components/QRCodeModal'
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
  const [wallet, setWallet] = useState({
    mnemonic: '',
    passphrase: '',
    accountIndex: 0,
    accounts: [], // maybe change to derivedAccounts
    importedAccounts: [],
  })
  const [encryptedWallet, setEncryptedWallet] = useState('')
  const [accounts, setAccounts] = useState([])
  const [importedAccounts, setImportedAccounts] = useState([])
  const [accountEditing, setAccountEditing] = useState({})
  const [relay, setRelay] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [showEditAccountModal, setEditAccountModal] = useState(false)
  const [showImportAccountModal, setShowImportAccountModal] = useState(false)
  const [qrCodeKey, setQRCodeKey] = useState('')
  const [qrCodeModal, setQRCodeModal] = useState(false)
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
      let l = storage.wallet.accounts.length
      for (let i = 0; i < l; i++) {
        const prvKey = storage.wallet.accounts[i].prvKey
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

      let len = storage.wallet.importedAccounts.length
      for (let i = 0; i < len; i++) {
        const prvKey = storage.wallet.importedAccounts[i].prvKey
        const index = storage.wallet.importedAccounts[i].index
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

      setWallet(storage.wallet)
      setEncryptedWallet(storage.encryptedWallet)

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
  
  const handleWalletChange = (e) => {
    const { name, value } = e.target;
    setWallet(prevWallet => ({
      ...prevWallet,
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
    setWallet({
      ...wallet,
      mnemonic: mnemonic
    })
  }

  async function saveAccount(e) {
    e.preventDefault()

    const walletData = {
      mnemonic: wallet.mnemonic,
      passphrase: wallet.passphrase,
      accountIndex: 0,
      accounts: [],
      importedAccounts: [],
    }

    const prvKey = privateKeyFromSeedWords(walletData.mnemonic, walletData.passphrase, walletData.accountIndex)
    walletData.accounts.push({
      index: walletData.accountIndex,
      prvKey,
    })

    const encryptedWallet = encrypt(walletData, password)
    await browser.storage.local.set({ 
      wallet: walletData,
      encryptedWallet,
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
    const storage = await browser.storage.local.get(['wallet', 'password'])
    let walletData = storage.wallet
    walletData.accountIndex++
    const prvKey = privateKeyFromSeedWords(walletData.mnemonic, walletData.passphrase, walletData.accountIndex)
    walletData.accounts.push({
      index: walletData.accountIndex,
      prvKey,
    })
    const encryptedWallet = encrypt(walletData, storage.password)
    await browser.storage.local.set({ 
      wallet: walletData,
      encryptedWallet,
    })
    setLoaded(false)
    fetchData()
  }

  const generateRandomAccount = async () => {
    const storage = await browser.storage.local.get(['wallet', 'password'])
    const wallet = storage.wallet
    const prvKeyHex = bytesToHex(generateSecretKey())
    const len = wallet.importedAccounts.length
    wallet.importedAccounts.push({ index: len, prvKey: prvKeyHex })
    const encryptedWallet = encrypt(wallet, storage.password)
    await browser.storage.local.set({ 
      wallet,
      encryptedWallet,
    })
    setLoaded(false)
    fetchData()
  }

  const lockWallet = async () => {
    setIsLocked(true)
    setAccounts([])
    setLoaded(false)
    await browser.storage.local.set({ 
      isLocked: true,
      wallet: {
        accounts: [],
      },
      password: '',
    })
  }

  const unlockWallet = async (e) => {
    e.preventDefault()
    const storage = await browser.storage.local.get(['encryptedWallet'])
    const walletData = decrypt(storage.encryptedWallet, password) 
    setIsLocked(false)
    await browser.storage.local.set({ 
      isLocked: false,
      wallet: walletData,
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
      const newImportedAccounts = [...importedAccounts]
      if (index !== -1) {
        newImportedAccounts.splice(index, 1)
        setImportedAccounts(newImportedAccounts)
      }
      wallet.importedAccounts = newImportedAccounts
      await browser.storage.local.set({ 
        wallet,
      })
    }
  }

  if (!isAuthenticated) {
    switch (step) {
      case 1: 
        return (
          <div className="Popup">
            <h1>Nostrame</h1>
            <button type="button" className="btn" onClick={() => setStep(2)}>I have an account</button>
            <br />
            <button type="button" className="btn" onClick={openOptionsButton}>Import backup</button>
            <br />
            <button type="button" className="btn" onClick={createNewAccount}>Create new account</button>
          </div>
        )
      case 2: 
        return (
          <div className="Popup">
            <form onSubmit={saveAccount}>
              <h1>Create new account</h1>
              <textarea
                rows="2"
                placeholder="Mnemonic"
                name="mnemonic"
                required
                value={wallet.mnemonic}
                onChange={handleWalletChange}
              ></textarea>
              <br />
              <input
                type="text"
                autoComplete="off"
                placeholder="Passphrase"
                name="passphrase"
                value={wallet.passphrase}
                onChange={handleWalletChange}
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
              <button type="button" className="btn" onClick={() => { setStep(1); setWallet({...wallet, mnemonic: '', passphrase: '' }); setPassword('') } }>Back</button>
            </form>
          </div>
        )
      case 3: 
        return (
          <div className="Popup">
            <form onSubmit={saveAccount}>
              <h1>Create new account</h1>
              <textarea
                rows="2"
                placeholder="Mnemonic"
                name="mnemonic"
                required
                value={wallet.mnemonic}
                onChange={handleWalletChange}
              ></textarea>
              <br />
              <input
                type="password"
                autoComplete="off"
                placeholder="Passphrase"
                name="passphrase"
                value={wallet.passphrase}
                onChange={handleWalletChange}
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
              <button type="button" className="btn" onClick={() => { setStep(1); setWallet({...wallet, mnemonic: '', passphrase: '' }); setPassword('') } }>Back</button>
            </form>
          </div>
        )
    }
  }

  return (
    <div className="Popup container">
      {isLocked ? (
        <>
          <div className="header">
            <h1>Nostrame</h1>
          </div>

          <div className="container">
            <br />
            <form onSubmit={unlockWallet}>
              <label>Wallet is locked</label>
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
                  <a href="#" onClick={lockWallet} title="Lock now">
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
              Loading...
            </>
          )}

          <QRCodeModal 
            isOpen={qrCodeModal}
            keyValue={qrCodeKey}
            onClose={() => setQRCodeModal(false)}
          ></QRCodeModal>

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
