import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as nip19 from 'nostr-tools/nip19'
import { privateKeyFromSeedWords, generateSeedWords } from 'nostr-tools/nip06'
import { bytesToHex } from 'nostr-tools/utils'
import { getPublicKey } from 'nostr-tools/pure'
import { getSessionVault, setSessionVault } from '../common'
import Loading from '../components/Loading'
import MainContext from '../contexts/MainContext'
import getIdenticon from '../helpers/identicon'

const GeneratorPage = () => {
  const { updateAccounts } = useContext(MainContext)

  const navigate = useNavigate()

  const [format, setFormat] = useState('bech32')
  const [account, setAccount] = useState({})
  const [identicon, setIdenticon] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (account.pubKey) {
      getIdenticon(account.pubKey).then(setIdenticon)
    }
  }, [account.pubKey])

  const fetchData = async () => {
    generateRandomAccount()
    setLoaded(true)
  }

  const generateRandomAccount = () => {
    setIsGenerating(true)

    setTimeout(() => {
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
      setIsGenerating(false)
    }, 150)
  }

  const importAccount = async () => {
    const vault = await getSessionVault()

    if (!vault) {
      toast.error('Session expired. Please unlock your vault again.')
      return
    }

    vault.importedAccounts.push({ prvKey: account.prvKey })
    vault.accountDefault = account.prvKey

    // Encrypt via background (key stays in background memory)
    const response = await browser.runtime.sendMessage({
      type: 'ENCRYPT_VAULT',
      data: vault
    })

    if (!response.success) {
      toast.error('Failed to save vault. Please unlock again.')
      return
    }

    await browser.storage.local.set({ encryptedVault: response.encryptedData })
    await setSessionVault(vault)
    await updateAccounts()

    toast.success('Account imported successfully')
    navigate('/vault')
  }

  const copyToClipboard = (e, text, label) => {
    e.preventDefault()
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  const copyAll = (e) => {
    e.preventDefault()
    const allData = `Mnemonic: ${account.mnemonic}\nPrivate Key (nsec): ${account.nsec}\nPrivate Key (hex): ${account.prvKey}\nPublic Key (npub): ${account.npub}\nPublic Key (hex): ${account.pubKey}`
    navigator.clipboard.writeText(allData)
    toast.success('All keys copied')
  }

  return (
    <div className="Popup">
      <div className="container" style={{ paddingBottom: '96px' }}>
        {loaded ? (
          <div className={`generator ${isGenerating ? 'generator--generating' : ''}`}>
            <div className="generator__preview">
              {identicon && (
                <div className="generator__avatar">
                  <img src={`data:image/svg+xml;base64,${identicon}`} alt="Account avatar" />
                </div>
              )}
              <div className="generator__preview-info">
                <span className="generator__preview-label">New Identity</span>
                <span className="generator__preview-npub">
                  {account.npub ? `${account.npub.slice(0, 12)}...${account.npub.slice(-8)}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="generator__refresh-btn"
                onClick={generateRandomAccount}
                title="Generate new identity"
              >
                <i className={`icon-loop2 ${isGenerating ? 'spinning' : ''}`}></i>
              </button>
            </div>

            <div className="generator__format-toggle">
              <button
                type="button"
                className={format === 'bech32' ? 'active' : ''}
                onClick={() => setFormat('bech32')}
              >
                Bech32
              </button>
              <button
                type="button"
                className={format === 'hex' ? 'active' : ''}
                onClick={() => setFormat('hex')}
              >
                Hex
              </button>
            </div>

            <div className="generator__card">
              <div className="generator__field generator__field--mnemonic">
                <div className="generator__field-header">
                  <label>
                    <i className="icon-key"></i>
                    Recovery Phrase
                  </label>
                  <button
                    type="button"
                    className="generator__copy-btn"
                    onClick={(e) => copyToClipboard(e, account.mnemonic, 'Mnemonic')}
                    title="Copy mnemonic"
                  >
                    <i className="icon-copy"></i>
                  </button>
                </div>
                <div className="generator__mnemonic-grid">
                  {account.mnemonic && account.mnemonic.split(' ').map((word, index) => (
                    <div key={index} className="generator__mnemonic-word">
                      <span className="generator__mnemonic-num">{index + 1}</span>
                      <span className="generator__mnemonic-text">{word}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="generator__field">
                <div className="generator__field-header">
                  <label>
                    <i className="icon-lock"></i>
                    {format === 'bech32' ? 'Private Key (nsec)' : 'Private Key (hex)'}
                  </label>
                  <button
                    type="button"
                    className="generator__copy-btn"
                    onClick={(e) => copyToClipboard(e, format === 'bech32' ? account.nsec : account.prvKey, 'Private key')}
                    title="Copy private key"
                  >
                    <i className="icon-copy"></i>
                  </button>
                </div>
                <input
                  type="text"
                  readOnly
                  value={format === 'bech32' ? (account.nsec || '') : (account.prvKey || '')}
                  onClick={(e) => e.target.select()}
                />
              </div>

              <div className="generator__field">
                <div className="generator__field-header">
                  <label>
                    <i className="icon-user"></i>
                    {format === 'bech32' ? 'Public Key (npub)' : 'Public Key (hex)'}
                  </label>
                  <button
                    type="button"
                    className="generator__copy-btn"
                    onClick={(e) => copyToClipboard(e, format === 'bech32' ? account.npub : account.pubKey, 'Public key')}
                    title="Copy public key"
                  >
                    <i className="icon-copy"></i>
                  </button>
                </div>
                <input
                  type="text"
                  readOnly
                  value={format === 'bech32' ? (account.npub || '') : (account.pubKey || '')}
                  onClick={(e) => e.target.select()}
                />
              </div>

              <button type="button" className="generator__copy-all" onClick={copyAll}>
                <i className="icon-copy"></i>
                Copy All Keys
              </button>
            </div>

            <div className="generator__actions">
              <button type="button" className="generator__btn generator__btn--primary" onClick={importAccount}>
                <i className="icon-download"></i>
                Import to Vault
              </button>
            </div>
          </div>
        ) : (
          <Loading />
        )}
      </div>
    </div>
  )
}

export default GeneratorPage
