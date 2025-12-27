import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { decrypt, setSessionPassword, setSessionVault, getSessionPassword, getSessionVault } from '../common'

const ImportVault = ({ fetchData }) => {
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')

  const handleFileChange = (e) => {
    e.preventDefault()
    const file = e.target.files[0]
    setFile(file)
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
            alert('Failed to store session data. Please try again or check browser permissions.')
            return
          }

          await browser.storage.local.set({
            encryptedVault,
            isAuthenticated: true,
            isLocked: false,
          })
          setPassword('')
          fetchData()
        } catch (e) {
          alert('Invalid vault file or wrong password')
        }
      }
      reader.readAsText(file)
    }
  }

  return (
    <>
      <h2>Import Vault</h2>

      <form onSubmit={handleVaultImport}>
        <input type="file" required onChange={handleFileChange} />
        <br />
        <input
          type="password"
          placeholder="Password"
          name="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br />
        <button type="submit" className="btn">Import backup</button>
      </form>
    </>
  )
}
export default ImportVault
