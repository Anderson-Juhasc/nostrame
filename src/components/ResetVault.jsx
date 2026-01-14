import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { clearSessionVault } from '../common'
import { clearEncryptedCache } from '../services/cache'
import ConfirmModal from '../modals/ConfirmModal'

const ResetVault = ({ fetchData }) => {
  const [showConfirm, setShowConfirm] = useState(false)

  const handleConfirmReset = async () => {
    // Lock vault to clear key from background memory
    await browser.runtime.sendMessage({ type: 'LOCK_VAULT' })
    await clearSessionVault()
    // Clear encrypted cache from local storage
    await clearEncryptedCache()
    // Remove vault from local storage (cleanup old data) and reset state
    await browser.storage.local.remove(['vault', 'policies'])
    await browser.storage.local.set({
      encryptedVault: '',
      isAuthenticated: false,
      uiHintLocked: false,
    })
    fetchData()
  }

  return (
    <div className="options-card options-card--danger">
      <div className="options-card__header">
        <div className="options-card__icon options-card__icon--danger">
          <i className="icon-warning"></i>
        </div>
        <div className="options-card__title">
          <h3>Reset Vault</h3>
          <p>Permanently delete all stored data</p>
        </div>
      </div>
      <div className="options-card__content">
        <p className="options-card__description options-card__description--danger">
          This action will permanently delete your vault and all stored accounts. Make sure you have exported a backup before proceeding.
        </p>
        <button
          type="button"
          className="options-card__btn options-card__btn--danger"
          onClick={() => setShowConfirm(true)}
        >
          <i className="icon-bin"></i>
          Reset Vault
        </button>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="Reset Vault"
        message="Are you sure you want to reset the vault? Make sure you have made a backup before you continue."
        confirmText="Reset"
        danger={true}
        onConfirm={handleConfirmReset}
        onClose={() => setShowConfirm(false)}
      />
    </div>
  )
}
export default ResetVault
