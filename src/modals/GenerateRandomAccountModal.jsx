import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { hexToBytes, bytesToHex } from 'nostr-tools/utils'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { encrypt } from '../common'
import Modal from './Modal'

const GenerateRandomAccountModal = ({ isOpen, onClose, callBack }) => {
  const [showModal, setShowModal] = useState(isOpen)
  const [format, setFormat] = useState('bech32')
  const [account, setAccount] = useState({})

  useEffect(() => {
    setShowModal(isOpen)

    if (isOpen) {
      generateRandomAccount()
    }
  }, [isOpen])

  const generateRandomAccount = () => {
    const prvKey = bytesToHex(generateSecretKey())
    const nsec = nip19.nsecEncode(hexToBytes(prvKey))
    const pubKey = getPublicKey(prvKey)
    const npub = nip19.npubEncode(pubKey)

    setAccount({
      prvKey,
      nsec,
      pubKey,
      npub
    })
  }

  const importAccount = async () => {
    const storage = await browser.storage.local.get(['vault', 'password'])
    const vault = storage.vault
    vault.importedAccounts.push({ prvKey: account.prvKey })
    const encryptedVault = encrypt(vault, storage.password)
    await browser.storage.local.set({ 
      vault,
      encryptedVault,
    })

    callBack()
    closeModal()
  }

  const closeModal = () => {
    setShowModal(false)
    onClose()
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
    <div>
      <Modal isOpen={showModal} onClose={closeModal}>
        <h2>Generate Account</h2>

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
      </Modal>
    </div>
  )
}

export default GenerateRandomAccountModal
