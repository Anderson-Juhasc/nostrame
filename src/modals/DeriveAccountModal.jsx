import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext } from 'react'
import { toast } from 'react-toastify'
import { privateKeyFromSeedWords } from 'nostr-tools/nip06'
import { bytesToHex, hexToBytes } from 'nostr-tools/utils'
import { getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import { getSessionVault, setSessionVault, pool, DEFAULT_RELAYS } from '../common'
import Modal from './Modal'
import MainContext from '../contexts/MainContext'
import { ensureRelayListExists, fetchRelayList } from '../helpers/outbox'

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

    const vault = await getSessionVault()

    if (!vault) {
      toast.error('Session expired. Please unlock your vault again.')
      return
    }

    vault.accountIndex++
    const prvKey = bytesToHex(privateKeyFromSeedWords(vault.mnemonic, vault.passphrase, vault.accountIndex))
    const prvKeyBytes = hexToBytes(prvKey)
    const pubkey = getPublicKey(prvKeyBytes)

    vault.accounts.push({
      prvKey,
    })
    vault.accountDefault = prvKey

    // Encrypt via background (key stays in background memory)
    const response = await browser.runtime.sendMessage({
      type: 'ENCRYPT_VAULT',
      data: vault
    })

    if (!response.success) {
      toast.error('Failed to save vault. Please unlock again.')
      return
    }

    await browser.storage.local.set({ encryptedVault: response.encryptedData })
    await setSessionVault(vault)
    await updateAccounts()

    // Ensure relay list exists first (publishes default relays if none exist)
    await ensureRelayListExists(pubkey, prvKeyBytes, finalizeEvent)

    // Publish profile using outbox model (write relays)
    if (name && name !== '') {
      let relays = DEFAULT_RELAYS
      try {
        const { relays: relayList } = await fetchRelayList(pubkey)
        const writeRelays = relayList.filter(r => r.write).map(r => r.url)
        if (writeRelays.length > 0) {
          relays = writeRelays
        }
      } catch (err) {
        console.error('Failed to fetch relay list, using defaults:', err)
      }

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
    toast.success('Account created successfully')
    callBack()
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={onClose}>
        <form onSubmit={addAccount}>
          <label>Derive account</label>
          <p className="modal-info">
            This account will be derived from your vault's mnemonic seed phrase using the next available index.
          </p>
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
