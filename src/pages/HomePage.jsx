import browser from 'webextension-polyfill'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import React, { useEffect, useContext } from 'react'
import { useAuth } from '../middlewares/AuthContext';
import MainContext from '../contexts/MainContext'

const HomePage = () => {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) return <Navigate to="/vault" />

  const { updateAccounts } = useContext(MainContext)

  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    browser.storage.onChanged.addListener(async function(changes, area) {
      if (changes.isAuthenticated) {
        await login()
        await updateAccounts()
        navigate('/vault')
      }
    })
  }, [])

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
