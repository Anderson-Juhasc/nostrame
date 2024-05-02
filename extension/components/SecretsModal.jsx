import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import Modal from './Modal'
import { decrypt } from '../common'

const SecretsModal = ({ isOpen, onClose }) => {
  const [showModal, setShowModal] = useState(isOpen)
  const [password, setPassword] = useState('')
  const [wallet, setWallet] = useState({})
  const [isDecrypted, setIsDecrypted] = useState(false)

  useEffect(() => {
    setShowModal(isOpen)
    if (!isOpen) {
      setIsDecrypted(false)
      setWallet({})
    }
  }, [isOpen])

  const closeModal = () => {
    setShowModal(false)
    onClose()
  }

  const decryptWallet = async (e) => {
    e.preventDefault()

    const storage = await browser.storage.local.get(['encryptedWallet'])
    const decryptedWallet = decrypt(storage.encryptedWallet, password) 
    setIsDecrypted(true)
    setPassword('')
    setWallet(decryptedWallet)
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={onClose}>
        {!isDecrypted ? (
          <form onSubmit={decryptWallet}>
            <label>Wallet is encrypted</label>
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
            <button type="submit" className="btn">Decrypt</button>
          </form>
        ) : (
          <>
            <h2>Secrets</h2>
            <p><strong>Mnemonic:</strong> {wallet.mnemonic}</p>
            { wallet.passphrase && (<p><strong>Passphrase:</strong> {wallet.passphrase}</p>) }
            <p><strong>Account index:</strong> {wallet.accountIndex}</p>
          </>
        )}
      </Modal>
    </div>
  )
}

export default SecretsModal
