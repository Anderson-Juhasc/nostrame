import browser from 'webextension-polyfill'
import { createRoot } from 'react-dom/client'
import SecretsModal from './modals/SecretsModal'
import ChangePassword from './components/ChangePassword'
import Relays from './components/Relays'
import React, { useState, useEffect } from 'react'
import { ToastContainer, toast } from 'react-toastify'

import { decrypt } from './common'

function Options() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [showSecretsModal, setShowSecretsModal] = useState(false)

  useEffect(() => {
    fetchData()

    browser.storage.onChanged.addListener(function() {
      fetchData()
    });
  }, [])

  const fetchData = async () => {
    const storage = await browser.storage.local.get(['isAuthenticated', 'isLocked'])

    setIsLocked(storage.isLocked)
    setIsAuthenticated(storage.isAuthenticated)
  }

  const handleFileChange = (e) => {
    e.preventDefault()
    const file = event.target.files[0]
    setFile(file)
  }

  const handleVaultExport = async () => {
    const storage = await browser.storage.local.get(['encryptedVault'])
    const jsonData = JSON.stringify({ vault: storage.encryptedVault }, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = ('0' + (currentDate.getMonth() + 1)).slice(-2); // Adding 1 to month since it's zero-based
    const day = ('0' + currentDate.getDate()).slice(-2);
    const hours = ('0' + currentDate.getHours()).slice(-2);
    const minutes = ('0' + currentDate.getMinutes()).slice(-2);
    const seconds = ('0' + currentDate.getSeconds()).slice(-2);

    a.href = url;
    a.download = `NostrameVaultData.${year}_${month}_${day}_${hours}_${minutes}_${seconds}.json`;
    a.click();
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
    <div className="Options">
      <div className="container">
        <h1>Options</h1>

        {!isLocked ? (
          <>
            { isAuthenticated && (
              <>
                <h2>Export backup</h2>
                <button type="button" onClick={handleVaultExport}>Export backup</button>

                <hr />

                <h2>Security</h2>
                <button onClick={() => setShowSecretsModal(true)}>Show secrets</button>

                <SecretsModal 
                  isOpen={showSecretsModal}
                  onClose={() => setShowSecretsModal(false)}
                ></SecretsModal>

                <hr />

                <Relays />

                <hr />

                <ChangePassword fetchData={fetchData} />
              </>
            )}

            { !isAuthenticated && (
              <>
                <h2>Import backup</h2>

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
                <hr />
              </>
            )}

            { isAuthenticated && (
              <>
                <h2>Reset Vault</h2>

                <button type="button" onClick={handleResetVault}>Reset Vault</button>
              </>
            )}
          </>
        ) : (
          <h2>Vault is locked</h2>
        )}
      </div>

      <ToastContainer />
    </div>
  )

}

const container = document.getElementById('main')
const root = createRoot(container) // createRoot(container!) if you use TypeScript
root.render(<Options />)
