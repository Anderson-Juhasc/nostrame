import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { privateKeyFromSeedWords, generateSeedWords } from 'nostr-tools/nip06'
import { Link, Navigate } from 'react-router-dom'
import { encrypt } from '../common'
import { useAuth } from '../middlewares/AuthContext';

const Signin = () => {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/vault" />

  const [password, setPassword] = useState('')
  const [vault, setVault] = useState({
    mnemonic: '',
    passphrase: '',
    accountIndex: 0,
    accounts: [], // maybe change to derivedAccounts
    importedAccounts: [],
  })

  const { login } = useAuth()
  const navigate = useNavigate()

  const handleVaultChange = (e) => {
    const { name, value } = e.target;
    setVault(prevVault => ({
      ...prevVault,
      [name]: value
    }))
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

    await login()

    return navigate('/vault')
  }

  return (
    <>
      <div className="Popup">
        <div className="container">
          <form onSubmit={saveAccount}>
            <h1>Set existing Vault</h1>
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

            <Link to="/" className='btn'>Back</Link>
          </form>
        </div>
      </div>
    </>
  )
}
export default Signin
