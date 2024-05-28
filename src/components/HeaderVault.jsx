import browser from 'webextension-polyfill'
import React, { useState } from 'react'
import GenerateRandomAccountModal from '../modals/GenerateRandomAccountModal'

const HeaderVault = ({ setAccounts, setIsLocked, setLoaded, fetchData }) => {
  const [showRandomAccount, setShowRandomAccount] = useState(false)

  const openOptionsButton = async () => {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage()
    } else {
      window.open(browser.runtime.getURL('options.html'))
    }
  }

  const lockVault = async () => {
    setIsLocked()
    setAccounts()
    setLoaded()
    await browser.storage.local.set({ 
      isLocked: true,
      vault: {
        accounts: [],
      },
      password: '',
    })
  }

  const generateRandomAccountCallback = () => {
    setLoaded()
    setShowRandomAccount(false)
    fetchData()
  }

  return (
    <>
      <div className="header">
        <h1>
          Nostrame
        </h1>

        <div>
          <a href="#" onClick={(e) => { e.preventDefault(); lockVault() }} title="Lock now">
            <i className="icon-lock"></i>
          </a>
          &nbsp;
          <a href="#" onClick={(e) => { e.preventDefault(); setShowRandomAccount(true) }} title="Generate random account">
            <i className="icon-loop2"></i>
          </a>
          &nbsp;
          <a href="#" onClick={(e) => { e.preventDefault(); openOptionsButton() }} title="Options">
            <i className="icon-cog"></i>
          </a>
        </div>
      </div>

      <GenerateRandomAccountModal 
        isOpen={showRandomAccount}
        callBack={generateRandomAccountCallback}
        onClose={() => setShowRandomAccount(false)}
      ></GenerateRandomAccountModal>
    </>
  )
}
export default HeaderVault
