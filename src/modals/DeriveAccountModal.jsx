import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { privateKeyFromSeedWords } from 'nostr-tools/nip06'
import { SimplePool } from 'nostr-tools/pool'
import { finalizeEvent } from 'nostr-tools/pure'
import { encrypt } from '../common'
import Modal from './Modal'

const DeriveAccountModal = ({ isOpen, onClose, callBack }) => {
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

    const storage = await browser.storage.local.get(['vault', 'password', 'relays'])
    const vault = storage.vault

    vault.accountIndex++
    const prvKey = privateKeyFromSeedWords(vault.mnemonic, vault.passphrase, vault.accountIndex)
    vault.accounts.push({
      prvKey,
    })
    const encryptedVault = encrypt(vault, storage.password)
    await browser.storage.local.set({ 
      vault,
      encryptedVault,
    })

    if (name || name !== '') {
      const pool = new SimplePool()
      const relays = storage.relays
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
