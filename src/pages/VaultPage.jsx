import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import getIdenticon from '../helpers/identicon'
import hideStringMiddle from '../helpers/hideStringMiddle'
import copyToClipboard from '../helpers/copyToClipboard'
import EditAccountModal from '../modals/EditAccountModal'
import AccountDetailsModal from '../modals/AccountDetailsModal'
import MainContext from '../contexts/MainContext'
import { encrypt, removePermissions } from '../common'

const VaultPage = () => {
  const { accounts, defaultAccount, updateAccounts, updateDefaultAccount } = useContext(MainContext)

  const navigate = useNavigate()

  const [showEditAccountModal, setEditAccountModal] = useState(false)
  const [accountEditing, setAccountEditing] = useState({})
  const [accountDetails, setAccountDetails] = useState({})
  const [showAccountDetails, setShowAccountDetails] = useState(false)
  const [policies, setPermissions] = useState([])
  const [accountFormat, setAccountFormat] = useState('bech32')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    updateAccounts()
    loadPermissions()
    browser.storage.onChanged.addListener(function(changes, area) {
      for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        if (key === 'isAuthenticated') {
          window.location.reload()
        }
      }
    })
  }, [])

  useEffect(() => {
    if (accounts.length) {
      fetchData()

      browser.storage.onChanged.addListener(function(changes, area) {
        //let { newValue, oldValue } = changes.vault
        //if (newValue.accountDefault !== oldValue.accountDefault) {
        //  //setLoaded(false)
        //  //fetchData()
        //}
      })
    }
  }, [accounts])

  const fetchData = async () => {
    const storage = await browser.storage.local.get(['vault', 'isAuthenticated'])

    if (!storage.isAuthenticated) {
      window.location.reload()
    }

    if (!storage.vault.accountDefault) {
      storage.vault.accountDefault = storage.vault.accounts[0].prvKey
    }
    setLoaded(true)
  }

  async function loadPermissions() {
    let { policies = {} } = await browser.storage.local.get('policies')
    const hostData = {}

    Object.entries(policies).forEach(([host, accepts]) => {
      hostData[host] = hostData[host] || []

      Object.entries(accepts).forEach(([accept, types]) => {
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
  }

  async function handleRevoke(e) {
    let { host, accept, type } = e.target.dataset

    if (
      window.confirm(
        `revoke all ${accept === 'true' ? 'accept' : 'deny'
        } ${type} policies from ${host}?`
      )
    ) {
      await removePermissions(host, accept, type)
      //showMessage('removed policies') add toast
      loadPermissions()
    }
  }

  const editAccountCallback = async () => {
    setEditAccountModal(false)
    await updateAccounts()
    fetchData()
  }

  const UserIdenticon = async ( pubkey ) => {
    const identicon = await getIdenticon(pubkey)

    return `data:image/svg+xml;base64,${identicon}`
  }

  async function convertFormat(e) {
    e.preventDefault()
    setAccountFormat(accountFormat === 'bech32' ? 'hex' : 'bech32')
  }

  const deleteImportedAccount = async (prvKey) => {
    if (confirm("Are you sure you want to delete this account? Make sure if you have made a backup before you continue.")) {
      const { vault, password } = await browser.storage.local.get(['vault', 'password'])

      const index = vault.importedAccounts.findIndex(item => item.prvKey === prvKey)
      if (index !== -1) {
        vault.importedAccounts.splice(index, 1)

        vault.accountDefault = undefined

        const encryptedVault = encrypt(vault, password)
        await browser.storage.local.set({ encryptedVault, vault })

        await updateAccounts()
        fetchData()
      }
    }
  }

  return (
    <div className="Popup">
      <>
        {loaded ? (
          <>
            <div className="profile">
              { defaultAccount.banner === '' ? (
                <div className="profile__banner"></div>
              ) : (
                <div className="profile__banner" style={{ backgroundImage: `url(${defaultAccount.banner})` }}></div>
              )}
              <div className="profile__body">
                <img className="profile__img" src={defaultAccount.picture} />
                <ul className="profile__nav">
                  <li>
                    <a href="#" onClick={(e) => { e.preventDefault(); setEditAccountModal(true); setAccountEditing(defaultAccount) }}>
                      <i className="icon-pencil"></i>
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#"
                      onClick={(e) => { e.preventDefault(); setAccountDetails(defaultAccount); setShowAccountDetails(true) }}
                      title="View QRCode"
                    >
                      <i className="icon-qrcode"></i>
                    </a>
                  </li>
                  <li style={{ display: 'none' }}>
                    <a 
                      href="#"
                      title="Account details"
                    >
                      <i className="icon-dots-three-vertical"></i>
                    </a>
                  </li>
                  { defaultAccount.type === 'imported' ? (
                    <li>
                      <a href="#" onClick={(e) => { e.preventDefault(); deleteImportedAccount(defaultAccount.prvKey) }} title="Remove account">
                        <i className="icon-bin"></i>
                      </a>
                    </li>
                  ) : (
                    <li style={{ display: 'none' }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); }} title="Hide derived account">
                        <i className="icon-eye-blocked"></i>
                      </a>
                    </li>
                  )
                }
                </ul>
                <div>
                  <strong>
                    {defaultAccount.type === "derived" ? (
                      defaultAccount.name ? defaultAccount.name : 'Account ' + defaultAccount.index
                    ) : (
                      defaultAccount.name ? defaultAccount.name : 'Imported ' + defaultAccount.index
                    )}
                  </strong>
                  &nbsp;
                  {defaultAccount.type === "imported" && (
                    <small>Imported</small>
                  )}
                  <br />
                  {accountFormat === 'bech32' ? hideStringMiddle(defaultAccount.npub) : hideStringMiddle(defaultAccount.pubKey)}
                  &nbsp;
                  <a href="#" onClick={(e) => convertFormat(e)} title={accountFormat === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
                    <i className="icon-tab"></i>
                  </a>
                  &nbsp;
                  <a href="" onClick={(e) => copyToClipboard(e, accountFormat === 'bech32' ? defaultAccount.npub : defaultAccount.pubKey)} title="Copy">
                    <i className="icon-copy"></i>
                  </a>
                  {defaultAccount.nip05 && (
                    <>
                      <br />
                      {defaultAccount.nip05}
                    </>
                  )}
                  {defaultAccount.lud16 && (
                    <>
                      <br />
                      {defaultAccount.lud16}
                    </>
                  )}
                  {defaultAccount.about && (
                    <>
                      <br />
                      {defaultAccount.about}
                    </>
                  )}
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
                  {!!Object.values(policies).length && (
                    Object.entries(policies).map(([host, permissions]) => (
                      <div key={host}>
                        <h3>{host}</h3>
                        {permissions.map((permission, index) => (
                          <div key={index}>
                            <div className="permission-item">
                              <div className="permission-item__col">
                                <strong>
                                  {permission.type}
                                  &nbsp;
                                  {permission.accept === 'true' ? 'allow' : 'deny'}
                                  &nbsp;
                                  {permission.conditions.kinds
                                    ? `kinds: ${Object.keys(permission.conditions.kinds).join(', ')}`
                                    : 'always'}
                                </strong>
                                <br />
                                {new Date(permission.created_at * 1000)
                                  .toISOString()
                                  .split('.')[0]
                                  .split('T')
                                  .join(' ')}
                              </div>

                              <div className="permission-item__col">
                                <button
                                  title="Revoke permission"
                                  onClick={handleRevoke}
                                  data-host={host}
                                  data-accept={permission.accept}
                                  data-type={permission.type}
                                >
                                  <i className="icon-bin"></i>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        <hr />
                      </div>
                    ))
                  )}
                  {!Object.values(policies) && (
                    <div style={{ marginTop: '5px' }}>
                      no permissions have been granted yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="container">
              Loading...
            </div>
          </>
        )}
      </>

      <EditAccountModal 
        isOpen={showEditAccountModal}
        accountData={accountEditing}
        callBack={editAccountCallback}
        onClose={() => setEditAccountModal(false)}
      ></EditAccountModal>

      <AccountDetailsModal 
        isOpen={showAccountDetails}
        accountData={accountDetails}
        onClose={() => setShowAccountDetails(false)}
      ></AccountDetailsModal>
    </div>
  )
}

export default VaultPage
