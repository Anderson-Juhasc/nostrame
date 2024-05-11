import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import QRCode from "react-qr-code"
import Modal from './Modal'

const AccountDetailsModal = ({ isOpen, onClose, accountData }) => {
  const [showModal, setShowModal] = useState(isOpen)
  const [account, setAccount] = useState({})
  const [format, setFormat] = useState('bech32')
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => {
    setShowModal(isOpen)
  }, [isOpen])

  useEffect(() => {
    setAccount(accountData)
  }, [accountData])

  const closeModal = () => {
    setShowModal(false)
    setShowSecret(false)
    onClose()
  }

  const copyToClipboard = (e, text) => {
    e.preventDefault()
    navigator.clipboard.writeText(text)
  }

  async function convertFormat(e, account) {
    e.preventDefault()
    setFormat(format === 'bech32' ? 'hex' : 'bech32')
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={closeModal}>
        { !showSecret ? ( 
          <>
            <h2 style={{ textAlign: 'center' }}>{account.name}</h2>
            <div style={{ height: "auto", margin: "0 auto", maxWidth: 200, width: "100%" }}>
              <QRCode
                size={256}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                value={(format === 'bech32' ? account.npub : account.pubKey) || ''}
                viewBox={`0 0 256 256`}
              />
            </div>
            <p className="break-string">
              <strong>{format === 'bech32' ? 'Npub' : 'Public Key'}:</strong>
              &nbsp;
              <a href="#" onClick={(e) => convertFormat(e, account)} title={format === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
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
          </>
        ) : (
          <>
            <h2 style={{ textAlign: 'center' }}>Show private key</h2>
            <div style={{ height: "auto", margin: "0 auto", maxWidth: 200, width: "100%" }}>
              <QRCode
                size={256}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                value={format === 'bech32' ? account.nsec : account.prvKey || ''}
                viewBox={`0 0 256 256`}
              />
            </div>
            <p className="break-string">
              <strong>{format === 'bech32' ? 'Nsec' : `Private Key`}:</strong>
              &nbsp;
              <a href="#" onClick={(e) => convertFormat(e, account)} title={format === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
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
        )}
      </Modal>
    </div>
  )
}

export default AccountDetailsModal
