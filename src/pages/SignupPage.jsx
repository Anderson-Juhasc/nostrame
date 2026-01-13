import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext } from 'react'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'
import { privateKeyFromSeedWords, generateSeedWords, validateWords } from 'nostr-tools/nip06'
import { bytesToHex, hexToBytes } from 'nostr-tools/utils'
import { getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import { Link, Navigate } from 'react-router-dom'
import { encrypt, setSessionPassword, setSessionVault } from '../common'
import { useAuth } from '../middlewares/AuthContext'
import MainContext from '../contexts/MainContext'
import Loading from '../components/Loading'
import { ensureRelayListExists } from '../helpers/outbox'

const Signup = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <Loading />
  if (isAuthenticated) return <Navigate to="/vault" />

  const { updateAccounts } = useContext(MainContext)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

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
      await updateAccounts()

      // Publish default relay list if account doesn't have one
      const pubkey = getPublicKey(hexToBytes(prvKey))
      ensureRelayListExists(pubkey, hexToBytes(prvKey), finalizeEvent)

      toast.success('Vault created successfully')

      return navigate('/vault')
    } catch (err) {
      toast.error('Failed to create vault')
    }
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <br />
            <input
              type="password"
              autoComplete="off"
              placeholder="Confirm password"
              name="confirmPassword"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
