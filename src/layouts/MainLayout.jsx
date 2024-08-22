import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import HeaderVault from '../components/HeaderVault'
import Navbar from '../components/Navbar'
import LockedVault from '../components/LockedVault'
import { MainProvider } from '../contexts/MainContext'

const MainLayout = () => {
  const [isLocked, setIsLocked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    fetchData()

    browser.storage.onChanged.addListener(function(changes, area) {
      fetchData()
    })
  }, [])

  const fetchData = async () => {
    const storage = await browser.storage.local.get(['isLocked', 'isAuthenticated'])

    if (storage.isLocked) {
      setIsLocked(true)
    }

    if (storage.isAuthenticated) {
      setIsAuthenticated(true)
    }
  }

  return (
    <>
      {isLocked ? (
        <>
          <LockedVault fetchData={fetchData} />
        </>
      ) : (
        <>
          <MainProvider>
            <HeaderVault />
            <Outlet />
            {isAuthenticated && (
              <Navbar />
            )}
          </MainProvider>
          <ToastContainer />
        </>
      )}
    </>
  )
}

export default MainLayout
