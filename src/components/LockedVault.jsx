import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { toast } from 'react-toastify'
import { decrypt, setSessionPassword, setSessionVault } from '../common'

const LockedVault = ({ fetchData }) => {
  const [password, setPassword] = useState('')

  const unlockVault = async (e) => {
    e.preventDefault()

    try {
      const storage = await browser.storage.local.get(['encryptedVault'])
      const vaultData = decrypt(storage.encryptedVault, password)

      await setSessionPassword(password)
      await setSessionVault(vaultData)
      await browser.storage.local.set({ isLocked: false })

      setPassword('')
      toast.success('Vault unlocked')
      if (fetchData) fetchData()
    } catch (err) {
      toast.error('Invalid password')
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
