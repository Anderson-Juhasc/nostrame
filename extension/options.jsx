import browser from 'webextension-polyfill'
import CryptoJS from 'crypto-js'
import {render} from 'react-dom'
import SecretsModal from './components/SecretsModal'
import React, { useState, useEffect } from 'react'

import { encrypt, decrypt } from './common'

function Options() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [relay, setRelay] = useState('')
  const [relays, setRelays] = useState([])
  const [showSecretsModal, setShowSecretsModal] = useState(false)

  useEffect(() => {
    fetchData()

    browser.storage.onChanged.addListener(function(changes, namespace) {
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

  return (
    <div className="Options">
      <div className="container">
        <h1>Options</h1>

        {!isLocked ? (
          <>
            { isAuthenticated && (
              <>
                <h2>Export backup</h2>
                <button type="button" onClick={handleWalletExport}>Export backup</button>

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
    </div>
  )

}

render(<Options />, document.getElementById('main'))
