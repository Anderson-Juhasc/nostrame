import browser from 'webextension-polyfill'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import React, { useEffect, useContext } from 'react'
import { useAuth } from '../middlewares/AuthContext';
import MainContext from '../contexts/MainContext'
import Loading from '../components/Loading'

const HomePage = () => {
  const { isAuthenticated, isLoading, login } = useAuth()

  if (isLoading) return <Loading />
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
        <div className="container welcome-container">
          <div className="welcome-header">
            <div className="welcome-logo">
              <img src="assets/icons/logo.svg" alt="Nostrame" />
            </div>
            <h1 className="welcome-title">Nostrame</h1>
            <p className="welcome-subtitle">Your secure Nostr key manager</p>
          </div>

          <div className="welcome-actions">
            <Link to="/signin" className="btn">
              <i className="icon-folder-download"></i>
              <strong>Import existing Vault</strong>
              <small>Already have a Vault? Import it using your seed phrase or encrypted keystore file</small>
            </Link>

            <Link to="/signup" className="btn">
              <i className="icon-folder-plus"></i>
              <strong>Create new Vault</strong>
              <small>New to Nostrame? Let's set it up! This will create a new vault and seed phrase</small>
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

export default HomePage
