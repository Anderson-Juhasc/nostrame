import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { decrypt } from '../common'

const LockedVault = ({ fetchData }) => {
  const [password, setPassword] = useState('')

  const unlockVault = async (e) => {
    e.preventDefault()
    const storage = await browser.storage.local.get(['encryptedVault'])
    const vaultData = decrypt(storage.encryptedVault, password) 
    await browser.storage.local.set({ 
      isLocked: false,
      vault: vaultData,
      password,
    })
    setPassword('')
    fetchData()
  }

  return (
    <>
      <div className="header">
        <h1>Nostrame</h1>
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
    </>
  )
}
export default LockedVault
