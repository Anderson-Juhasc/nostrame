import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import Modal from './Modal'

const SecretsModal = ({ isOpen, onClose }) => {
  const [showModal, setShowModal] = useState(isOpen)
  const [password, setPassword] = useState('')
  const [vault, setVault] = useState({})
  const [isDecrypted, setIsDecrypted] = useState(false)

  useEffect(() => {
    setShowModal(isOpen)
    if (!isOpen) {
      setIsDecrypted(false)
      setVault({})
    }
  }, [isOpen])

  const closeModal = () => {
    setShowModal(false)
    onClose()
  }

  const decryptVault = async (e) => {
    e.preventDefault()

    // Verify password via background
    const response = await browser.runtime.sendMessage({
      type: 'DECRYPT_VAULT_WITH_PASSWORD',
      password
    })

    // Clear password immediately
    setPassword('')

    if (response.success) {
      setIsDecrypted(true)
      setVault(response.vaultData)
    } else {
      toast.error(response.error || 'Invalid password')
    }
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={onClose}>
        {!isDecrypted ? (
          <form onSubmit={decryptVault}>
            <label>Vault is encrypted</label>
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
            <p><strong>Mnemonic:</strong> {vault.mnemonic}</p>
            { vault.passphrase && (<p><strong>Passphrase:</strong> {vault.passphrase}</p>) }
            <p><strong>Account index:</strong> {vault.accountIndex}</p>
          </>
        )}
      </Modal>
    </div>
  )
}

export default SecretsModal
