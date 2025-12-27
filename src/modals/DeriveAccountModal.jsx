import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext } from 'react'
import { privateKeyFromSeedWords } from 'nostr-tools/nip06'
import { bytesToHex } from 'nostr-tools/utils'
import { finalizeEvent } from 'nostr-tools/pure'
import { encrypt, getSessionPassword, getSessionVault, setSessionVault, pool, DEFAULT_RELAYS } from '../common'
import Modal from './Modal'
import MainContext from '../contexts/MainContext'

const DeriveAccountModal = ({ isOpen, onClose, callBack }) => {
  const { updateAccounts } = useContext(MainContext)

  const [showModal, setShowModal] = useState(isOpen)
  const [name, setName] = useState('')

  useEffect(() => {
    setShowModal(isOpen)
  }, [isOpen])

  const closeModal = () => {
    setShowModal(false)
    onClose()
  }

  const addAccount = async (e) => {
    e.preventDefault()

    const storage = await browser.storage.local.get(['relays'])
    const vault = await getSessionVault()
    const password = await getSessionPassword()

    if (!password || !vault) {
      alert('Session expired. Please unlock your vault again.')
      return
    }

    vault.accountIndex++
    const prvKey = bytesToHex(privateKeyFromSeedWords(vault.mnemonic, vault.passphrase, vault.accountIndex))
    vault.accounts.push({
      prvKey,
    })
    vault.accountDefault = prvKey

    if (name && name !== '') {
      const relays = storage.relays?.length > 0 ? storage.relays : DEFAULT_RELAYS
      const event = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify({
          name: name,
          display_name: name,
        }),
      }

      const signedEvent = finalizeEvent(event, prvKey)
      await Promise.any(pool.publish(relays, signedEvent))
    }

    const encryptedVault = encrypt(vault, password)
    await browser.storage.local.set({ encryptedVault })
    await setSessionVault(vault)
    await updateAccounts()

    setName('')
    callBack()
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={onClose}>
        <form onSubmit={addAccount}>
          <label>Add account</label>
          <br />
          <input
            type="text"
            autoComplete="off"
            placeholder="Account name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <br />
          <button type="submit" className="btn">Create</button>
        </form>
      </Modal>
    </div>
  )
}

export default DeriveAccountModal
