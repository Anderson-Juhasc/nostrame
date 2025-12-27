import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { privateKeyFromSeedWords, generateSeedWords } from 'nostr-tools/nip06'
import { bytesToHex } from 'nostr-tools/utils'
import { Link, Navigate } from 'react-router-dom'
import { encrypt, setSessionPassword, setSessionVault } from '../common'
import { useAuth } from '../middlewares/AuthContext';
import MainContext from '../contexts/MainContext'

const Signup = () => {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/vault" />

  const { updateAccounts } = useContext(MainContext)

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

  useEffect(() => {
    handleGenerateSeedWords()
  }, [])

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

    const prvKey = bytesToHex(privateKeyFromSeedWords(vault.mnemonic, vault.passphrase, vaultData.accountIndex))
    vaultData.accounts.push({
      prvKey,
    })

    vaultData.accountDefault = prvKey

    const encryptedVault = encrypt(vaultData, password)

    await setSessionPassword(password)
    await setSessionVault(vaultData)

    await browser.storage.local.set({
      encryptedVault,
      isAuthenticated: true,
    })

    await login()
    await updateAccounts()

    return navigate('/vault')
  }

  const handleGenerateSeedWords = () => {
    let mnemonic = generateSeedWords()
    setVault({
      ...vault,
      mnemonic: mnemonic
    })
  }

  return (
    <>
      <div className="Popup">
        <div className="container">
          <form onSubmit={saveAccount}>
            <h1>Create new vault</h1>
            <textarea
              rows="2"
              placeholder="Mnemonic"
              name="mnemonic"
              readOnly
              required
              value={vault.mnemonic}
              onChange={handleVaultChange}
            ></textarea>
            <br />
            <button type="button" className="btn" onClick={handleGenerateSeedWords}>Generate new mnemonic</button>
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

            <Link to="/" className='btn'>Back</Link>
          </form>
        </div>
      </div>
    </>
  )
}
export default Signup
