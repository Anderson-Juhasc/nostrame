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
    const month = ('0' + (currentDate.getMonth() + 1)).slice(-2) // Adding 1 to month since it's zero-based
    const day = ('0' + currentDate.getDate()).slice(-2)
    const hours = ('0' + currentDate.getHours()).slice(-2)
    const minutes = ('0' + currentDate.getMinutes()).slice(-2)
    const seconds = ('0' + currentDate.getSeconds()).slice(-2)

    a.href = url
    a.download = `NostrameVaultData.${year}_${month}_${day}_${hours}_${minutes}_${seconds}.json`
    a.click()
  }

  return (
    <>
      <h2>Export Vault</h2>
      <button type="button" onClick={handleVaultExport}>Export backup</button>
    </>
  )
}
export default ExportVault
