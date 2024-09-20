import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { SimplePool } from 'nostr-tools/pool'
import hideStringMiddle from '../helpers/hideStringMiddle'
import ImportAccountModal from '../modals/ImportAccountModal'
import DeriveAccountModal from '../modals/DeriveAccountModal'
import MainContext from '../contexts/MainContext'

const Accounts = () => {
  const { accounts, defaultAccount, updateDefaultAccount } = useContext(MainContext)

  //const [accounts, setAccounts] = useState([])
  //const [defaultAccount, setDefaultAccount] = useState({ index: '', name: '', type: '' })
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [showImportAccountModal, setShowImportAccountModal] = useState(false)
  const [showDeriveAccount, setShowDeriveAccount] = useState(false)

  const pool = new SimplePool()
  const navigate = useNavigate()

  useEffect(() => {
    //browser.storage.onChanged.addListener(function(changes, area) {
    //  let { newValue, oldValue } = changes.vault
    //  if (newValue.accountDefault !== oldValue.accountDefault) {
    //    console.log(1)
    //    fetchData()
    //  }
    //})
  }, [])

  useEffect(() => {
    if (accounts.length) {
      fetchData()
    }
  }, [accounts])

  const fetchData = async () => {
    const storage = await browser.storage.local.get()

    if (storage.isAuthenticated && !storage.isLocked) {
      if (!storage.vault.accountDefault) {
        storage.vault.accountDefault = storage.vault.accounts[0].prvKey
      }
    }
  }

  const changeDefaultAccount = async (prvKey) => {
    const { vault: vaultData } = await browser.storage.local.get(['vault'])
    vaultData.accountDefault = prvKey

    await browser.storage.local.set({ 
      vault: vaultData,
    })
    updateDefaultAccount()
    fetchData()
    toggleDropdown()
    navigate('/vault')
  }

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen)
  }

  const lockVault = async () => {
    await browser.storage.local.set({ 
      isLocked: true,
      vault: {
        accounts: [],
      },
      password: '',
    })
    window.location.reload()
  }

  const deriveAccountCallback = () => {
    setShowDeriveAccount(false)
    //fetchData()
  }

  const importAccountCallback = () => {
    setShowImportAccountModal(false)
    //fetchData()
  }

  return (
    <>
      <div className="account">
        <a href="#" className="account-profile" onClick={(e) => { e.preventDefault(); toggleDropdown() }}>
          <span>&#x25BC;</span>
          <img className="account-profile__img" src={defaultAccount.picture} style={{ borderRadius: '50%', border: '2px solid #fff' }} />
          <div className="account-profile__body">
            <strong className="account-profile__name">
              {defaultAccount.type === "derived" && (
                defaultAccount.name ? defaultAccount.name : 'Account ' + defaultAccount.index
              )}
              {defaultAccount.type === "imported" && (
                defaultAccount.name ? defaultAccount.name : 'Imported ' + defaultAccount.index
              )}
            </strong>
          </div>
        </a>
        
        {isDropdownOpen && (
        <div className="account-dropdown">
          <div className="account-dropdown__head">
            <div className="account-dropdown__title">
              Accounts
            </div>

            <a href="#" onClick={(e) => { e.preventDefault(); lockVault() }} title="Lock now">
              <i className="icon-lock"></i> Lock
            </a>
          </div>

          <div className="account-items">
            {accounts.map((account, index) => (
              <div key={index} className={account.prvKey === defaultAccount.prvKey ? "account-dropdown__item current" : "account-dropdown__item"}>
                <a href="#" onClick={(e) => { e.preventDefault(); changeDefaultAccount(account.prvKey) }} style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <img src={account.picture} height="30" width="30" style={{ borderRadius: '50%', border: '2px solid #fff' }} />
                  &nbsp;
                  <div>
                    <div>
                      <strong>
                        {account.type === "derived" ? (
                          account.name ? account.name : 'Account ' + account.index
                        ) : (
                          account.name ? account.name : 'Imported ' + account.index
                        )}
                      </strong>
                      &nbsp;
                      {account.type === "imported" && (
                        <small>Imported</small>
                      )}
                    </div>
                    <div>
                      {account.format === 'bech32' ? hideStringMiddle(account.npub) : hideStringMiddle(account.pubKey)}
                    </div>
                  </div>
                </a>
              </div>
            ))}
          </div>

          <div>
            <ul className="account-dropdown-nav">
              <li>
                <a href="#" onClick={(e) => { e.preventDefault(); setShowDeriveAccount(true); toggleDropdown() }} title="Create account">
                  <i className="icon-user-plus"></i>
                  &nbsp;
                  Create account
                </a>
              </li>
              <li>
                <a href="#" onClick={(e) => { e.preventDefault(); setShowImportAccountModal(true); toggleDropdown() }} title="Import account">
                  <i className="icon-download"></i> Import account
                </a>
              </li>
            </ul>
          </div>
        </div>
        )}

        <ImportAccountModal 
          isOpen={showImportAccountModal}
          callBack={importAccountCallback}
          onClose={() => setShowImportAccountModal(false)}
        ></ImportAccountModal>

        <DeriveAccountModal 
          isOpen={showDeriveAccount}
          callBack={deriveAccountCallback}
          onClose={() => setShowDeriveAccount(false)}
        ></DeriveAccountModal>
      </div>
    </>
  )
}
export default Accounts
