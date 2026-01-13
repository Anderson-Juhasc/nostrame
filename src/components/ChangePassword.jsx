import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { toast } from 'react-toastify'
import { encrypt, decrypt, setSessionPassword } from '../common'
import ConfirmModal from '../modals/ConfirmModal'

const ChangePassword = ({ fetchData }) => {
  const [changePassword, setChangePassword] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  })
  const [showConfirm, setShowConfirm] = useState(false)

  const changePasswordInput = (e) => {
    const { name, value } = e.target;
    setChangePassword(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const submitChangePassword = (e) => {
    e.preventDefault()

    if (changePassword.newPassword !== changePassword.confirmNewPassword) {
      toast.error('New passwords do not match')

      setChangePassword({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })

      return
    }

    setShowConfirm(true)
  }

  const handleConfirmChange = async () => {
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
      toast.success("Your password was changed successfully")
    } catch (e) {
      toast.error("Current password is incorrect")
      setChangePassword({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })
    }
  }

  return (
    <div className="options-card">
      <div className="options-card__header">
        <div className="options-card__icon">
          <i className="icon-key"></i>
        </div>
        <div className="options-card__title">
          <h3>Change Password</h3>
          <p>Update your vault encryption password</p>
        </div>
      </div>
      <div className="options-card__content">
        <form onSubmit={submitChangePassword} className="password-form">
          <div className="password-form__field">
            <label>Current Password</label>
            <input
              type="password"
              autoComplete="off"
              placeholder="Enter current password"
              name="currentPassword"
              required
              value={changePassword.currentPassword}
              onChange={(e) => changePasswordInput(e)}
            />
          </div>
          <div className="password-form__field">
            <label>New Password</label>
            <input
              type="password"
              autoComplete="off"
              placeholder="Enter new password"
              name="newPassword"
              required
              value={changePassword.newPassword}
              onChange={(e) => changePasswordInput(e)}
            />
          </div>
          <div className="password-form__field">
            <label>Confirm New Password</label>
            <input
              type="password"
              autoComplete="off"
              placeholder="Confirm new password"
              name="confirmNewPassword"
              required
              value={changePassword.confirmNewPassword}
              onChange={(e) => changePasswordInput(e)}
            />
          </div>
          <button type="submit" className="options-card__btn">
            <i className="icon-lock"></i>
            Change Password
          </button>
        </form>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="Change Password"
        message="Are you sure you want to change the password?"
        onConfirm={handleConfirmChange}
        onClose={() => setShowConfirm(false)}
      />
    </div>
  )
}
export default ChangePassword
