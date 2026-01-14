import browser from 'webextension-polyfill'
import React, { useState, useEffect, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import HeaderVault from '../components/HeaderVault'
import Navbar from '../components/Navbar'
import LockedVault from '../components/LockedVault'
import { MainProvider } from '../contexts/MainContext'

const MainLayout = () => {
  const [isLocked, setIsLocked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const fetchData = useCallback(async () => {
    // GET_VAULT_STATUS is the AUTHORITATIVE source for unlock state
    // Storage flags are hints only - background memory is the truth
    const status = await browser.runtime.sendMessage({ type: 'GET_VAULT_STATUS' })

    if (!status.isAuthenticated) {
      setIsAuthenticated(false)
      setIsLocked(false)
      return
    }

    setIsAuthenticated(true)
    // Use background's authoritative unlock state, not storage flag
    setIsLocked(!status.unlocked)
  }, [])

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

  return (
    <>
      {isLocked ? (
        <LockedVault fetchData={fetchData} />
      ) : (
        <MainProvider>
          <HeaderVault />
          <Outlet />
          {isAuthenticated && (
            <Navbar />
          )}
        </MainProvider>
      )}
      <ToastContainer
        position="bottom-center"
        autoClose={3000}
        hideProgressBar
        newestOnTop={false}
        closeOnClick
        pauseOnHover
        theme="dark"
      />
    </>
  )
}

export default MainLayout
