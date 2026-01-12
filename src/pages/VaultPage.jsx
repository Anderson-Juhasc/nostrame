import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext, useCallback, useRef } from 'react'
import { toast } from 'react-toastify'
import hideStringMiddle from '../helpers/hideStringMiddle'
import copyToClipboard from '../helpers/copyToClipboard'
import EditAccountModal from '../modals/EditAccountModal'
import AccountDetailsModal from '../modals/AccountDetailsModal'
import ConfirmModal from '../modals/ConfirmModal'
import Loading from '../components/Loading'
import MainContext from '../contexts/MainContext'
import { encrypt, removePermissions, getSessionPassword, getSessionVault, setSessionVault } from '../common'

const VaultPage = () => {
  const { accounts, defaultAccount, loading, updateAccounts } = useContext(MainContext)

  const [showEditAccountModal, setEditAccountModal] = useState(false)
  const [accountEditing, setAccountEditing] = useState({})
  const [accountDetails, setAccountDetails] = useState({})
  const [showAccountDetails, setShowAccountDetails] = useState(false)
  const [policies, setPermissions] = useState({})
  const [expandedHosts, setExpandedHosts] = useState({})
  const [showCopyDropdown, setShowCopyDropdown] = useState(false)
  const [showAllHosts, setShowAllHosts] = useState(false)
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, danger: false })
  const copyDropdownRef = useRef(null)

  const INITIAL_HOSTS_LIMIT = 3

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (copyDropdownRef.current && !copyDropdownRef.current.contains(e.target)) {
        setShowCopyDropdown(false)
      }
    }

    if (showCopyDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCopyDropdown])

  const loadPermissions = useCallback(async () => {
    const { policies = {} } = await browser.storage.local.get('policies')
    const hostData = {}

    Object.entries(policies).forEach(([host, accepts]) => {
      Object.entries(accepts).forEach(([accept, types]) => {
        if (Object.keys(types).length === 0) return

        hostData[host] = hostData[host] || []
        Object.entries(types).forEach(([type, { conditions, created_at }]) => {
          hostData[host].push({
            type,
            accept,
            conditions,
            created_at
          })
        })
      })
    })

    setPermissions(hostData)
  }, [])

  useEffect(() => {
    loadPermissions()

    const handleStorageChange = (changes) => {
      if (changes.policies) {
        loadPermissions()
      }
      if (changes.isAuthenticated && !changes.isAuthenticated.newValue) {
        window.location.reload()
      }
    }

    browser.storage.onChanged.addListener(handleStorageChange)

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [loadPermissions])

  const handleRevoke = (host, accept, type) => {
    setConfirmModal({
      isOpen: true,
      title: 'Revoke Permission',
      message: `Revoke ${accept === 'true' ? 'allow' : 'deny'} ${type} permission from ${host}?`,
      danger: true,
      onConfirm: async () => {
        await removePermissions(host, accept, type)
        loadPermissions()
      }
    })
  }

  const editAccountCallback = async () => {
    setEditAccountModal(false)
    await updateAccounts()
  }


  const toggleHostExpanded = (host) => {
    setExpandedHosts(prev => ({ ...prev, [host]: !prev[host] }))
  }

  const policyEntries = Object.entries(policies)
  const visibleHosts = showAllHosts ? policyEntries : policyEntries.slice(0, INITIAL_HOSTS_LIMIT)
  const hasMoreHosts = policyEntries.length > INITIAL_HOSTS_LIMIT

  const deleteImportedAccount = (prvKey) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Account',
      message: 'Are you sure you want to delete this account? Make sure you have a backup.',
      danger: true,
      onConfirm: async () => {
        const vault = await getSessionVault()
        const password = await getSessionPassword()

        if (!password || !vault) {
          toast.error('Session expired. Please unlock your vault again.')
          return
        }

        const index = vault.importedAccounts.findIndex(item => item.prvKey === prvKey)

        if (index !== -1) {
          vault.importedAccounts.splice(index, 1)
          vault.accountDefault = undefined

          const encryptedVault = encrypt(vault, password)
          await browser.storage.local.set({ encryptedVault })
          await setSessionVault(vault)
          await updateAccounts()
        }
      }
    })
  }

  const isValidUrl = (url) => {
    if (!url) return false
    // Allow data: URLs for identicons/generated images
    if (url.startsWith('data:image/')) return true
    try {
      const parsed = new URL(url)
      return ['http:', 'https:'].includes(parsed.protocol)
    } catch { return false }
  }

  if (loading || !defaultAccount.npub) {
    return (
      <div className="Popup">
        <Loading />
      </div>
    )
  }

  return (
    <div className="Popup">
      <div className="profile">
        {isValidUrl(defaultAccount.banner) ? (
          <div className="profile__banner" style={{ backgroundImage: `url(${defaultAccount.banner})` }} />
        ) : (
          <div className="profile__banner" />
        )}
        <div className="profile__body">
          <img className="profile__img" src={isValidUrl(defaultAccount.picture) ? defaultAccount.picture : ''} alt="" />
          <ul className="profile__nav">
            <li>
              <a href="#" onClick={(e) => { e.preventDefault(); setEditAccountModal(true); setAccountEditing(defaultAccount) }}>
                <i className="icon-pencil"></i>
              </a>
            </li>
            <li>
              <a href="#" onClick={(e) => { e.preventDefault(); setAccountDetails(defaultAccount); setShowAccountDetails(true) }} title="View QRCode">
                <i className="icon-qrcode"></i>
              </a>
            </li>
            {defaultAccount.type === 'imported' && (
              <li>
                <a href="#" onClick={(e) => { e.preventDefault(); deleteImportedAccount(defaultAccount.prvKey) }} title="Remove account">
                  <i className="icon-bin"></i>
                </a>
              </li>
            )}
            <li className="dropdown" ref={copyDropdownRef}>
              <a href="#" onClick={(e) => { e.preventDefault(); setShowCopyDropdown(!showCopyDropdown) }} title="Copy public key">
                <i className="icon-copy"></i>
              </a>
              {showCopyDropdown && (
                <ul className="dropdown__menu">
                  <li>
                    <a href="#" onClick={(e) => { copyToClipboard(e, defaultAccount.npub); setShowCopyDropdown(false) }}>
                      Copy npub
                    </a>
                  </li>
                  <li>
                    <a href="#" onClick={(e) => { copyToClipboard(e, defaultAccount.pubKey); setShowCopyDropdown(false) }}>
                      Copy hex
                    </a>
                  </li>
                </ul>
              )}
            </li>
          </ul>
          <div>
            <strong>
              {defaultAccount.type === "derived"
                ? (defaultAccount.name || `Account ${defaultAccount.index}`)
                : (defaultAccount.name || `Imported ${defaultAccount.index}`)}
            </strong>
            {defaultAccount.type === "imported" && <small> Imported</small>}
            <br />
            {hideStringMiddle(defaultAccount.npub)}
            {defaultAccount.nip05 && <><br />{defaultAccount.nip05}</>}
            {defaultAccount.lud16 && <><br />{defaultAccount.lud16}</>}
            {defaultAccount.about && <><br />{defaultAccount.about}</>}
          </div>
        </div>
      </div>

      <hr />

      <div className="tabs">
        <div className="tabs-nav">
          <span>Permissions</span>
        </div>

        <div className="tabs-content">
          <div className="tabs-item">
            {policyEntries.length > 0 ? (
              <>
                {visibleHosts.map(([host, permissions]) => (
                  <div key={host} className="permission-host">
                    <h3
                      onClick={() => toggleHostExpanded(host)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <span>{host}</span>
                      <span style={{ fontSize: '12px' }}>
                        {permissions.length} permission{permissions.length !== 1 ? 's' : ''}
                        {' '}
                        {expandedHosts[host] ? '▲' : '▼'}
                      </span>
                    </h3>
                    {expandedHosts[host] && permissions.map((permission) => (
                      <div key={`${host}-${permission.type}-${permission.accept}`} className="permission-item">
                        <div className="permission-item__col">
                          <strong>
                            {permission.type} {permission.accept === 'true' ? 'allow' : 'deny'}
                            {' '}
                            {permission.conditions?.remember === 'kind' && permission.conditions?.kinds
                              ? `kinds: ${Object.keys(permission.conditions.kinds).join(', ')}`
                              : permission.conditions?.remember === 'forever'
                              ? 'always'
                              : permission.conditions?.kinds
                              ? `kinds: ${Object.keys(permission.conditions.kinds).join(', ')}`
                              : 'always'}
                          </strong>
                          <br />
                          {new Date(permission.created_at * 1000).toISOString().split('.')[0].replace('T', ' ')}
                        </div>
                        <div className="permission-item__col">
                          <button title="Revoke permission" onClick={() => handleRevoke(host, permission.accept, permission.type)}>
                            <i className="icon-bin"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                    <hr />
                  </div>
                ))}
                {hasMoreHosts && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowAllHosts(prev => !prev)}
                    style={{ width: '100%', marginTop: '8px' }}
                  >
                    {showAllHosts
                      ? 'Show less'
                      : `Show ${policyEntries.length - INITIAL_HOSTS_LIMIT} more host${policyEntries.length - INITIAL_HOSTS_LIMIT !== 1 ? 's' : ''}`}
                  </button>
                )}
              </>
            ) : (
              <div>No permissions have been granted yet</div>
            )}
          </div>
        </div>
      </div>

      <EditAccountModal
        isOpen={showEditAccountModal}
        accountData={accountEditing}
        callBack={editAccountCallback}
        onClose={() => setEditAccountModal(false)}
      />

      <AccountDetailsModal
        isOpen={showAccountDetails}
        accountData={accountDetails}
        onClose={() => setShowAccountDetails(false)}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        danger={confirmModal.danger}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  )
}

export default VaultPage
