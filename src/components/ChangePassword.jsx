import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { toast } from 'react-toastify'
import { encrypt, decrypt, setSessionPassword } from '../common'

const ChangePassword = ({ fetchData }) => {
  const [changePassword, setChangePassword] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  })

  const changePasswordInput = (e) => {
    const { name, value } = e.target;
    setChangePassword(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const submitChangePassword = async (e) => {
    e.preventDefault()

    const confirmChange = confirm("Are you sure you want to change the password?")
    if (!confirmChange) return

    if (changePassword.newPassword !== changePassword.confirmNewPassword) {
      alert('New password do not match!')

      setChangePassword({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })

      return
    }

    const storage = await browser.storage.local.get(['encryptedVault'])
    try {
      const decryptedVault = decrypt(storage.encryptedVault, changePassword.currentPassword)
      const encryptedVault = encrypt(decryptedVault, changePassword.newPassword)
      await setSessionPassword(changePassword.newPassword)
      await browser.storage.local.set({
        encryptedVault,
      })
      setChangePassword({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })
      fetchData()
      toast.success("Your password was changed with success")
    } catch (e) {
      toast.error("Your password do not match", e)
      setChangePassword({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })
    }
  }

  return (
    <form onSubmit={submitChangePassword}>
      <h2>Change Password</h2>
      <input
        type="password"
        autoComplete="off"
        placeholder="Current password"
        name="currentPassword"
        required
        value={changePassword.currentPassword}
        onChange={(e) => changePasswordInput(e)}
      />
      <br />
      <input
        type="password"
        autoComplete="off"
        placeholder="New password"
        name="newPassword"
        required
        value={changePassword.newPassword}
        onChange={(e) => changePasswordInput(e)}
      />
      <br />
      <input
        type="password"
        autoComplete="off"
        placeholder="Confirm new password"
        name="confirmNewPassword"
        required
        value={changePassword.confirmNewPassword}
        onChange={(e) => changePasswordInput(e)}
      />
      <br />
      <button type="submit" className="btn">Change password</button>
    </form>
  )
}
export default ChangePassword
