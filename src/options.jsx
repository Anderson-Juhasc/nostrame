import browser from 'webextension-polyfill'
import { createRoot } from 'react-dom/client'
import SecretsModal from './modals/SecretsModal'
import ChangePassword from './components/ChangePassword'
import ResetVault from './components/ResetVault'
import Relays from './components/Relays'
import ImportVault from './components/ImportVault'
import React, { useState, useEffect } from 'react'
import { ToastContainer } from 'react-toastify'

function Options() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
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
                <ImportVault fetchData={fetchData} />
                <hr />
              </>
            )}

            { isAuthenticated && (
              <ResetVault fetchData={fetchData} />
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
