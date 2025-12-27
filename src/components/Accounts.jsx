import browser from 'webextension-polyfill'
import React, { useState, useContext, useEffect, useRef } from 'react'
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

  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isDropdownOpen])

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
      <div className="account" ref={dropdownRef}>
        <a href="#" className="account-profile" onClick={(e) => { e.preventDefault(); toggleDropdown() }}>
          <span style={{ transition: 'transform 0.2s', transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>&#x25BC;</span>
          <img className="account-profile__img" src={defaultAccount.picture} style={{ borderRadius: '50%', border: '2px solid #4a9eff' }} alt="" />
          <div className="account-profile__body">
            <strong className="account-profile__name">
              {!defaultAccount.type
                ? 'Loading...'
                : defaultAccount.type === "derived"
                  ? (defaultAccount.name || `Account ${defaultAccount.index}`)
                  : (defaultAccount.name || `Imported ${defaultAccount.index}`)}
            </strong>
          </div>
        </a>

        {isDropdownOpen && (
          <div className="account-dropdown" style={{ minWidth: '280px' }}>
            <div className="account-dropdown__head">
              <div>
                <div className="account-dropdown__title">Accounts</div>
              </div>
              <a href="#" onClick={(e) => { e.preventDefault(); lockVault() }} title="Lock now">
                <i className="icon-lock"></i> Lock
              </a>
            </div>

            <div className="account-items">
              {accounts.length === 0 ? (
                <div style={{ padding: '15px', textAlign: 'center', color: '#aaa' }}>
                  Loading accounts...
                </div>
              ) : accounts.map((account) => {
                const isCurrentAccount = account.prvKey === defaultAccount.prvKey
                const displayName = account.type === "derived"
                  ? (account.name || `Account ${account.index}`)
                  : (account.name || `Imported ${account.index}`)
                return (
                  <div
                    key={account.prvKey}
                    className={isCurrentAccount ? "account-dropdown__item current" : "account-dropdown__item"}
                    style={isCurrentAccount ? { background: 'rgba(74, 158, 255, 0.2)', borderLeft: '3px solid #4a9eff' } : {}}
                  >
                    <a href="#" onClick={(e) => { e.preventDefault(); changeDefaultAccount(account.prvKey) }} style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <img src={account.picture} height="30" width="30" style={{ borderRadius: '50%', border: isCurrentAccount ? '2px solid #4a9eff' : '2px solid #fff' }} alt="" />
                        {isCurrentAccount && (
                          <span style={{
                            position: 'absolute',
                            bottom: '-2px',
                            right: '-2px',
                            background: '#4a9eff',
                            borderRadius: '50%',
                            width: '14px',
                            height: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px'
                          }}>✓</span>
                        )}
                      </div>
                      <div style={{ flex: 1, marginLeft: '8px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName}
                          </strong>
                          {account.type === "imported" && <small style={{ color: '#888', flexShrink: 0 }}>Imported</small>}
                        </div>
                        <div style={{ fontSize: '11px', color: '#aaa', fontFamily: 'monospace' }}>
                          {account.npub ? hideStringMiddle(account.npub, 8, 6) : '...'}
                        </div>
                      </div>
                    </a>
                  </div>
                )
              })}
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
