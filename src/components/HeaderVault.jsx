import React from 'react'
import Accounts from '../components/Accounts'
import { useStorage } from '../hooks/useStorage'

const HeaderVault = () => {
  const [isAuthenticated] = useStorage('isAuthenticated', false)

  return (
    <div className={isAuthenticated ? "header" :  "header header__brand"}>
      <img src="assets/icons/logo.svg" alt="Nostrame" title="Nostrame" className="header__logo" />
      {isAuthenticated && <Accounts />}
    </div>
  )
}

export default HeaderVault
