import browser from 'webextension-polyfill'
import React from 'react'
import { createRoot } from 'react-dom/client'
import * as nip19 from 'nostr-tools/nip19'

import {PERMISSION_NAMES} from './common'

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
  let params, event
  try {
    params = JSON.parse(qs.get('params'))
    if (Object.keys(params).length === 0) params = null
    else if (params.event) event = params.event
  } catch (err) {
    params = null
  }

  return (
    <>
      {/* Active account indicator */}
      {pubkey && (
        <div style={{
          background: '#1a1a2e',
          border: '2px solid #4a9eff',
          borderRadius: '8px',
          padding: '8px 12px',
          marginBottom: '12px',
          textAlign: 'center'
        }}>
          <div style={{fontSize: '11px', color: '#888', marginBottom: '4px'}}>
            SIGNING AS
          </div>
          <div style={{
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#4a9eff',
            fontWeight: 'bold'
          }}>
            {shortenPubkey(pubkey)}
          </div>
        </div>
      )}
      <div>
        <b style={{display: 'block', textAlign: 'center', fontSize: '200%'}}>
          {host}
        </b>{' '}
        <p>
          is requesting your permission to <b>{PERMISSION_NAMES[type]}:</b>
        </p>
      </div>
      {params && (
        <>
          <p>now acting on</p>
          <pre style={{overflow: 'auto', maxHeight: '120px'}}>
            <code>{JSON.stringify(event || params, null, 2)}</code>
          </pre>
        </>
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-around'
        }}
      >
        <button
          style={{marginTop: '5px'}}
          onClick={authorizeHandler(
            true,
            {remember: 'forever'} // store this and answer true forever
          )}
        >
          authorize forever
        </button>
        {event?.kind !== undefined && (
          <button
            style={{marginTop: '5px'}}
            onClick={authorizeHandler(
              true,
              {remember: 'kind', kinds: {[event.kind]: true}} // store for specific kind
            )}
          >
            authorize kind {event.kind} forever
          </button>
        )}
        <button style={{marginTop: '5px'}} onClick={authorizeHandler(true, null)}>
          authorize just this
        </button>
        {event?.kind !== undefined ? (
          <button
            style={{marginTop: '5px'}}
            onClick={authorizeHandler(
              false,
              {remember: 'kind', kinds: {[event.kind]: true}} // reject specific kind
            )}
          >
            reject kind {event.kind} forever
          </button>
        ) : (
          <button
            style={{marginTop: '5px'}}
            onClick={authorizeHandler(
              false,
              {remember: 'forever'} // reject forever
            )}
          >
            reject forever
          </button>
        )}
        <button style={{marginTop: '5px'}} onClick={authorizeHandler(false, null)}>
          reject
        </button>
      </div>
    </>
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
