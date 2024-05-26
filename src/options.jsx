import browser from 'webextension-polyfill'
import { createRoot } from 'react-dom/client'
import SecretsModal from './modals/SecretsModal'
import ChangePassword from './components/ChangePassword'
import ResetVault from './components/ResetVault'
import Relays from './components/Relays'
import ImportVault from './components/ImportVault'
import React, { useState, useEffect } from 'react'
import { ToastContainer } from 'react-toastify'
import ExportVault from './components/ExportVault'

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

  return (
    <div className="Options">
      <div className="container">
        <h1>Options</h1>

        {!isLocked ? (
          <>
            { isAuthenticated && (
              <>
                <ExportVault />

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
