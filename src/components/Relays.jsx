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

    const relayExist = relays.find(item => item === relay)
    if (relayExist) {
      toast.error('Relay already exists')
      setRelay('')
      return
    }

    await setRelays([...relays, relay])
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
        {relays?.map((relay, index) => (
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
