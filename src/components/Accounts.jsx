import browser from 'webextension-polyfill'
import React, { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import hideStringMiddle from '../helpers/hideStringMiddle'
import ImportAccountModal from '../modals/ImportAccountModal'
import DeriveAccountModal from '../modals/DeriveAccountModal'
import MainContext from '../contexts/MainContext'
import { clearSessionPassword, clearSessionVault, getSessionVault, setSessionVault, encrypt, getSessionPassword } from '../common'

const Accounts = () => {
  const { accounts, defaultAccount, updateDefaultAccount } = useContext(MainContext)

  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [showImportAccountModal, setShowImportAccountModal] = useState(false)
  const [showDeriveAccount, setShowDeriveAccount] = useState(false)

  const navigate = useNavigate()

  const changeDefaultAccount = async (prvKey) => {
    const vault = await getSessionVault()
    if (!vault) return

    // Find the account being switched to
    const targetAccount = accounts.find(acc => acc.prvKey === prvKey)
    const accountName = targetAccount?.name ||
      (targetAccount?.type === 'derived' ? `Account ${targetAccount.index}` : `Imported ${targetAccount?.index}`)

    vault.accountDefault = prvKey

    const password = await getSessionPassword()
    if (password) {
      const encryptedVault = encrypt(vault, password)
      await browser.storage.local.set({ encryptedVault })
    }

    await setSessionVault(vault)
    await updateDefaultAccount()
    setIsDropdownOpen(false)

    // Show confirmation toast
    toast.success(`Switched to ${accountName}`, {
      position: 'bottom-center',
      autoClose: 2000,
      hideProgressBar: true
    })

    navigate('/vault')
  }

  const toggleDropdown = () => {
    setIsDropdownOpen(prev => !prev)
  }

  const lockVault = async () => {
    await clearSessionPassword()
    await clearSessionVault()
    await browser.storage.local.set({ isLocked: true })
  }

  return (
    <>
      <div className="account">
        <a href="#" className="account-profile" onClick={(e) => { e.preventDefault(); toggleDropdown() }}>
          <span>&#x25BC;</span>
          <img className="account-profile__img" src={defaultAccount.picture} style={{ borderRadius: '50%', border: '2px solid #4a9eff' }} alt="" />
          <div className="account-profile__body">
            <strong className="account-profile__name">
              {defaultAccount.type === "derived"
                ? (defaultAccount.name || `Account ${defaultAccount.index}`)
                : (defaultAccount.name || `Imported ${defaultAccount.index}`)}
            </strong>
          </div>
        </a>

        {isDropdownOpen && (
          <div className="account-dropdown">
            <div className="account-dropdown__head">
              <div className="account-dropdown__title">Accounts</div>
              <a href="#" onClick={(e) => { e.preventDefault(); lockVault() }} title="Lock now">
                <i className="icon-lock"></i> Lock
              </a>
            </div>

            <div className="account-items">
              {accounts.map((account, index) => (
                <div
                  key={account.prvKey}
                  className={account.prvKey === defaultAccount.prvKey ? "account-dropdown__item current" : "account-dropdown__item"}
                >
                  <a href="#" onClick={(e) => { e.preventDefault(); changeDefaultAccount(account.prvKey) }} style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <img src={account.picture} height="30" width="30" style={{ borderRadius: '50%', border: '2px solid #fff' }} alt="" />
                    &nbsp;
                    <div>
                      <div>
                        <strong>
                          {account.type === "derived"
                            ? (account.name || `Account ${account.index}`)
                            : (account.name || `Imported ${account.index}`)}
                        </strong>
                        {account.type === "imported" && <small> Imported</small>}
                      </div>
                      <div>
                        {account.format === 'bech32' ? hideStringMiddle(account.npub) : hideStringMiddle(account.pubKey)}
                      </div>
                    </div>
                  </a>
                </div>
              ))}
            </div>

            <ul className="account-dropdown-nav">
              <li>
                <a href="#" onClick={(e) => { e.preventDefault(); setShowDeriveAccount(true); setIsDropdownOpen(false) }} title="Create account">
                  <i className="icon-user-plus"></i> Create account
                </a>
              </li>
              <li>
                <a href="#" onClick={(e) => { e.preventDefault(); setShowImportAccountModal(true); setIsDropdownOpen(false) }} title="Import account">
                  <i className="icon-download"></i> Import account
                </a>
              </li>
            </ul>
          </div>
        )}

        <ImportAccountModal
          isOpen={showImportAccountModal}
          callBack={() => setShowImportAccountModal(false)}
          onClose={() => setShowImportAccountModal(false)}
        />

        <DeriveAccountModal
          isOpen={showDeriveAccount}
          callBack={() => setShowDeriveAccount(false)}
          onClose={() => setShowDeriveAccount(false)}
        />
      </div>
    </>
  )
}

export default Accounts
