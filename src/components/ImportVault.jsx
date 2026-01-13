import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { toast } from 'react-toastify'
import { decrypt, setSessionPassword, setSessionVault, getSessionPassword, getSessionVault } from '../common'

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
        try {
          const vaultData = decrypt(encryptedVault, password)

          // Set session data
          await setSessionPassword(password)
          await setSessionVault(vaultData)

          // Verify session data was actually stored
          const storedPassword = await getSessionPassword()
          const storedVault = await getSessionVault()

          if (!storedPassword || !storedVault) {
            toast.error('Failed to store session data. Please try again or check browser permissions.')
            return
          }

          await browser.storage.local.set({
            encryptedVault,
            isAuthenticated: true,
            isLocked: false,
          })
          setPassword('')
          setFile(null)
          setFileName('')
          toast.success('Vault imported successfully')
          fetchData()
        } catch (e) {
          toast.error('Invalid vault file or wrong password')
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
