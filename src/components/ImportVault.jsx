import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { decrypt } from '../common'

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
          await browser.storage.local.set({ 
            vault: vaultData,
            encryptedVault,
            isAuthenticated: true,
            password
          })
          setPassword('')
          fetchData()
        } catch (e) {
          console.log(e)
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
