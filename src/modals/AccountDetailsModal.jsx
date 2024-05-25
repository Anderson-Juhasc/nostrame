import React, { useState, useEffect } from 'react'
import {QRCodeSVG} from 'qrcode.react'
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

  async function convertFormat(e) {
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
          </>
        ) : (
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
        )}
      </Modal>
    </div>
  )
}

export default AccountDetailsModal
