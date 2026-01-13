import React, { useState, useEffect, useContext, useRef } from 'react'
import { toast } from 'react-toastify'
import { finalizeEvent } from 'nostr-tools/pure'
import Loading from '../components/Loading'
import MainContext from '../contexts/MainContext'
import { getSessionVault } from '../common'
import {
  fetchRelayList,
  createRelayListEvent,
  publishRelayList,
  normalizeRelayUrl,
  getDefaultRelayList,
  DISCOVERY_RELAYS
} from '../helpers/outbox'

const RelaysPage = () => {
  const { defaultAccount } = useContext(MainContext)

  const [relays, setRelays] = useState([])
  const [newRelay, setNewRelay] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshingRelays, setRefreshingRelays] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [usingDefaults, setUsingDefaults] = useState(false)

  // Track previous pubkey to detect account switch
  const prevPubKeyRef = useRef(null)

  useEffect(() => {
    if (defaultAccount?.pubKey) {
      const isAccountSwitch = prevPubKeyRef.current !== null &&
                              prevPubKeyRef.current !== defaultAccount.pubKey
      prevPubKeyRef.current = defaultAccount.pubKey

      // Use cache for initial load and account switches
      // Only force refresh on explicit user action
      loadRelays(defaultAccount.pubKey, false)

      // Reset changes state on account switch
      if (isAccountSwitch) {
        setHasChanges(false)
      }
    }
  }, [defaultAccount?.pubKey])

  const loadRelays = async (pubkey, forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshingRelays(true)
    } else {
      setLoading(true)
    }

    try {
      const { relays: fetchedRelays, fromCache } = await fetchRelayList(pubkey, forceRefresh)

      if (fetchedRelays.length > 0) {
        setRelays(fetchedRelays)
        setUsingDefaults(false)
        // Don't mark as having changes just because we loaded from cache
        if (!forceRefresh) {
          setHasChanges(false)
        }
      } else {
        // No relay list found, use defaults
        setRelays(getDefaultRelayList())
        setUsingDefaults(true)
        setHasChanges(true) // Mark as needing publish
      }

      if (forceRefresh && !fromCache) {
        toast.success('Relay list refreshed')
      }
    } catch (error) {
      console.error('Failed to load relays:', error)
      setRelays(getDefaultRelayList())
      setUsingDefaults(true)
      setHasChanges(true)
    }

    setLoading(false)
    setRefreshingRelays(false)
  }

  const handleRefresh = () => {
    if (defaultAccount?.pubKey) {
      loadRelays(defaultAccount.pubKey, true)
    }
  }

  const addRelay = (e) => {
    e.preventDefault()

    const url = normalizeRelayUrl(newRelay)

    if (relays.some(r => r.url === url)) {
      toast.error('Relay already exists')
      return
    }

    setRelays([...relays, { url, read: true, write: true }])
    setNewRelay('')
    setHasChanges(true)
    toast.success('Relay added')
  }

  const removeRelay = (index) => {
    const updated = [...relays]
    updated.splice(index, 1)
    setRelays(updated)
    setHasChanges(true)
    toast.success('Relay removed')
  }

  const toggleRead = (index) => {
    const updated = [...relays]
    updated[index].read = !updated[index].read
    // Ensure at least one is enabled
    if (!updated[index].read && !updated[index].write) {
      updated[index].write = true
    }
    setRelays(updated)
    setHasChanges(true)
  }

  const toggleWrite = (index) => {
    const updated = [...relays]
    updated[index].write = !updated[index].write
    // Ensure at least one is enabled
    if (!updated[index].read && !updated[index].write) {
      updated[index].read = true
    }
    setRelays(updated)
    setHasChanges(true)
  }

  const publishChanges = async () => {
    setPublishing(true)
    try {
      const vault = await getSessionVault()
      if (!vault?.accountDefault) {
        toast.error('No account found')
        return
      }

      const event = createRelayListEvent(relays)
      const signedEvent = finalizeEvent(event, vault.accountDefault)

      // Publish to current write relays + all discovery relays for visibility
      const writeRelays = relays.filter(r => r.write).map(r => r.url)
      const publishTo = [...new Set([...writeRelays, ...DISCOVERY_RELAYS])]

      await publishRelayList(signedEvent, publishTo)

      setHasChanges(false)
      setUsingDefaults(false)
      toast.success('Relay list published')
    } catch (error) {
      console.error('Failed to publish:', error)
      toast.error('Failed to publish relay list')
    }
    setPublishing(false)
  }

  if (loading) {
    return (
      <div className="Popup">
        <div className="container">
          <Loading />
        </div>
      </div>
    )
  }

  return (
    <div className="Popup">
      <div className="container" style={{ paddingBottom: '96px' }}>
        <div className="relays-page">
          <div className="relays-page__header">
            <div className="relays-page__header-top">
              <h2 className="relays-page__title">Relays</h2>
              <button
                type="button"
                className="relays-page__refresh-btn"
                onClick={handleRefresh}
                disabled={refreshingRelays}
                title="Refresh from network"
              >
                <i className={`icon-loop2 ${refreshingRelays ? 'spinning' : ''}`}></i>
              </button>
            </div>
            <p className="relays-page__subtitle">Manage your NIP-65 relay list</p>
          </div>

          {usingDefaults && (
            <div className="relays-page__warning">
              <i className="icon-warning"></i>
              <div>
                <strong>Using default relays</strong>
                <p>No relay list (kind 10002) was found for this account. Publish your relay list so other users can find your content.</p>
              </div>
            </div>
          )}

          <form className="relays-page__form" onSubmit={addRelay}>
            <input
              type="text"
              placeholder="wss://relay.example.com"
              value={newRelay}
              onChange={(e) => setNewRelay(e.target.value)}
              pattern="^wss:\/\/([a-zA-Z0-9\-\.]+)(:[0-9]+)?(\/[a-zA-Z0-9\-\.\/\?\:@&=%\+\/~#]*)?$"
              required
            />
            <button type="submit" className="relays-page__add-btn">
              <i className="icon-plus"></i>
            </button>
          </form>

          <div className="relays-page__list">
            {relays.map((relay, index) => (
              <div key={index} className="relays-page__item">
                <div className="relays-page__item-url">
                  {relay.url.replace(/\/$/, '').replace('wss://', '')}
                </div>
                <div className="relays-page__item-actions">
                  <button
                    type="button"
                    className={`relays-page__toggle ${relay.read ? 'active' : ''}`}
                    onClick={() => toggleRead(index)}
                    title="Read"
                  >
                    R
                  </button>
                  <button
                    type="button"
                    className={`relays-page__toggle ${relay.write ? 'active' : ''}`}
                    onClick={() => toggleWrite(index)}
                    title="Write"
                  >
                    W
                  </button>
                  <button
                    type="button"
                    className="relays-page__remove-btn"
                    onClick={() => removeRelay(index)}
                    title="Remove"
                  >
                    <i className="icon-cross"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {hasChanges && (
            <div className="relays-page__publish">
              <button
                type="button"
                className="relays-page__publish-btn"
                onClick={publishChanges}
                disabled={publishing}
              >
                {publishing ? (
                  <>
                    <i className="icon-spinner3 spinning"></i>
                    Publishing...
                  </>
                ) : (
                  <>
                    <i className="icon-upload"></i>
                    Publish Relay List
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RelaysPage
