import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import Accounts from '../components/Accounts'

const HeaderVault = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    fetchData()

    browser.storage.onChanged.addListener(function(changes, area) {
      fetchData()
    })
  }, [])

  const fetchData = async () => {
    const storage = await browser.storage.local.get(['isAuthenticated'])

    if (storage.isAuthenticated) {
      setIsAuthenticated(true)
    }
  }

  return (
    <div className="header">
      <h1>
        Nostrame
      </h1>

      { isAuthenticated && (
        <Accounts />
      )}
    </div>
  )
}
export default HeaderVault
