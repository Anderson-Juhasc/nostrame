import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'

const Relays = () => {
  const [relay, setRelay] = useState('')
  const [relays, setRelays] = useState([])

  useEffect(() => {
    fetchData()

    browser.storage.onChanged.addListener(function() {
      fetchData()
    })
  }, [])
  
  const fetchData = async () => {
    const storage = await browser.storage.local.get(['relays'])
    setRelays(storage.relays)
  }

  const addNewRelay = async (e) => {
    e.preventDefault()

    const relayExist = relays.find(item => item === relay)
    if (relayExist) {
      alert('Please provide a not existing relay')
      setRelay('')
      return false
    }

    relays.push(relay)
    setRelays(relays)
    setRelay('')
    await browser.storage.local.set({ 
      relays: relays,
    })
  }

  const removeRelay = async (index) => {
    const newRelays = [...relays]
    if (index !== -1) {
      newRelays.splice(index, 1)
      setRelays(newRelays)
    }
    await browser.storage.local.set({ 
      relays: newRelays,
    })
  }

  return (
    <>
      <form onSubmit={addNewRelay}>
        <h2>Relays</h2>
        <input 
          type="text"
          name="relay"
          value={relay}
          required
          pattern="^wss:\/\/([a-zA-Z0-9\-\.]+)(:[0-9]+)?(\/[a-zA-Z0-9\-\.\/\?\:@&=%\+\/~#]*)?$"
          onChange={(e) => setRelay(e.target.value)}
        />
        <br />
        <button type="submit" className="btn">Add</button>
      </form>

      <ul>
        {relays.map((relay, index) => (
          <li key={index}>
            {relay}
            &nbsp;
            <button type="button" onClick={() => removeRelay(index)}>&times;</button>
          </li>
        ))}
      </ul>
    </>
  )
}
export default Relays
