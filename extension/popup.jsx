import browser from 'webextension-polyfill'
import {render} from 'react-dom'
import React, { useState, useEffect } from 'react'
import CryptoJS from 'crypto-js'
import { getPublicKey } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import { privateKeyFromSeedWords, generateSeedWords, validateWords } from 'nostr-tools/nip06'
import {hexToBytes, bytesToHex} from '@noble/hashes/utils'
import { encrypt, decrypt } from './common'

function Popup() {
  const [masterPassword, setMasterPassword] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [wallet, setWallet] = useState({
    mnemonic: '',
    passphrase: '',
    accountIndex: 0,
    accounts: [],
  })
  const [accounts, setAccounts] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [accountEditing, setAccountEditing] = useState({})

  useEffect(async () => {
    fetchData()
  }, []);

  const fetchData = async () => {
    const storage = await browser.storage.local.get()

    console.log(storage)

    if (storage.isLocked) {
      setIsLocked(true)
    }

    if (storage.isAuthenticated) {
      let loadAccounts = []
      let l = storage.wallet.accounts.length
      for (let i = 0; i < l; i++) {
        const prvKey = storage.wallet.accounts[i].prvKey
        const nsec = nip19.nsecEncode(hexToBytes(prvKey))
        const pubKey = getPublicKey(prvKey)
        const npub = nip19.npubEncode(pubKey)
        loadAccounts = [
          ...loadAccounts, 
          { 
            index: i,
            name: storage.wallet.accounts[i].name,
            prvKey,
            nsec,
            pubKey,
            npub,
            format: 'bech32'
          }
        ]
      }
      setIsAuthenticated(storage.isAuthenticated)
      setWallet(storage.wallet)
      setAccounts(loadAccounts)
    }
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
  }

  const handleModalOpen = (account) => {
    setIsModalOpen(true)
    setAccountEditing(account)
  }

  const saveEditingAccount = async (e) => {
    e.preventDefault()
    const storage = await browser.storage.local.get(['wallet', 'password'])
    let walletData = storage.wallet

    walletData.accounts.forEach((item) => {
      if (item.index === accountEditing.index) {
        item.name = accountEditing.name
      }
    })

    const encryptedWallet = encrypt(walletData, storage.password)
    await browser.storage.local.set({ 
      wallet: walletData,
      encryptedWallet,
    })

    handleModalClose()
    fetchData()
    setAccountEditing({})
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000); // Reset copied state after 2 seconds
      })
      .catch((error) => {
        console.error('Failed to copy to clipboard:', error);
      });
  };
  
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

  async function toggleFormat(account) {
    let newFormat = account.format === 'bech32' ? 'hex' : 'bech32'
    setAccounts((prevAccounts) => {
      prevAccounts[account.index]['format'] = newFormat
      return [...prevAccounts]
    });
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
      accounts: []
    }

    const prvKey = privateKeyFromSeedWords(walletData.mnemonic, walletData.passphrase, walletData.accountIndex)
    walletData.accounts.push({
      index: walletData.accountIndex,
      name: 'Account ' + walletData.accountIndex,
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

  const handleFileChange = (event) => {
    const file = event.target.files[0]
    setFile(file)
  }

  const handleWalletImport = (e) => {
    e.preventDefault()
    if (file) {
      const reader = new FileReader()
      reader.onload = async () => {
        const encryptedWallet = (JSON.parse(reader.result)).backup
        try {
          const walletData = decrypt(encryptedWallet, password) 
          await browser.storage.local.set({ 
            wallet: walletData,
            encryptedWallet,
            isAuthenticated: true,
            password
          })
          setStep(1)
          setPassword('')
          fetchData()
        } catch (e) {
          console.log(e)
        }
      }
      reader.readAsText(file)
    }
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
      name: 'Account ' + walletData.accountIndex,
      prvKey,
    })
    const encryptedWallet = encrypt(walletData, storage.password)
    await browser.storage.local.set({ 
      wallet: walletData,
      encryptedWallet,
    })
    fetchData()
  }

  const lockWallet = async () => {
    setIsLocked(true)
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

  if (!isAuthenticated) {
    switch (step) {
      case 1: 
        return (
          <div className="App">
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
          <div className="App">
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
                placeholder="Passphrase"
                name="passphrase"
                value={wallet.passphrase}
                onChange={handleWalletChange}
              />
              <br />
              <input
                type="password"
                placeholder="Password"
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <br />
              <button type="submit" className="btn">Save</button>
              <br />
              <button type="button" className="btn" onClick={() => { setStep(1); setWallet({...wallet, mnemonic: '' }) } }>Back</button>
            </form>
          </div>
        )
      case 3: 
        return (
          <div className="App">
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
                placeholder="Passphrase"
                name="passphrase"
                value={wallet.passphrase}
                onChange={handleWalletChange}
              />
              <br />
              <input
                type="password"
                placeholder="Password"
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <br />
              <button type="submit" className="btn">Save</button>
              <br />
              <button type="button" className="btn" onClick={() => { setStep(1); setWallet({...wallet, mnemonic: '' }) } }>Back</button>
            </form>
          </div>
        )
    }
  }

  return (
    <div className="App container">
      <h1>Nostrame</h1>
      {isLocked ? (
        <form onSubmit={unlockWallet}>
          <label>Wallet is locked</label>
          <br />
          <input
            type="password"
            placeholder="Password"
            name="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <br />
          <button type="submit" className="btn">Unlock now</button>
        </form>
      ) : (
        <>
          <button type="button" onClick={deriveNewAccount}>Derive new account</button>
          &nbsp;
          <button type="button" onClick={lockWallet}>Lock now</button>
          &nbsp;
          <button type="button" onClick={openOptionsButton}>Options</button>
          <div>
            <h2>Accounts</h2>
            <div>
              {accounts.map((account, index) => (
                <div key={index} className="break-string">
                  <strong>{account.name}:</strong>
                  &nbsp;
                  <button onClick={() => toggleFormat(account)}>{account.format === 'bech32' ? 'hex' : 'bech32'}</button>
                  &nbsp;
                  <button type="button" onClick={() => { handleModalOpen(account) }}>Edit</button>
                  <br />
                  <strong>{account.format === 'bech32' ? 'nsec' : 'Private Key'}:</strong>
                  &nbsp;
                  {account.format === 'bech32' ? hideStringMiddle(account.nsec) : hideStringMiddle(account.prvKey)}
                  &nbsp;
                  <button onClick={() => copyToClipboard(account.format === 'bech32' ? account.nsec : account.prvKey)}>Copy</button>
                  <br />
                  <strong>{account.format === 'bech32' ? 'npub' : 'Public Key'}:</strong>
                  &nbsp;
                  {account.format === 'bech32' ? hideStringMiddle(account.npub) : hideStringMiddle(account.pubKey)}
                  &nbsp;
                  <button onClick={() => copyToClipboard(account.format === 'bech32' ? account.npub : account.pubKey)}>Copy</button>
                  <hr />
                </div>
              ))}
            </div>
          </div>

          {isModalOpen && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-content">
                  <span className="close" onClick={handleModalClose}>
                    &times;
                  </span>
                  <h2>Edit Account</h2>
                  <form onSubmit={saveEditingAccount}>
                    <input
                      type="text"
                      placeholder="Name"
                      name="name"
                      value={accountEditing.name}
                      onChange={accountEditingChange}
                    />
                    <br />
                    <button className="btn" type="submit">Save</button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

render(<Popup />, document.getElementById('main'))
