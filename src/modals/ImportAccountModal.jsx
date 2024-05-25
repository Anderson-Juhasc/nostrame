import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { encrypt } from '../common'
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

    const storage = await browser.storage.local.get(['vault', 'password'])
    const vault = storage.vault

    if (/^nsec/.test(prvKey)) {
      try {
        let {type, data} = nip19.decode(prvKey)

        if (type === 'nsec') {
          const prvKeyHex = bytesToHex(data)
          //if (!vault.importedAccounts) { vault.importedAccounts = [] }
          const prvKeyExist = vault.importedAccounts.find(obj => obj['prvKey'] === prvKeyHex)
          const prvKeyExistInDerived = vault.accounts.find(obj => obj['prvKey'] === prvKeyHex)
          if (prvKeyExist || prvKeyExistInDerived) {
            alert('Please provide a not existing private key')
            setPrvKey('')
            return false
          }
          vault.importedAccounts.push({ prvKey: prvKeyHex })
          const encryptedVault = encrypt(vault, storage.password)
          await browser.storage.local.set({ 
            vault,
            encryptedVault,
          })
          callBack()
        }
      } catch (e) {
        console.log(e)
        alert('Please provide a valid private key')
        setPrvKey('')
      }
    } else if (/^[0-9a-fA-F]+$/.test(prvKey)) {
      try {
        let prvKeyBytes = hexToBytes(prvKey)
        let prvKeyHex = bytesToHex(prvKeyBytes) 

        const prvKeyExist = vault.importedAccounts.find(obj => obj['prvKey'] === prvKeyHex)
        const prvKeyExistInDerived = vault.accounts.find(obj => obj['prvKey'] === prvKeyHex)
        if (prvKeyExist || prvKeyExistInDerived) {
          alert('Please provide a not existing private key')
          setPrvKey('')
          return false
        }

        vault.importedAccounts.push({ prvKey: prvKeyHex })
        const encryptedVault = encrypt(vault, storage.password)
        await browser.storage.local.set({ 
          vault,
          encryptedVault,
        })

        callBack()
      } catch (e) {
        console.log(e)
        alert('Please provide a valid private key')
        setPrvKey('')
      }
    }

    setPrvKey('')
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={onClose}>
        <form onSubmit={importAccount}>
          <label>Import account</label>
          <br />
          <input
            type="text"
            autoComplete="off"
            placeholder="nsec or hex"
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
