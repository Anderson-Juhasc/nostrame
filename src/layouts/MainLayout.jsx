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
    const storage = await browser.storage.local.get(['isLocked', 'isAuthenticated'])
    // Check if key is in background memory
    const { unlocked } = await browser.runtime.sendMessage({ type: 'GET_LOCK_STATUS' })
    if (storage.isAuthenticated && !unlocked) {
      setIsLocked(true)
      setIsAuthenticated(true)
      return
    }

    setIsLocked(storage.isLocked || false)
    setIsAuthenticated(storage.isAuthenticated || false)
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
