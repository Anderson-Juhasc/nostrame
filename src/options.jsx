import browser from 'webextension-polyfill'
import { createRoot } from 'react-dom/client'
import SecretsModal from './modals/SecretsModal'
import React, { useState, useEffect } from 'react'
import { ToastContainer, toast } from 'react-toastify'

import { encrypt, decrypt } from './common'

function Options() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [relay, setRelay] = useState('')
  const [relays, setRelays] = useState([])
  const [showSecretsModal, setShowSecretsModal] = useState(false)
  const [changePassword, setChangePassword] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  })

  useEffect(() => {
    fetchData()

    browser.storage.onChanged.addListener(function() {
      fetchData()
    });
  }, [])

  const fetchData = async () => {
    const storage = await browser.storage.local.get(['isAuthenticated', 'isLocked', 'defaultRelay', 'relays'])

    setIsLocked(storage.isLocked)
    setIsAuthenticated(storage.isAuthenticated)
    setRelays(storage.relays)
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

  const addNewRelay = async (e) => {
    e.preventDefault()

    const relayExist = relays.find(item => item === relay)
    if (relayExist) {
      alert('Please provide a not existing relay')
      setRelay('')
      return false
    }

    relays.push(relay)
    setRelays(relays)
    setRelay('')
    await browser.storage.local.set({ 
      relays: relays,
    })
  }

  const removeRelay = async (index) => {
    const newRelays = [...relays]
    if (index !== -1) {
      newRelays.splice(index, 1)
      setRelays(newRelays)
    }
    await browser.storage.local.set({ 
      relays: newRelays,
    })
  }

  const changePasswordInput = (e) => {
    const { name, value } = e.target;
    setChangePassword(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const submitChangePassword = async (e) => {
    e.preventDefault()

    const confirmChange = confirm("Are you sure you want to change the password?")
    if (!confirmChange) return

    if (changePassword.newPassword !== changePassword.confirmNewPassword) {
      alert('New password do not match!')

      setChangePassword({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })

      return
    }

    const storage = await browser.storage.local.get(['encryptedVault'])
    try {
      const decryptedVault = decrypt(storage.encryptedVault, changePassword.currentPassword) 
      const encryptedVault = encrypt(decryptedVault, changePassword.newPassword)
      await browser.storage.local.set({ 
        encryptedVault,
        password: changePassword.currentPassword
      })
      setChangePassword({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })
      fetchData()
      toast.success("Your password was changed with success")
    } catch (e) {
      toast.error("Your password do not match")
      setChangePassword({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })
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

                <form onSubmit={addNewRelay}>
                  <h2>Relays</h2>
                  <input 
                    type="text"
                    name="relay"
                    value={relay}
                    required
                    pattern="^wss:\/\/([a-zA-Z0-9\-\.]+)(:[0-9]+)?(\/[a-zA-Z0-9\-\.\/\?\:@&=%\+\/~#]*)?$"
                    onChange={(e) => setRelay(e.target.value)}
                  />
                  <br />
                  <button type="submit" className="btn">Add</button>
                </form>

                <ul>
                  {relays.map((relay, index) => (
                    <li key={index}>
                      {relay}
                      &nbsp;
                      <button type="button" onClick={() => removeRelay(index)}>&times;</button>
                    </li>
                  ))}
                </ul>

                <hr />

                <form onSubmit={submitChangePassword}>
                  <h2>Change Password</h2>
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Current password"
                    name="currentPassword"
                    required
                    value={changePassword.currentPassword}
                    onChange={(e) => changePasswordInput(e)}
                  />
                  <br />
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="New password"
                    name="newPassword"
                    required
                    value={changePassword.newPassword}
                    onChange={(e) => changePasswordInput(e)}
                  />
                  <br />
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Confirm new password"
                    name="confirmNewPassword"
                    required
                    value={changePassword.confirmNewPassword}
                    onChange={(e) => changePasswordInput(e)}
                  />
                  <br />
                  <button type="submit" className="btn">Change password</button>
                </form>
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
