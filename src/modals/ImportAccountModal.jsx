import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom';
import * as nip19 from 'nostr-tools/nip19'
import * as nip49 from 'nostr-tools/nip49'
import { bytesToHex, hexToBytes } from 'nostr-tools/utils'
import { encrypt, getSessionPassword } from '../common'
import Modal from './Modal'
import MainContext from '../contexts/MainContext'

const ImportAccountModal = ({ isOpen, onClose, callBack }) => {
  const { updateAccounts } = useContext(MainContext)

  const navigate = useNavigate()

  const [showModal, setShowModal] = useState(isOpen)
  const [prvKey, setPrvKey] = useState('')
  const [ncryptsecPassword, setNcryptsecPassword] = useState('')
  const [isNcryptsec, setIsNcryptsec] = useState(false)

  useEffect(() => {
    setShowModal(isOpen)
  }, [isOpen])

  const closeModal = () => {
    setShowModal(false)
    setPrvKey('')
    setNcryptsecPassword('')
    setIsNcryptsec(false)
    onClose()
  }

  const handlePrvKeyChange = (e) => {
    const value = e.target.value
    setPrvKey(value)
    setIsNcryptsec(/^ncryptsec/.test(value))
  }

  const importAccount = async (e) => {
    e.preventDefault()

    const storage = await browser.storage.local.get(['vault'])
    const vault = storage.vault
    const password = await getSessionPassword()

    if (!password) {
      alert('Session expired. Please unlock your vault again.')
      return
    }

    if (/^ncryptsec/.test(prvKey)) {
      try {
        if (!ncryptsecPassword) {
          alert('Please enter the decryption password')
          return false
        }
        const prvKeyBytes = await nip49.decrypt(prvKey, ncryptsecPassword)
        const prvKeyHex = bytesToHex(prvKeyBytes)

        const prvKeyExist = vault.importedAccounts.find(obj => obj['prvKey'] === prvKeyHex)
        const prvKeyExistInDerived = vault.accounts.find(obj => obj['prvKey'] === prvKeyHex)
        if (prvKeyExist || prvKeyExistInDerived) {
          alert('Please provide a not existing private key')
          setPrvKey('')
          setNcryptsecPassword('')
          setIsNcryptsec(false)
          return false
        }

        vault.importedAccounts.push({ prvKey: prvKeyHex })
        vault.accountDefault = prvKeyHex
        const encryptedVault = encrypt(vault, password)
        await browser.storage.local.set({
          vault,
          encryptedVault,
        })
        await updateAccounts()

        callBack()
        navigate('/vault')
      } catch (err) {
        console.log(err)
        alert('Invalid ncryptsec or wrong password')
        setNcryptsecPassword('')
      }
    } else if (/^nsec/.test(prvKey)) {
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
          vault.accountDefault = prvKeyHex
          const encryptedVault = encrypt(vault, password)
          await browser.storage.local.set({ 
            vault,
            encryptedVault,
          })
          await updateAccounts()

          callBack()

          navigate('/vault')
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
        vault.accountDefault = prvKeyHex
        const encryptedVault = encrypt(vault, password)
        await browser.storage.local.set({ 
          vault,
          encryptedVault,
        })
        await updateAccounts()

        callBack()

        navigate('/vault')
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
            placeholder="nsec, ncryptsec or hex"
            name="prvKey"
            required
            value={prvKey}
            onChange={handlePrvKeyChange}
          />
          {isNcryptsec && (
            <>
              <br />
              <input
                type="password"
                autoComplete="off"
                placeholder="Decryption password"
                value={ncryptsecPassword}
                onChange={(e) => setNcryptsecPassword(e.target.value)}
                required
              />
            </>
          )}
          <br />
          <button type="submit" className="btn">Import</button>
        </form>
      </Modal>
    </div>
  )
}

export default ImportAccountModal
