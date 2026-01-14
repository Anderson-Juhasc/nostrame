import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import * as nip19 from 'nostr-tools/nip19'

import {
  PERMISSION_NAMES,
  getSessionVault
} from './common'
import {getPublicKey} from 'nostr-tools/pure'

function shortenPubkey(pubkey) {
  if (!pubkey) return ''
  const npub = nip19.npubEncode(pubkey)
  return npub.slice(0, 12) + '...' + npub.slice(-8)
}

function Prompt() {
  let qs = new URLSearchParams(location.search)
  let id = qs.get('id')
  let host = qs.get('host')
  let type = qs.get('type')
  let pubkey = qs.get('pubkey')
  let unlockOnly = qs.get('unlockOnly') === 'true'
  let params, event
  try {
    params = JSON.parse(qs.get('params'))
    if (Object.keys(params).length === 0) params = null
    else if (params.event) event = params.event
  } catch (err) {
    params = null
  }

  const [isLocked, setIsLocked] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [currentPubkey, setCurrentPubkey] = useState(pubkey)

  useEffect(() => {
    checkLockState()
  }, [])

  async function checkLockState() {
    // Check if vault exists first
    const { encryptedVault } = await browser.storage.local.get(['encryptedVault'])
    if (!encryptedVault) {
      // No vault exists, reject the request
      browser.runtime.sendMessage({
        prompt: true,
        id,
        host,
        type,
        accept: false,
        conditions: null
      })
      return
    }

    // Check if vault is unlocked (key is in background memory)
    const { unlocked } = await browser.runtime.sendMessage({ type: 'GET_LOCK_STATUS' })
    setIsLocked(!unlocked)
    setIsLoading(false)

    // If already unlocked, fetch the current pubkey
    if (unlocked) {
      await fetchCurrentPubkey()
    }
  }

  async function fetchCurrentPubkey() {
    try {
      const vault = await getSessionVault()
      if (vault?.accountDefault) {
        const pk = getPublicKey(vault.accountDefault)
        setCurrentPubkey(pk)
      }
    } catch (err) {
      // Ignore errors - pubkey display is optional
    }
  }

  async function unlockVault(e) {
    e.preventDefault()
    setError('')

    // Send unlock request to background (key stays in background memory)
    const response = await browser.runtime.sendMessage({
      type: 'UNLOCK_VAULT',
      password: password
    })

    // Clear password from UI memory immediately
    setPassword('')

    if (!response.success) {
      setError(response.error || 'Invalid password')
      return
    }

    // Get the pubkey from the unlocked vault (now in session storage)
    await fetchCurrentPubkey()

    // If permission was already granted, auto-approve after unlock
    if (unlockOnly) {
      browser.runtime.sendMessage({
        prompt: true,
        id,
        host,
        type,
        accept: true,
        conditions: null  // Don't update permission, it's already set
      })
      return
    }

    setIsLocked(false)
  }

  if (isLoading) {
    return (
      <div className="prompt">
        <div className="prompt__header">
          <div className="prompt__icon">
            <i className="icon-key"></i>
          </div>
          <h1 className="prompt__title">Loading...</h1>
        </div>
      </div>
    )
  }

  if (isLocked) {
    return (
      <div className="prompt">
        <div className="prompt__header">
          <div className="prompt__icon">
            <i className="icon-lock"></i>
          </div>
          <h1 className="prompt__title">Vault Locked</h1>
        </div>

        <div className="prompt__request">
          <div className="prompt__host">{host}</div>
          <p className="prompt__message">
            is requesting permission to <strong>{PERMISSION_NAMES[type]}</strong>
          </p>
        </div>

        <form onSubmit={unlockVault} className="prompt__unlock-form">
          <p className="prompt__unlock-message">Enter your password to unlock and continue:</p>
          <input
            type="password"
            autoComplete="off"
            placeholder="Password"
            name="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="prompt__unlock-input"
          />
          {error && <div className="prompt__unlock-error">{error}</div>}
          <button type="submit" className="prompt__btn prompt__btn--primary">
            <i className="icon-unlocked"></i>
            Unlock
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="prompt">
      {/* Header with icon */}
      <div className="prompt__header">
        <div className="prompt__icon">
          <i className="icon-key"></i>
        </div>
        <h1 className="prompt__title">Permission Request</h1>
      </div>

      {/* Active account indicator */}
      {currentPubkey && (
        <div className="prompt__account">
          <span className="prompt__account-label">Signing as</span>
          <span className="prompt__account-key">{shortenPubkey(currentPubkey)}</span>
        </div>
      )}

      {/* Request details */}
      <div className="prompt__request">
        <div className="prompt__host">{host}</div>
        <p className="prompt__message">
          is requesting permission to <strong>{PERMISSION_NAMES[type]}</strong>
        </p>
      </div>

      {/* Event/params preview */}
      {params && (
        <div className="prompt__params">
          <div className="prompt__params-label">Event data:</div>
          <pre className="prompt__params-code">
            <code>{JSON.stringify(event || params, null, 2)}</code>
          </pre>
        </div>
      )}

      {/* Action buttons */}
      <div className="prompt__actions">
        <div className="prompt__actions-group prompt__actions-group--approve">
          <button
            className="prompt__btn prompt__btn--primary"
            onClick={authorizeHandler(true, {remember: 'forever'})}
          >
            <i className="icon-unlocked"></i>
            Authorize Forever
          </button>
          {event?.kind !== undefined && (
            <button
              className="prompt__btn prompt__btn--secondary"
              onClick={authorizeHandler(true, {remember: 'kind', kinds: {[event.kind]: true}})}
            >
              Authorize Kind {event.kind}
            </button>
          )}
          <button
            className="prompt__btn prompt__btn--ghost"
            onClick={authorizeHandler(true, null)}
          >
            Just Once
          </button>
        </div>

        <div className="prompt__actions-divider"></div>

        <div className="prompt__actions-group prompt__actions-group--reject">
          {event?.kind !== undefined ? (
            <button
              className="prompt__btn prompt__btn--danger"
              onClick={authorizeHandler(false, {remember: 'kind', kinds: {[event.kind]: true}})}
            >
              <i className="icon-lock"></i>
              Reject Kind {event.kind}
            </button>
          ) : (
            <button
              className="prompt__btn prompt__btn--danger"
              onClick={authorizeHandler(false, {remember: 'forever'})}
            >
              <i className="icon-lock"></i>
              Reject Forever
            </button>
          )}
          <button
            className="prompt__btn prompt__btn--ghost-danger"
            onClick={authorizeHandler(false, null)}
          >
            Reject Once
          </button>
        </div>
      </div>
    </div>
  )

  function authorizeHandler(accept, conditions) {
    return function (ev) {
      ev.preventDefault()
      browser.runtime.sendMessage({
        prompt: true,
        id,
        host,
        type,
        accept,
        conditions
      })
    }
  }
}

const container = document.getElementById('main')
const root = createRoot(container)
root.render(<Prompt />)
