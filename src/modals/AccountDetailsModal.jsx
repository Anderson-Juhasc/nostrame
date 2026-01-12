import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import {QRCodeSVG} from 'qrcode.react'
import * as nip49 from 'nostr-tools/nip49'
import { hexToBytes } from 'nostr-tools/utils'
import Modal from './Modal'

const AccountDetailsModal = ({ isOpen, onClose, accountData }) => {
  const [showModal, setShowModal] = useState(isOpen)
  const [account, setAccount] = useState({})
  const [format, setFormat] = useState('bech32')
  const [showSecret, setShowSecret] = useState(false)
  const [showNcryptsec, setShowNcryptsec] = useState(false)
  const [ncryptsecPassword, setNcryptsecPassword] = useState('')
  const [ncryptsec, setNcryptsec] = useState('')

  useEffect(() => {
    setShowModal(isOpen)
  }, [isOpen])

  useEffect(() => {
    setAccount(accountData)
  }, [accountData])

  const closeModal = () => {
    setShowModal(false)
    setShowSecret(false)
    setShowNcryptsec(false)
    setNcryptsecPassword('')
    setNcryptsec('')
    onClose()
  }

  const generateNcryptsec = async (e) => {
    e.preventDefault()
    if (!ncryptsecPassword) {
      toast.error('Please enter a password')
      return
    }
    try {
      const prvKeyBytes = hexToBytes(account.prvKey)
      const encrypted = await nip49.encrypt(prvKeyBytes, ncryptsecPassword)
      setNcryptsec(encrypted)
      toast.success('Encrypted key generated')
    } catch (err) {
      toast.error('Error generating ncryptsec')
    }
  }

  const copyToClipboard = (e, text) => {
    e.preventDefault()
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  async function convertFormat(e) {
    e.preventDefault()
    setFormat(format === 'bech32' ? 'hex' : 'bech32')
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={closeModal}>
        { !showSecret && !showNcryptsec ? (
          <>
            <h2 style={{ textAlign: 'center' }}>{account.name}</h2>
            <div style={{ height: "auto", margin: "0 auto", maxWidth: 200, width: "100%" }}>
              <QRCodeSVG
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                size={256}
                value={(format === 'bech32' ? account.npub : account.pubKey)}
              />
            </div>
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

            <button className="btn" onClick={() => setShowSecret(true)}>Show private key</button>
            <br />
            <button className="btn" onClick={() => setShowNcryptsec(true)}>Export encrypted (NIP-49)</button>
          </>
        ) : showSecret ? (
          <>
            <h2 style={{ textAlign: 'center' }}>Private key</h2>
            <div style={{ height: "auto", margin: "0 auto", maxWidth: 200, width: "100%" }}>
              <QRCodeSVG
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                size={256}
                value={(format === 'bech32' ? account.nsec : account.prvKey)}
              />
            </div>
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

            <button className="btn" onClick={() => setShowSecret(false)}>Back</button>
          </>
        ) : (
          <>
            <h2 style={{ textAlign: 'center' }}>Export Encrypted Key</h2>
            {!ncryptsec ? (
              <form onSubmit={generateNcryptsec}>
                <p>Enter a password to encrypt your private key (NIP-49):</p>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Encryption password"
                  value={ncryptsecPassword}
                  onChange={(e) => setNcryptsecPassword(e.target.value)}
                  required
                />
                <br />
                <button type="submit" className="btn">Generate ncryptsec</button>
                <br />
                <button type="button" className="btn" onClick={() => { setShowNcryptsec(false); setNcryptsecPassword(''); }}>Back</button>
              </form>
            ) : (
              <>
                <div style={{ height: "auto", margin: "0 auto", maxWidth: 200, width: "100%" }}>
                  <QRCodeSVG
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    size={256}
                    value={ncryptsec}
                  />
                </div>
                <p className="break-string">
                  <strong>ncryptsec:</strong>
                  <br />
                  {ncryptsec}
                  &nbsp;
                  <a href="#" onClick={(e) => copyToClipboard(e, ncryptsec)} title="Copy">
                    <i className="icon-copy"></i>
                  </a>
                </p>
                <button className="btn" onClick={() => { setShowNcryptsec(false); setNcryptsecPassword(''); setNcryptsec(''); }}>Back</button>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}

export default AccountDetailsModal
