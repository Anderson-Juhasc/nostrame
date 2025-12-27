import browser from 'webextension-polyfill'
import React from 'react'
import { clearSessionPassword, clearSessionVault } from '../common'

const ResetVault = ({ fetchData }) => {
  const handleResetVault = async () => {
    if (confirm("Are you sure you want to reset the vault? Make sure if you have made a backup before you continue.")) {
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
  }

  return (
    <>
      <h2>Reset Vault</h2>

      <button type="button" onClick={handleResetVault}>Reset Vault</button>
    </>
  )
}
export default ResetVault
