import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { decrypt, setSessionPassword, setSessionVault } from '../common'

const LockedVault = ({ fetchData }) => {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const unlockVault = async (e) => {
    e.preventDefault()
    setError('')

    try {
      const storage = await browser.storage.local.get(['encryptedVault'])
      const vaultData = decrypt(storage.encryptedVault, password)

      await setSessionPassword(password)
      await setSessionVault(vaultData)
      await browser.storage.local.set({ isLocked: false })

      setPassword('')
      if (fetchData) fetchData()
    } catch (err) {
      setError('Invalid password')
      setPassword('')
    }
  }

  return (
    <div className="Popup">
      <div className="header header__brand">
        <img src="assets/icons/logo.svg" alt="Nostrame" title="Nostrame" className="header__logo" />
      </div>

      <div className="container">
        <br />
        <form onSubmit={unlockVault}>
          <label>Vault is locked</label>
          <br />
          <input
            type="password"
            autoComplete="off"
            placeholder="Password"
            name="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div style={{ color: 'red', marginTop: '8px' }}>{error}</div>}
          <br />
          <button type="submit" className="btn">
            <i className="icon-unlocked"></i>
            &nbsp;
            Unlock now
          </button>
        </form>
      </div>
    </div>
  )
}

export default LockedVault
