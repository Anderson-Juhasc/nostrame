import React from 'react'
import Accounts from '../components/Accounts'
import { useStorage } from '../hooks/useStorage'

const HeaderVault = () => {
  const [isAuthenticated] = useStorage('isAuthenticated', false)

  if (!isAuthenticated) return null

  return (
    <div className="header">
      <img src="assets/icons/logo.svg" alt="Nostrame" title="Nostrame" className="header__logo" />
      <Accounts />
    </div>
  )
}

export default HeaderVault
