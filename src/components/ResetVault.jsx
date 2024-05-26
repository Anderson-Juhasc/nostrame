import browser from 'webextension-polyfill'
import React from 'react'

const ResetVault = ({ fetchData }) => {
  const handleResetVault = async () => {
    if (confirm("Are you sure you want to reset the vault? Make sure if you have made a backup before you continue.")) {
      await browser.storage.local.set({ 
        encryptedVault: '',
        vault: {},
        password: '',
        isAuthenticated: false,
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
