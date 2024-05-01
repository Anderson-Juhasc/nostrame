import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react';
import { SimplePool } from 'nostr-tools/pool'
import { finalizeEvent } from 'nostr-tools/pure'
import Modal from './Modal';

const SecretsModal = ({ isOpen, onClose, accountData, callBack }) => {
  const pool = new SimplePool()

  const [showModal, setShowModal] = useState(isOpen);
  const [account, setAccount] = useState({
    name: '',
    about: '',
    picture: '',
    nip05: '',
    lud16: '',
  });

  useEffect(() => {
    //setAccount(accountData)
    setAccount({
      name: accountData.name,
      about: accountData.about,
      picture: accountData.picture,
      nip05: accountData.nip05,
      lud16: accountData.lud16,
    })
  }, [accountData])

  useEffect(() => {
    setShowModal(isOpen)
  }, [isOpen])

  const closeModal = () => {
    setShowModal(false);
    //onClose()
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

    let relays = JSON.parse(storage.relays)

    let event = {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify({
        name: (account.name).toLowerCase(), 
        display_name: account.name,
        about: account.about,
        picture: account.picture,
        nip05: account.nip05,
        lud16: account.lud16,
      }),
    }

    const signedEvent = finalizeEvent(event, accountData.prvKey)
    await Promise.any(pool.publish(relays, signedEvent))
    
    callBack()
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={onClose}>
        <h2>Edit Account</h2>
        <form onSubmit={saveAccount}>
          <input
            type="text"
            placeholder="Name"
            name="name"
            value={account.name}
            onChange={accountChange}
          />
          <br />
          <input
            type="text"
            placeholder="About"
            name="about"
            value={account.about}
            onChange={accountChange}
          />
          <br />
          <input
            type="text"
            placeholder="Picture url"
            name="picture"
            value={account.picture}
            onChange={accountChange}
          />
          <br />
          <input
            type="text"
            placeholder="NIP05"
            name="nip05"
            value={account.nip05}
            onChange={accountChange}
          />
          <br />
          <input
            type="text"
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

export default SecretsModal
