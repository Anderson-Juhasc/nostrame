import browser from 'webextension-polyfill'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import React, { useEffect, useContext } from 'react'
import { useAuth } from '../middlewares/AuthContext';
import MainContext from '../contexts/MainContext'

const HomePage = () => {
  const { isAuthenticated, login } = useAuth()

  if (isAuthenticated) return <Navigate to="/vault" />

  const { updateAccounts } = useContext(MainContext)
  const navigate = useNavigate()

  useEffect(() => {
    const handleStorageChange = async (changes) => {
      if (changes.isAuthenticated?.newValue) {
        await login()
        await updateAccounts()
        navigate('/vault')
      }
    }

    browser.storage.onChanged.addListener(handleStorageChange)

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [login, updateAccounts, navigate])

  return (
    <>
      <div className="Popup">
        <div className="container">
          <h1 style={{ textAlign: 'center' }}><small>Welcome to <br /></small>Nostrame</h1>
          
          <Link to="/signin" className="btn">
            <i className="icon-folder-download"></i>
            <br />
            Import existing Vault
            <br />
            <small>Already have a Vault? Import it using your seed phrase or encrypted keystore file</small>
          </Link>
          <br />
          <Link to="/signup" className='btn'>
            <i className="icon-folder-plus"></i>
            <br />
            Create new Vault
            <br />
            <small>New to Nostrame Vault? Let's set it up! This will create a new vault and seed phrase</small>
          </Link>
        </div>
      </div>
    </>
  )
}

export default HomePage
