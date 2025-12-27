import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import { finalizeEvent } from 'nostr-tools/pure'
import Modal from './Modal'
import { pool, DEFAULT_RELAYS } from '../common'

const EditAccountModal = ({ isOpen, onClose, accountData, callBack }) => {
  const [showModal, setShowModal] = useState(isOpen);
  const [account, setAccount] = useState({
    name: '',
    about: '',
    picture: '',
    banner: '',
    nip05: '',
    lud16: '',
  });

  useEffect(() => {
    setAccount({
      name: accountData.name || '',
      about: accountData.about || '',
      picture: accountData.picture || '',
      banner: accountData.banner || '',
      nip05: accountData.nip05 || '',
      lud16: accountData.lud16 || '',
    })
  }, [accountData])

  useEffect(() => {
    setShowModal(isOpen)
  }, [isOpen])

  const closeModal = () => {
    setShowModal(false)
  }

  const accountChange = (e) => {
    const { name, value } = e.target;
    setAccount(prevAccount => ({
      ...prevAccount,
      [name]: value
    }))
  }

  const saveAccount = async (e) => {
    e.preventDefault()
    const storage = await browser.storage.local.get(['relays'])

    let relays = storage.relays?.length > 0 ? storage.relays : DEFAULT_RELAYS

    try {
      let event = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify({
          name: account.name, 
          display_name: account.name,
          about: account.about,
          picture: account.picture,
          banner: account.banner,
          nip05: account.nip05,
          lud16: account.lud16,
        }),
      }

      const signedEvent = finalizeEvent(event, accountData.prvKey)
      await Promise.any(pool.publish(relays, signedEvent))
      
      callBack()
    } catch (error) {
      console.error('Failed to update profile:', error)
    }
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={onClose}>
        <h2>Edit Account</h2>
        <form onSubmit={saveAccount}>
          <input
            type="text"
            autoComplete="off"
            placeholder="Name"
            name="name"
            value={account.name}
            onChange={accountChange}
          />
          <br />
          <textarea
            rows="3"
            autoComplete="off"
            placeholder="About"
            name="about"
            value={account.about}
            onChange={accountChange}
          ></textarea>
          <br />
          <input
            type="text"
            autoComplete="off"
            placeholder="Picture url"
            name="picture"
            value={account.picture.startsWith('data:image/svg') ? '' : account.picture}
            onChange={accountChange}
          />
          <br />
          <input
            type="text"
            autoComplete="off"
            placeholder="Banner url"
            name="banner"
            value={account.banner}
            onChange={accountChange}
          />
          <br />
          <input
            type="text"
            autoComplete="off"
            placeholder="NIP05"
            name="nip05"
            value={account.nip05}
            onChange={accountChange}
          />
          <br />
          <input
            type="text"
            autoComplete="off"
            placeholder="LUD16"
            name="lud16"
            value={account.lud16}
            onChange={accountChange}
          />
          <br />
          <button className="btn" type="submit">Save</button>
        </form>
      </Modal>
    </div>
  )
}

export default EditAccountModal
