import browser from 'webextension-polyfill'
import { createRoot } from 'react-dom/client'
import React, { useState, useEffect } from 'react'
import { ToastContainer } from 'react-toastify'

import ErrorBoundary from './components/ErrorBoundary'
import ChangePassword from './components/ChangePassword'
import ResetVault from './components/ResetVault'
import Relays from './components/Relays'
import ImportVault from './components/ImportVault'
import ExportVault from './components/ExportVault'
import Secrets from './components/Secrets'

function Options() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)

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

                <Secrets />

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
const root = createRoot(container)
root.render(
  <ErrorBoundary>
    <Options />
  </ErrorBoundary>
)
