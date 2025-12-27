import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext, useCallback } from 'react'
import hideStringMiddle from '../helpers/hideStringMiddle'
import copyToClipboard from '../helpers/copyToClipboard'
import EditAccountModal from '../modals/EditAccountModal'
import AccountDetailsModal from '../modals/AccountDetailsModal'
import Loading from '../components/Loading'
import MainContext from '../contexts/MainContext'
import { encrypt, removePermissions, getSessionPassword } from '../common'

const VaultPage = () => {
  const { accounts, defaultAccount, loading, updateAccounts } = useContext(MainContext)

  const [showEditAccountModal, setEditAccountModal] = useState(false)
  const [accountEditing, setAccountEditing] = useState({})
  const [accountDetails, setAccountDetails] = useState({})
  const [showAccountDetails, setShowAccountDetails] = useState(false)
  const [policies, setPermissions] = useState({})
  const [accountFormat, setAccountFormat] = useState('bech32')
  const [expandedHosts, setExpandedHosts] = useState({})
  const [showAllHosts, setShowAllHosts] = useState(false)

  const INITIAL_HOSTS_LIMIT = 3

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

  // Load permissions and listen for changes
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

  const handleRevoke = async (host, accept, type) => {
    if (window.confirm(
      `Revoke ${accept === 'true' ? 'allow' : 'deny'} ${type} permission from ${host}?`
    )) {
      await removePermissions(host, accept, type)
      loadPermissions()
    }
  }

  const editAccountCallback = async () => {
    setEditAccountModal(false)
    await updateAccounts()
  }

  const convertFormat = (e) => {
    e.preventDefault()
    setAccountFormat(prev => prev === 'bech32' ? 'hex' : 'bech32')
  }

  const toggleHostExpanded = (host) => {
    setExpandedHosts(prev => ({ ...prev, [host]: !prev[host] }))
  }

  // Get visible hosts based on showAllHosts state
  const policyEntries = Object.entries(policies)
  const visibleHosts = showAllHosts ? policyEntries : policyEntries.slice(0, INITIAL_HOSTS_LIMIT)
  const hasMoreHosts = policyEntries.length > INITIAL_HOSTS_LIMIT

  const deleteImportedAccount = async (prvKey) => {
    if (!confirm("Are you sure you want to delete this account? Make sure you have a backup.")) {
      return
    }

    const { vault } = await browser.storage.local.get(['vault'])
    const password = await getSessionPassword()

    if (!password) {
      alert('Session expired. Please unlock your vault again.')
      return
    }

    const index = vault.importedAccounts.findIndex(item => item.prvKey === prvKey)

    if (index !== -1) {
      vault.importedAccounts.splice(index, 1)
      vault.accountDefault = undefined

      const encryptedVault = encrypt(vault, password)
      await browser.storage.local.set({ encryptedVault, vault })
      await updateAccounts()
    }
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
        {defaultAccount.banner ? (
          <div className="profile__banner" style={{ backgroundImage: `url(${defaultAccount.banner})` }} />
        ) : (
          <div className="profile__banner" />
        )}
        <div className="profile__body">
          <img className="profile__img" src={defaultAccount.picture} alt="" />
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
          </ul>
          <div>
            <strong>
              {defaultAccount.type === "derived"
                ? (defaultAccount.name || `Account ${defaultAccount.index}`)
                : (defaultAccount.name || `Imported ${defaultAccount.index}`)}
            </strong>
            {defaultAccount.type === "imported" && <small> Imported</small>}
            <br />
            {accountFormat === 'bech32'
              ? hideStringMiddle(defaultAccount.npub)
              : hideStringMiddle(defaultAccount.pubKey)}
            &nbsp;
            <a href="#" onClick={convertFormat} title={accountFormat === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
              <i className="icon-tab"></i>
            </a>
            &nbsp;
            <a href="#" onClick={(e) => copyToClipboard(e, accountFormat === 'bech32' ? defaultAccount.npub : defaultAccount.pubKey)} title="Copy">
              <i className="icon-copy"></i>
            </a>
            {defaultAccount.nip05 && <><br />{defaultAccount.nip05}</>}
            {defaultAccount.lud16 && <><br />{defaultAccount.lud16}</>}
            {defaultAccount.about && <><br />{defaultAccount.about}</>}
          </div>
        </div>
      </div>

      <hr />

      <div className="tabs">
        <div className="tabs-nav">
          <a href="#">Permissions</a>
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
                            {permission.conditions?.kinds
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
    </div>
  )
}

export default VaultPage
