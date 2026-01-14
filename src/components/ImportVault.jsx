import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { toast } from 'react-toastify'

const ImportVault = ({ fetchData }) => {
  const [file, setFile] = useState(null)
  const [fileName, setFileName] = useState('')
  const [password, setPassword] = useState('')

  const handleFileChange = (e) => {
    e.preventDefault()
    const selectedFile = e.target.files[0]
    setFile(selectedFile)
    setFileName(selectedFile ? selectedFile.name : '')
  }

  const handleVaultImport = (e) => {
    e.preventDefault()
    if (file) {
      const reader = new FileReader()
      reader.onload = async () => {
        const encryptedVault = (JSON.parse(reader.result)).vault

        // Import vault via background (key stays in background memory)
        const response = await browser.runtime.sendMessage({
          type: 'IMPORT_VAULT_BACKUP',
          encryptedVault,
          password
        })

        // Clear password immediately
        setPassword('')

        if (response.success) {
          await browser.storage.local.set({
            encryptedVault: response.encryptedVault,
            isAuthenticated: true,
            isLocked: false,
          })
          setFile(null)
          setFileName('')
          toast.success('Vault imported successfully')
          fetchData()
        } else {
          toast.error(response.error || 'Invalid vault file or wrong password')
        }
      }
      reader.readAsText(file)
    }
  }

  return (
    <div className="options-card options-card--welcome">
      <div className="options-card__header">
        <div className="options-card__icon options-card__icon--large">
          <i className="icon-folder-upload"></i>
        </div>
        <div className="options-card__title">
          <h3>Import Vault</h3>
          <p>Restore your vault from a backup file</p>
        </div>
      </div>
      <div className="options-card__content">
        <p className="options-card__description">
          Select your backup file and enter the password used when creating the backup to restore your vault.
        </p>
        <form onSubmit={handleVaultImport} className="import-form">
          <div className="import-form__file">
            <label className="import-form__file-label">
              <input
                type="file"
                accept=".json"
                required
                onChange={handleFileChange}
              />
              <div className="import-form__file-box">
                <i className="icon-file-text"></i>
                <span>{fileName || 'Choose backup file...'}</span>
              </div>
            </label>
          </div>
          <div className="import-form__field">
            <input
              type="password"
              placeholder="Enter backup password"
              name="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="options-card__btn options-card__btn--primary">
            <i className="icon-upload"></i>
            Import Backup
          </button>
        </form>
      </div>
    </div>
  )
}
export default ImportVault
