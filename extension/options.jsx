import browser from 'webextension-polyfill'
import CryptoJS from 'crypto-js'
import {render} from 'react-dom'
import React, { useState, useEffect } from 'react'

import { encrypt, decrypt } from './common'

function Options() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')

  useEffect(() => {
    fetchData()

    browser.storage.onChanged.addListener(function(changes, namespace) {
      //for (let key in changes) {
      //  if (key === 'isLocked') {
          // Reload data
          fetchData()
      //  }
      //}
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

  const handleWalletExport = async () => {
    const storage = await browser.storage.local.get(['encryptedWallet'])
    const jsonData = JSON.stringify({ backup: storage.encryptedWallet }, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NostrameWalletData.json';
    a.click();
  }

  const handleWalletImport = (e) => {
    e.preventDefault()
    if (file) {
      const reader = new FileReader()
      reader.onload = async () => {
        const encryptedWallet = (JSON.parse(reader.result)).backup
        try {
          const walletData = decrypt(encryptedWallet, password) 
          await browser.storage.local.set({ 
            wallet: walletData,
            encryptedWallet,
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

  const handleResetWallet = async () => {
    if (await confirm("Are you sure you want to reset the wallet? Make sure if you have made a backup before you continue.")) {
      await browser.storage.local.set({ 
        encryptedWallet: '',
        wallet: {},
        password: '',
        isAuthenticated: false,
      })
      fetchData()
    }
  }

  return (
    <div className="container">
      <h1>Options</h1>

      {!isLocked ? (
        <>
          { isAuthenticated && (
            <>
              <h2>Export backup</h2>
              <button type="button" onClick={handleWalletExport}>Export backup</button>

              <hr />
            </>
          )}

          { !isAuthenticated && (
            <>
              <h2>Import backup</h2>

              <form onSubmit={handleWalletImport}>
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
              <h2>Reset Wallet</h2>

              <button type="button" onClick={handleResetWallet}>Reset Wallet</button>
            </>
          )}
        </>
      ) : (
        <h2>Wallet is locked</h2>
      )}
    </div>
  )

}

render(<Options />, document.getElementById('main'))
