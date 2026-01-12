import browser from 'webextension-polyfill'
import { createRoot } from 'react-dom/client'
import React, { useState, useEffect, useCallback } from 'react'
import { ToastContainer, toast } from 'react-toastify'

import ErrorBoundary from './components/ErrorBoundary'
import ChangePassword from './components/ChangePassword'
import ResetVault from './components/ResetVault'
import Relays from './components/Relays'
import ImportVault from './components/ImportVault'
import ExportVault from './components/ExportVault'
import Secrets from './components/Secrets'
import { decrypt, setSessionPassword, setSessionVault } from './common'

// Connect to background to pause lock timer while options page is open
browser.runtime.connect({ name: 'ui-active' })

function Options() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [activeTab, setActiveTab] = useState('backup')
  const [password, setPassword] = useState('')

  const fetchData = useCallback(async () => {
    const storage = await browser.storage.local.get(['isAuthenticated', 'isLocked'])
    setIsLocked(storage.isLocked || false)
    setIsAuthenticated(storage.isAuthenticated || false)
  }, [])

  const unlockVault = async (e) => {
    e.preventDefault()

    try {
      const storage = await browser.storage.local.get(['encryptedVault'])
      const vaultData = decrypt(storage.encryptedVault, password)

      await setSessionPassword(password)
      await setSessionVault(vaultData)
      await browser.storage.local.set({ isLocked: false })

      setPassword('')
      toast.success('Vault unlocked')
      fetchData()
    } catch (err) {
      toast.error('Invalid password')
      setPassword('')
    }
  }

  useEffect(() => {
    fetchData()

    const handleStorageChange = () => {
      fetchData()
    }

    browser.storage.onChanged.addListener(handleStorageChange)

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [fetchData])

  const tabs = [
    { id: 'backup', label: 'Backup' },
    { id: 'relays', label: 'Relays' },
    { id: 'security', label: 'Security' },
  ]

  return (
    <div className="Options">
      <div className="container">
        <h1>Options</h1>

        {!isLocked ? (
          <>
            {isAuthenticated ? (
              <>
                <div className="options-tabs">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      className={`options-tabs__btn ${activeTab === tab.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="options-tabs__content">
                  {activeTab === 'backup' && (
                    <>
                      <ExportVault />
                      <hr />
                      <Secrets />
                    </>
                  )}

                  {activeTab === 'relays' && (
                    <Relays />
                  )}

                  {activeTab === 'security' && (
                    <>
                      <ChangePassword fetchData={fetchData} />
                      <hr />
                      <ResetVault fetchData={fetchData} />
                    </>
                  )}
                </div>
              </>
            ) : (
              <ImportVault fetchData={fetchData} />
            )}
          </>
        ) : (
          <form onSubmit={unlockVault}>
            <h2>Vault is locked</h2>
            <input
              type="password"
              autoComplete="off"
              placeholder="Password"
              name="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <br />
            <button type="submit">
              <i className="icon-unlocked"></i>
              &nbsp;
              Unlock
            </button>
          </form>
        )}
      </div>

      <ToastContainer
        position="bottom-center"
        autoClose={3000}
        hideProgressBar
        newestOnTop={false}
        closeOnClick
        pauseOnHover
        theme="dark"
      />
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
