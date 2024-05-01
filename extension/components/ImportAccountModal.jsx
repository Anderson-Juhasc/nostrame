import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import {bytesToHex} from '@noble/hashes/utils'
import { encrypt, decrypt } from '../common'
import Modal from './Modal'

const ImportAccountModal = ({ isOpen, onClose, callBack }) => {
  const [showModal, setShowModal] = useState(isOpen)
  const [prvKey, setPrvKey] = useState('')

  useEffect(() => {
    setShowModal(isOpen)
  }, [isOpen])

  const closeModal = () => {
    setShowModal(false)
    onClose()
  }

  const importAccount = async (e) => {
    e.preventDefault()

    const storage = await browser.storage.local.get(['wallet', 'password'])
    const wallet = storage.wallet

    try {
      let {type, data} = nip19.decode(prvKey)
      if (type === 'nsec') {
        const hexPrvKey = bytesToHex(data)
        //if (!wallet.importedAccounts) { wallet.importedAccounts = [] }
        const prvKeyExist = wallet.importedAccounts.find(obj => obj['prvKey'] === hexPrvKey)
        const prvKeyExistInDerived = wallet.accounts.find(obj => obj['prvKey'] === hexPrvKey)
        if (prvKeyExist || prvKeyExistInDerived) {
          alert('Please provide a not existing private key')
          setPrvKey('')
          return false
        }
        const len = wallet.importedAccounts.length
        wallet.importedAccounts.push({ index: len, prvKey: hexPrvKey })
        const encryptedWallet = encrypt(wallet, storage.password)
        await browser.storage.local.set({ 
          wallet,
          encryptedWallet,
        })
        callBack()
      }
    } catch (e) {
      console.log(e)
      alert('Please provide a valid private key')
      setPrvKey('')
    }
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={onClose}>
        <form onSubmit={importAccount}>
          <label>Import account</label>
          <br />
          <input
            type="text"
            autocomplete="off"
            placeholder="nsec"
            name="prvKey"
            required
            value={prvKey}
            onChange={(e) => setPrvKey(e.target.value)}
          />
          <br />
          <button type="submit" className="btn">Import</button>
        </form>
      </Modal>
    </div>
  )
}

export default ImportAccountModal
