import browser from 'webextension-polyfill'
import React from 'react'

const ExportVault = () => {
  const handleVaultExport = async () => {
    const storage = await browser.storage.local.get(['encryptedVault'])
    const jsonData = JSON.stringify({ vault: storage.encryptedVault }, null, 2)
    const blob = new Blob([jsonData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = ('0' + (currentDate.getMonth() + 1)).slice(-2)
    const day = ('0' + currentDate.getDate()).slice(-2)
    const hours = ('0' + currentDate.getHours()).slice(-2)
    const minutes = ('0' + currentDate.getMinutes()).slice(-2)
    const seconds = ('0' + currentDate.getSeconds()).slice(-2)

    a.href = url
    a.download = `NostrameVaultData.${year}_${month}_${day}_${hours}_${minutes}_${seconds}.json`
    a.click()
  }

  return (
    <div className="options-card">
      <div className="options-card__header">
        <div className="options-card__icon">
          <i className="icon-folder-download"></i>
        </div>
        <div className="options-card__title">
          <h3>Export Vault</h3>
          <p>Download an encrypted backup of your vault</p>
        </div>
      </div>
      <div className="options-card__content">
        <p className="options-card__description">
          Your backup file is encrypted with your password. Keep it safe and never share it with anyone.
        </p>
        <button type="button" className="options-card__btn" onClick={handleVaultExport}>
          <i className="icon-download"></i>
          Download Backup
        </button>
      </div>
    </div>
  )
}
export default ExportVault
