import React from 'react'
import Accounts from '../components/Accounts'
import { useStorage } from '../hooks/useStorage'

const HeaderVault = () => {
  const [isAuthenticated] = useStorage('isAuthenticated', false)

  return (
    <div className="header">
      <h1>Nostrame</h1>
      {isAuthenticated && <Accounts />}
    </div>
  )
}

export default HeaderVault
