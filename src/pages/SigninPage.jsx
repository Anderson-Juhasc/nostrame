import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { privateKeyFromSeedWords, generateSeedWords, validateWords } from 'nostr-tools/nip06'
import { bytesToHex } from 'nostr-tools/utils'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { encrypt, setSessionPassword, setSessionVault } from '../common'
import { useAuth } from '../middlewares/AuthContext'
import Loading from '../components/Loading'

const Signin = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <Loading />
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

  useEffect(() => {
    const handleStorageChange = async (changes) => {
      if (changes.isAuthenticated?.newValue) {
        await login()
        navigate('/vault')
      }
    }

    browser.storage.onChanged.addListener(handleStorageChange)

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [login, navigate])

  const handleVaultChange = (e) => {
    const { name, value } = e.target;
    setVault(prevVault => ({
      ...prevVault,
      [name]: value
    }))
  }

  async function saveAccount(e) {
    e.preventDefault()

    if (!validateWords(vault.mnemonic)) {
      toast.error('Invalid mnemonic')
      return
    }

    try {
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
      toast.success('Vault imported successfully')

      return navigate('/vault')
    } catch (err) {
      toast.error('Invalid mnemonic or failed to import vault')
    }
  }

  const openOptionsButton = async () => {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage()
    } else {
      window.open(browser.runtime.getURL('options.html'))
    }
  }

  return (
    <>
      <div className="Popup">
        <div className="container">
          <form onSubmit={saveAccount}>
            <h1>Import Vault</h1>
            <br />
            <button type="button" className="btn" onClick={openOptionsButton}>Import JSON file</button>
            <br />
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
