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

    navigate('/vault')
  }

  const convertFormat = (e) => {
    e.preventDefault()
    setFormat(format === 'bech32' ? 'hex' : 'bech32')
  }

  const copyToClipboard = (e, text) => {
    e.preventDefault()
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="Popup">
      <div className="container">
        <>
          {loaded ? (
            <>
              <h2>Generate Account</h2>

              <p className="break-string">
                <strong>Mnemonic:</strong>
                &nbsp;
                <br />
                {account.mnemonic}
                &nbsp;
                <a href="#" onClick={(e) => copyToClipboard(e, account.mnemonic)} title="Copy">
                  <i className="icon-copy"></i>
                </a>
              </p>
              <p className="break-string">
                <strong>{format === 'bech32' ? 'Nsec' : `Private Key`}:</strong>
                &nbsp;
                <a href="#" onClick={(e) => convertFormat(e)} title={format === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
                  <i className="icon-tab"></i>
                </a>
                <br />
                {format === 'bech32' ? account.nsec : account.prvKey}
                &nbsp;
                <a href="#" onClick={(e) => copyToClipboard(e, format === 'bech32' ? account.nsec : account.prvKey)} title="Copy">
                  <i className="icon-copy"></i>
                </a>
              </p>
              <p className="break-string">
                <strong>{format === 'bech32' ? 'Npub' : 'Public Key'}:</strong>
                &nbsp;
                <a href="#" onClick={(e) => convertFormat(e)} title={format === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
                  <i className="icon-tab"></i>
                </a>
                <br />
                {format === 'bech32' ? account.npub : account.pubKey}
                &nbsp;
                <a href="#" onClick={(e) => copyToClipboard(e, format === 'bech32' ? account.npub : account.pubKey)} title="Copy">
                  <i className="icon-copy"></i>
                </a>
              </p>

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