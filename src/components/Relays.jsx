import React, { useState } from 'react'
import { toast } from 'react-toastify'
import { useStorage } from '../hooks/useStorage'
import Loading from './Loading'

const Relays = () => {
  const [relay, setRelay] = useState('')
  const [relays, setRelays, loading] = useStorage('relays', [])

  const addNewRelay = async (e) => {
    e.preventDefault()

    if (!relays) return

    const normalizedRelay = relay.trim().toLowerCase()
    const relayExist = relays.find(item => item.toLowerCase() === normalizedRelay)
    if (relayExist) {
      toast.error('Relay already exists')
      setRelay('')
      return
    }

    await setRelays([...relays, relay.trim()])
    setRelay('')
    toast.success('Relay added')
  }

  const removeRelay = async (index) => {
    const newRelays = [...relays]
    newRelays.splice(index, 1)
    await setRelays(newRelays)
    toast.success('Relay removed')
  }

  if (loading) {
    return <Loading size="small" />
  }

  return (
    <div className="options-card">
      <div className="options-card__header">
        <div className="options-card__icon">
          <i className="icon-sphere"></i>
        </div>
        <div className="options-card__title">
          <h3>Default Relays</h3>
          <p>Manage fallback relays for when user relay lists are unavailable</p>
        </div>
      </div>
      <div className="options-card__content">
        <form onSubmit={addNewRelay} className="relay-form">
          <div className="relay-form__input-group">
            <input
              type="text"
              name="relay"
              value={relay}
              placeholder="wss://relay.example.com"
              required
              pattern="^wss:\/\/([a-zA-Z0-9\-\.]+)(:[0-9]+)?(\/[a-zA-Z0-9\-\.\/\?\:@&=%\+\/~#]*)?$"
              onChange={(e) => setRelay(e.target.value)}
            />
            <button type="submit" className="relay-form__btn">
              <i className="icon-plus"></i>
              Add
            </button>
          </div>
        </form>

        <div className="relay-list">
          {relays?.length === 0 ? (
            <div className="relay-list__empty">
              <i className="icon-sphere"></i>
              <p>No relays configured</p>
            </div>
          ) : (
            relays?.map((relayUrl, index) => (
              <div key={index} className="relay-list__item">
                <div className="relay-list__info">
                  <i className="icon-sphere"></i>
                  <span className="relay-list__url">{relayUrl}</span>
                </div>
                <button
                  type="button"
                  className="relay-list__remove"
                  onClick={() => removeRelay(index)}
                  title="Remove relay"
                >
                  <i className="icon-bin"></i>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Relays
