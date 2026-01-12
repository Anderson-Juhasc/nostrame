import React from 'react'
import { Link } from 'react-router-dom'
import Accounts from '../components/Accounts'
import { useStorage } from '../hooks/useStorage'

const HeaderVault = () => {
  const [isAuthenticated] = useStorage('isAuthenticated', false)

  if (!isAuthenticated) return null

  return (
    <div className="header">
      <Link to="/vault">
        <img src="assets/icons/logo.svg" alt="Nostrame" title="Nostrame" className="header__logo" />
      </Link>
      <Accounts />
    </div>
  )
}

export default HeaderVault
