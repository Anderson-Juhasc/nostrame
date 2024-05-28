import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import { encrypt } from '../common'
import EditAccountModal from '../modals/EditAccountModal'
import AccountDetailsModal from '../modals/AccountDetailsModal'

const AccountListings = ({ accountsData, type, fetchData, reloadData }) => {
  const [accounts, setAccounts] = useState(accountsData)
  const [accountEditing, setAccountEditing] = useState({})
  const [showEditAccountModal, setEditAccountModal] = useState(false)
  const [accountDetails, setAccountDetails] = useState({})
  const [showAccountDetails, setShowAccountDetails] = useState(false)

  const hideStringMiddle = (inputString, startChars = 10, endChars = 8) => {
    if (inputString.length <= startChars + endChars) {
        return inputString; // Return the string as is if its length is less than or equal to the combined length of startChars and endChars
    }
    
    const hiddenPart = '.'.repeat(3); // Create a string of dots (or any character you want to use to hide)
    
    // Slice and combine the string to show the startChars, hiddenPart, and endChars
    const result = inputString.slice(0, startChars) + hiddenPart + inputString.slice(-endChars);
    
    return result;
  }

  const copyToClipboard = (e, text) => {
    e.preventDefault()
    navigator.clipboard.writeText(text)
  }
  
  async function toggleFormat(e, account) {
    e.preventDefault()
    let newFormat = account.format === 'bech32' ? 'hex' : 'bech32'

    setAccounts((prevAccounts) => {
      prevAccounts[account.index]['format'] = newFormat
      return [...prevAccounts]
    })
  }

  const editAccountCallback = () => {
    reloadData()
    setEditAccountModal(false)
    fetchData()
  }

  const deleteImportedAccount = async (index) => {
    if (confirm("Are you sure you want to delete this account? Make sure if you have made a backup before you continue.")) {
      const storage = await browser.storage.local.get(['vault', 'password'])
      const vault = storage.vault
      const newImportedAccounts = [...vault.importedAccounts]
      if (index !== -1) {
        newImportedAccounts.splice(index, 1)
      }
      vault.importedAccounts = newImportedAccounts
      const encryptedVault = encrypt(vault, storage.password)
      await browser.storage.local.set({ 
        encryptedVault,
        vault,
      })
      reloadData()
      fetchData()
    }
  }

  return (
    <>
      {accounts.map((account, index) => (
        <div key={index} className="card">
          <header className="card-head">
            <div className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
              <img src={account.picture} width="30" style={{ borderRadius: '50%' }} />
              &nbsp;
              <strong>{account.name ? account.name : 'Account ' + index}:</strong>
              &nbsp;
              <a href="#" onClick={(e) => toggleFormat(e, account)} title={account.format === 'bech32' ? 'Convert to hex' : 'Convert to bech32'}>
                <i className="icon-tab"></i>
              </a>
              &nbsp;
            </div>
            <div className="dropdown">
              <a href="#" onClick={(e) => e.preventDefault()} className="dropdown-btn">
                <i className="icon-dots-three-vertical"></i>
              </a>
              <div className="dropdown-content">
                <a href="#" onClick={(e) => { e.preventDefault(); setEditAccountModal(true); setAccountEditing(account) }}>
                  <i className="icon-pencil"></i> Edit
                </a>
                <a 
                  href="#"
                  onClick={(e) => { e.preventDefault(); setAccountDetails(account); setShowAccountDetails(true) }}
                  title="Account details"
                >
                  <i className="icon-qrcode"></i> Account details
                </a>
                { type === 'imported' && (
                  <a href="#" onClick={(e) => { e.preventDefault(); deleteImportedAccount(index) }} title="Remove account">
                    <i className="icon-bin"></i> Remove account
                  </a>
                )}
              </div>
            </div>
          </header>
          <strong>{account.format === 'bech32' ? 'Npub' : 'Public Key'}:</strong>
          &nbsp;
          {account.format === 'bech32' ? hideStringMiddle(account.npub) : hideStringMiddle(account.pubKey)}
          &nbsp;
          <a href="" onClick={(e) => copyToClipboard(e, account.format === 'bech32' ? account.npub : account.pubKey)} title="Copy">
            <i className="icon-copy"></i>
          </a>
        </div>
      ))}

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
    </>
  )
}
export default AccountListings
