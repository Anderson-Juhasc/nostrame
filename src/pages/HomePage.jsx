import browser from 'webextension-polyfill'
import { Link, Navigate } from 'react-router-dom'
import React from 'react'
import { useAuth } from '../middlewares/AuthContext';

const HomePage = () => {
  const { isAuthenticated } = useAuth()

  const openOptionsButton = async () => {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage()
    } else {
      window.open(browser.runtime.getURL('options.html'))
    }
  }

  if (isAuthenticated) return <Navigate to="/vault" />

  return (
    <>
      <div className="Popup">
        <div className="container">
          <h1>Nostrame</h1>
          
          <Link to="/signin" className="btn">Set existing Vault</Link>
          <br />
          <button type="button" className="btn" onClick={openOptionsButton}>Import Vault</button>
          <br />
          <Link to="/signup" className='btn'>Create new Vault</Link>
        </div>
      </div>
    </>
  )
}

export default HomePage
