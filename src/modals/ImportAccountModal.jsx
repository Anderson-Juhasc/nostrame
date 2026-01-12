import browser from 'webextension-polyfill'
import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify'
import * as nip19 from 'nostr-tools/nip19'
import * as nip49 from 'nostr-tools/nip49'
import { privateKeyFromSeedWords, validateWords } from 'nostr-tools/nip06'
import { bytesToHex, hexToBytes } from 'nostr-tools/utils'
import { encrypt, getSessionPassword, getSessionVault, setSessionVault } from '../common'
import Modal from './Modal'
import MainContext from '../contexts/MainContext'

const ImportAccountModal = ({ isOpen, onClose, callBack }) => {
  const { updateAccounts } = useContext(MainContext)

  const navigate = useNavigate()

  const [showModal, setShowModal] = useState(isOpen)
  const [prvKey, setPrvKey] = useState('')
  const [ncryptsecPassword, setNcryptsecPassword] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [isNcryptsec, setIsNcryptsec] = useState(false)
  const [isMnemonic, setIsMnemonic] = useState(false)

  useEffect(() => {
    setShowModal(isOpen)
  }, [isOpen])

  const closeModal = () => {
    setShowModal(false)
    setPrvKey('')
    setNcryptsecPassword('')
    setPassphrase('')
    setIsNcryptsec(false)
    setIsMnemonic(false)
    onClose()
  }

  const handlePrvKeyChange = (e) => {
    const value = e.target.value
    setPrvKey(value)
    setIsNcryptsec(/^ncryptsec/.test(value))
    setIsMnemonic(validateWords(value))
  }

  const importAccount = async (e) => {
    e.preventDefault()

    const vault = await getSessionVault()
    const password = await getSessionPassword()

    if (!password || !vault) {
      toast.error('Session expired. Please unlock your vault again.')
      return
    }

    if (/^ncryptsec/.test(prvKey)) {
      try {
        if (!ncryptsecPassword) {
          toast.error('Please enter the decryption password')
          return false
        }
        const prvKeyBytes = await nip49.decrypt(prvKey, ncryptsecPassword)
        const prvKeyHex = bytesToHex(prvKeyBytes)

        const prvKeyExist = vault.importedAccounts.find(obj => obj['prvKey'] === prvKeyHex)
        const prvKeyExistInDerived = vault.accounts.find(obj => obj['prvKey'] === prvKeyHex)
        if (prvKeyExist || prvKeyExistInDerived) {
          toast.error('This private key already exists')
          setPrvKey('')
          setNcryptsecPassword('')
          setIsNcryptsec(false)
          return false
        }

        vault.importedAccounts.push({ prvKey: prvKeyHex })
        vault.accountDefault = prvKeyHex
        const encryptedVault = encrypt(vault, password)
        await browser.storage.local.set({ encryptedVault })
        await setSessionVault(vault)
        await updateAccounts()

        toast.success('Account imported successfully')
        callBack()
        navigate('/vault')
      } catch (err) {
        toast.error('Invalid ncryptsec or wrong password')
        setNcryptsecPassword('')
      }
    } else if (/^nsec/.test(prvKey)) {
      try {
        let {type, data} = nip19.decode(prvKey)

        if (type === 'nsec') {
          const prvKeyHex = bytesToHex(data)
          const prvKeyExist = vault.importedAccounts.find(obj => obj['prvKey'] === prvKeyHex)
          const prvKeyExistInDerived = vault.accounts.find(obj => obj['prvKey'] === prvKeyHex)
          if (prvKeyExist || prvKeyExistInDerived) {
            toast.error('This private key already exists')
            setPrvKey('')
            return false
          }
          vault.importedAccounts.push({ prvKey: prvKeyHex })
          vault.accountDefault = prvKeyHex
          const encryptedVault = encrypt(vault, password)
          await browser.storage.local.set({ encryptedVault })
          await setSessionVault(vault)
          await updateAccounts()

          toast.success('Account imported successfully')
          callBack()

          navigate('/vault')
        }
      } catch (e) {
        toast.error('Invalid private key format')
        setPrvKey('')
      }
    } else if (validateWords(prvKey)) {
      try {
        const prvKeyBytes = privateKeyFromSeedWords(prvKey.trim(), passphrase)
        const prvKeyHex = bytesToHex(prvKeyBytes)

        const prvKeyExist = vault.importedAccounts.find(obj => obj['prvKey'] === prvKeyHex)
        const prvKeyExistInDerived = vault.accounts.find(obj => obj['prvKey'] === prvKeyHex)
        if (prvKeyExist || prvKeyExistInDerived) {
          toast.error('This private key already exists')
          setPrvKey('')
          setPassphrase('')
          setIsMnemonic(false)
          return false
        }

        vault.importedAccounts.push({ prvKey: prvKeyHex })
        vault.accountDefault = prvKeyHex
        const encryptedVault = encrypt(vault, password)
        await browser.storage.local.set({ encryptedVault })
        await setSessionVault(vault)
        await updateAccounts()

        toast.success('Account imported successfully')
        callBack()

        navigate('/vault')
      } catch (e) {
        toast.error('Invalid mnemonic phrase')
        setPrvKey('')
        setPassphrase('')
        setIsMnemonic(false)
      }
    } else if (/^[0-9a-fA-F]+$/.test(prvKey)) {
      try {
        let prvKeyBytes = hexToBytes(prvKey)
        let prvKeyHex = bytesToHex(prvKeyBytes)

        const prvKeyExist = vault.importedAccounts.find(obj => obj['prvKey'] === prvKeyHex)
        const prvKeyExistInDerived = vault.accounts.find(obj => obj['prvKey'] === prvKeyHex)
        if (prvKeyExist || prvKeyExistInDerived) {
          toast.error('This private key already exists')
          setPrvKey('')
          return false
        }

        vault.importedAccounts.push({ prvKey: prvKeyHex })
        vault.accountDefault = prvKeyHex
        const encryptedVault = encrypt(vault, password)
        await browser.storage.local.set({ encryptedVault })
        await setSessionVault(vault)
        await updateAccounts()

        toast.success('Account imported successfully')
        callBack()

        navigate('/vault')
      } catch (e) {
        toast.error('Invalid private key format')
        setPrvKey('')
      }
    } else {
      toast.error('Invalid format. Use nsec, ncryptsec, hex, or mnemonic phrase.')
    }

    setPrvKey('')
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={onClose}>
        <form onSubmit={importAccount}>
          <label>Import account</label>
          <br />
          <textarea
            rows="2"
            autoComplete="off"
            placeholder="nsec, ncryptsec, hex, or mnemonic phrase"
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
          {isMnemonic && (
            <>
              <br />
              <input
                type="password"
                autoComplete="off"
                placeholder="Passphrase (optional)"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
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
