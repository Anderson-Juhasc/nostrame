import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as nip19 from 'nostr-tools/nip19'
import { privateKeyFromSeedWords, generateSeedWords } from 'nostr-tools/nip06'
import { bytesToHex } from 'nostr-tools/utils'
import { getPublicKey } from 'nostr-tools/pure'
import { encrypt, getSessionPassword, getSessionVault, setSessionVault } from '../common'
import Loading from '../components/Loading'
import MainContext from '../contexts/MainContext'

const GeneratorPage = () => {
  const { updateAccounts } = useContext(MainContext)

  const navigate = useNavigate()

  const [format, setFormat] = useState('bech32')
  const [account, setAccount] = useState({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    generateRandomAccount()

    setLoaded(true)
  }

  const generateRandomAccount = () => {
    const mnemonic = generateSeedWords()
    const prvKeyBytes = privateKeyFromSeedWords(mnemonic)
    const prvKey = bytesToHex(prvKeyBytes)
    const nsec = nip19.nsecEncode(prvKeyBytes)
    const pubKey = getPublicKey(prvKeyBytes)
    const npub = nip19.npubEncode(pubKey)

    setAccount({
      mnemonic,
      prvKey,
      nsec,
      pubKey,
      npub
    })
  }

  const importAccount = async () => {
    const vault = await getSessionVault()
    const password = await getSessionPassword()

    if (!password || !vault) {
      toast.error('Session expired. Please unlock your vault again.')
      return
    }

    vault.importedAccounts.push({ prvKey: account.prvKey })
    vault.accountDefault = account.prvKey
    const encryptedVault = encrypt(vault, password)
    await browser.storage.local.set({ encryptedVault })
    await setSessionVault(vault)
    await updateAccounts()

    toast.success('Account imported successfully')
    navigate('/vault')
  }

  const convertFormat = (e) => {
    e.preventDefault()
    setFormat(format === 'bech32' ? 'hex' : 'bech32')
  }

  const copyToClipboard = (e, text) => {
    e.preventDefault()
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="Popup">
      <div className="container" style={{ paddingBottom: '96px' }}>
        <>
          {loaded ? (
            <>
              <h2>Generate Account</h2>

              <div className="form-group">
                <label>
                  Mnemonic
                  <a href="#" onClick={(e) => copyToClipboard(e, account.mnemonic)} title="Copy">
                    <i className="icon-copy"></i>
                  </a>
                </label>
                <textarea
                  readOnly
                  rows="2"
                  value={account.mnemonic || ''}
                  onClick={(e) => e.target.select()}
                />
              </div>

              <div className="form-group">
                <label>
                  {format === 'bech32' ? 'Nsec' : 'Private Key'}
                  <a href="#" onClick={(e) => convertFormat(e)} title={format === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
                    <i className="icon-tab"></i>
                  </a>
                  <a href="#" onClick={(e) => copyToClipboard(e, format === 'bech32' ? account.nsec : account.prvKey)} title="Copy">
                    <i className="icon-copy"></i>
                  </a>
                </label>
                <input
                  type="text"
                  readOnly
                  value={format === 'bech32' ? account.nsec : account.prvKey}
                  onClick={(e) => e.target.select()}
                />
              </div>

              <div className="form-group">
                <label>
                  {format === 'bech32' ? 'Npub' : 'Public Key'}
                  <a href="#" onClick={(e) => convertFormat(e)} title={format === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
                    <i className="icon-tab"></i>
                  </a>
                  <a href="#" onClick={(e) => copyToClipboard(e, format === 'bech32' ? account.npub : account.pubKey)} title="Copy">
                    <i className="icon-copy"></i>
                  </a>
                </label>
                <input
                  type="text"
                  readOnly
                  value={format === 'bech32' ? account.npub : account.pubKey}
                  onClick={(e) => e.target.select()}
                />
              </div>

              <button type="button" className="btn" onClick={generateRandomAccount}>Generate new</button>
              <br />
              <button type="button" className="btn" onClick={importAccount}>Import account</button>
            </>
          ) : (
            <Loading />
          )}
        </>
      </div>
    </div>
  )
}

export default GeneratorPage
