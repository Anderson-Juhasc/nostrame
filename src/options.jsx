import browser from 'webextension-polyfill'
import { createRoot } from 'react-dom/client'
import React, { useState, useEffect, useCallback } from 'react'
import { ToastContainer, toast } from 'react-toastify'

import ErrorBoundary from './components/ErrorBoundary'
import ChangePassword from './components/ChangePassword'
import ResetVault from './components/ResetVault'
import ImportVault from './components/ImportVault'
import ExportVault from './components/ExportVault'
import Secrets from './components/Secrets'

// Connect to background to pause lock timer while options page is open
browser.runtime.connect({ name: 'ui-active' })

function Options() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [activeTab, setActiveTab] = useState('backup')
  const [password, setPassword] = useState('')

  const fetchData = useCallback(async () => {
    const storage = await browser.storage.local.get(['isAuthenticated', 'uiHintLocked'])
    setIsLocked(storage.uiHintLocked || false)
    setIsAuthenticated(storage.isAuthenticated || false)
  }, [])

  const unlockVault = async (e) => {
    e.preventDefault()

    // Send unlock request to background (key stays in background memory)
    const response = await browser.runtime.sendMessage({
      type: 'UNLOCK_VAULT',
      password: password
    })

    // Clear password from UI memory immediately
    setPassword('')

    if (response.success) {
      toast.success('Vault unlocked')
      fetchData()
    } else {
      toast.error(response.error || 'Invalid password')
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
    { id: 'backup', label: 'Backup', icon: 'icon-folder-download' },
    { id: 'security', label: 'Security', icon: 'icon-lock' },
  ]

  return (
    <div className="Options">
      <div className="options-header">
        <div className="options-header__content">
          <h1>
            <i className="icon-cog"></i>
            Settings
          </h1>
          <p className="options-header__subtitle">Manage your vault and security settings</p>
        </div>
      </div>

      <div className="container">
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
                      <i className={tab.icon}></i>
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="options-tabs__content">
                  {activeTab === 'backup' && (
                    <div className="options-section">
                      <ExportVault />
                      <Secrets />
                    </div>
                  )}

                  {activeTab === 'security' && (
                    <div className="options-section">
                      <ChangePassword fetchData={fetchData} />
                      <ResetVault fetchData={fetchData} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="options-section">
                <ImportVault fetchData={fetchData} />
              </div>
            )}
          </>
        ) : (
          <div className="options-lock">
            <div className="options-lock__card">
              <div className="options-lock__icon">
                <i className="icon-lock"></i>
              </div>
              <h2>Vault Locked</h2>
              <p>Enter your password to access settings</p>
              <form onSubmit={unlockVault}>
                <div className="options-lock__input-group">
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Enter password"
                    name="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button type="submit" className="options-lock__btn">
                  <i className="icon-unlocked"></i>
                  Unlock Vault
                </button>
              </form>
            </div>
          </div>
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
