import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { privateKeyFromSeedWords, generateSeedWords } from 'nostr-tools/nip06'
import { encrypt } from '../common'

const Login = ({ fetchData }) => {
  const [step, setStep] = useState(1)
  const [password, setPassword] = useState('')
  const [vault, setVault] = useState({
    mnemonic: '',
    passphrase: '',
    accountIndex: 0,
    accounts: [], // maybe change to derivedAccounts
    importedAccounts: [],
  })

  const openOptionsButton = async () => {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage()
    } else {
      window.open(browser.runtime.getURL('options.html'))
    }
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

  const handleVaultChange = (e) => {
    const { name, value } = e.target;
    setVault(prevVault => ({
      ...prevVault,
      [name]: value
    }))
  }

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
export default Login
