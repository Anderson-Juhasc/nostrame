import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { toast } from 'react-toastify'

const LockedVault = ({ fetchData }) => {
  const [password, setPassword] = useState('')

  const unlockVault = async (e) => {
    e.preventDefault()

    try {
      // Send unlock request to background (key stays in background memory)
      const response = await browser.runtime.sendMessage({
        type: 'UNLOCK_VAULT',
        password: password
      })

      // Clear password from UI memory immediately
      setPassword('')

      if (response && response.success) {
        toast.success('Vault unlocked')
        if (fetchData) fetchData()
      } else {
        toast.error(response?.error || 'Invalid password')
      }
    } catch (err) {
      console.error('Unlock error:', err)
      setPassword('')
      toast.error('Failed to unlock vault: ' + err.message)
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
