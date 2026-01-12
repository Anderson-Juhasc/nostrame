import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { clearSessionPassword, clearSessionVault } from '../common'
import ConfirmModal from '../modals/ConfirmModal'

const ResetVault = ({ fetchData }) => {
  const [showConfirm, setShowConfirm] = useState(false)

  const handleConfirmReset = async () => {
    await clearSessionPassword()
    await clearSessionVault()
    // Remove vault from local storage (cleanup old data) and reset state
    await browser.storage.local.remove(['vault', 'policies'])
    await browser.storage.local.set({
      encryptedVault: '',
      isAuthenticated: false,
      isLocked: false,
    })
    fetchData()
  }

  return (
    <>
      <h2>Reset Vault</h2>

      <button type="button" onClick={() => setShowConfirm(true)}>Reset Vault</button>

      <ConfirmModal
        isOpen={showConfirm}
        title="Reset Vault"
        message="Are you sure you want to reset the vault? Make sure you have made a backup before you continue."
        confirmText="Reset"
        danger={true}
        onConfirm={handleConfirmReset}
        onClose={() => setShowConfirm(false)}
      />
    </>
  )
}
export default ResetVault
