import browser from 'webextension-polyfill'
import CryptoJS from 'crypto-js'
import { SimplePool } from 'nostr-tools/pool'

// Shared pool instance - reuse across all components
export const pool = new SimplePool({
  eoseSubTimeout: 3000,
  getTimeout: 3000
})

// Default relays
export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://nostr.bitcoiner.social",
  "wss://offchain.pub",
]

// ============================================================================
// SESSION PASSWORD MANAGER
// Password is stored in browser.storage.session - persists across popup
// opens/closes but clears when browser closes (more secure than local storage)
// ============================================================================

// Get the session storage API (chrome.storage.session or browser.storage.session)
function getSessionStorage() {
  // Try browser.storage.session first (Firefox/polyfill)
  if (typeof browser !== 'undefined' && browser.storage?.session) {
    return browser.storage.session
  }
  // Fall back to chrome.storage.session (Chrome native)
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    return chrome.storage.session
  }
  return null
}

export async function setSessionPassword(password) {
  const sessionStorage = getSessionStorage()
  if (sessionStorage) {
    await sessionStorage.set({ sessionPassword: password })
  }
}

export async function getSessionPassword() {
  const sessionStorage = getSessionStorage()
  if (sessionStorage) {
    const result = await sessionStorage.get('sessionPassword')
    return result.sessionPassword || null
  }
  return null
}

export async function clearSessionPassword() {
  const sessionStorage = getSessionStorage()
  if (sessionStorage) {
    await sessionStorage.remove('sessionPassword')
  }
}

export async function hasSessionPassword() {
  const password = await getSessionPassword()
  return password !== null
}

function deriveKey(password, salt) {
  const iterations = 10000
  const keyLength = 256
  return CryptoJS.PBKDF2(password, salt, { keySize: keyLength / 32, iterations: iterations })
}

export function encrypt(data, password) {
  const salt = CryptoJS.lib.WordArray.random(128 / 8)
  const derivedKey = deriveKey(password, salt)
  const iv = CryptoJS.lib.WordArray.random(128 / 8)
  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(data),
    derivedKey,
    { iv: iv }
  )

  // Convert the salt, IV, and encrypted data to a single string
  return salt.toString() + iv.toString() + encrypted.toString()
}

export function decrypt(encryptedData, password) {
  const salt = CryptoJS.enc.Hex.parse(encryptedData.substring(0, 32))
  const iv = CryptoJS.enc.Hex.parse(encryptedData.substring(32, 64))
  const encrypted = encryptedData.substring(64)
  const derivedKey = deriveKey(password, salt)
  const decrypted = CryptoJS.AES.decrypt(encrypted, derivedKey, { iv: iv })

  return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8))
}

export const NO_PERMISSIONS_REQUIRED = {
  replaceURL: true
}

export const PERMISSION_NAMES = Object.fromEntries([
  ['getPublicKey', 'read your public key'],
  ['signEvent', 'sign events using your private key'],
  ['nip04.encrypt', 'encrypt messages to peers'],
  ['nip04.decrypt', 'decrypt messages from peers'],
  ['nip44.encrypt', 'encrypt messages to peers'],
  ['nip44.decrypt', 'decrypt messages from peers']
])

function matchConditions(conditions, event) {
  if (conditions?.kinds) {
    if (event.kind in conditions.kinds) return true
    else return false
  }

  return true
}

export async function getPermissionStatus(host, type, event) {
  let {policies} = await browser.storage.local.get('policies')

  let answers = [true, false]
  for (let i = 0; i < answers.length; i++) {
    let accept = answers[i]
    let {conditions} = policies?.[host]?.[accept]?.[type] || {}

    if (conditions) {
      if (type === 'signEvent') {
        if (matchConditions(conditions, event)) {
          return accept // may be true or false
        } else {
          // if this doesn't match we just continue so it will either match for the opposite answer (reject)
          // or it will end up returning undefined at the end
          continue
        }
      } else {
        return accept // may be true or false
      }
    }
  }

  return undefined
}

export async function updatePermission(host, type, accept, conditions) {
  let {policies = {}} = await browser.storage.local.get('policies')

  // if the new conditions is "match everything", override the previous
  if (Object.keys(conditions).length === 0) {
    conditions = {}
  } else {
    // if we already had a policy for this, merge the conditions
    let existingConditions = policies[host]?.[accept]?.[type]?.conditions
    if (existingConditions) {
      if (existingConditions.kinds && conditions.kinds) {
        Object.keys(existingConditions.kinds).forEach(kind => {
          conditions.kinds[kind] = true
        })
      }
    }
  }

  // if we have a reverse policy (accept / reject) that is exactly equal to this, remove it
  let other = !accept
  let reverse = policies?.[host]?.[other]?.[type]
  if (
    reverse &&
    JSON.stringify(reverse.conditions) === JSON.stringify(conditions)
  ) {
    delete policies[host][other][type]
  }

  // insert our new policy
  policies[host] = policies[host] || {}
  policies[host][accept] = policies[host][accept] || {}
  policies[host][accept][type] = {
    conditions, // filter that must match the event (in case of signEvent)
    created_at: Math.round(Date.now() / 1000)
  }

  browser.storage.local.set({policies})
}

export async function removePermissions(host, accept, type) {
  let {policies = {}} = await browser.storage.local.get('policies')
  delete policies[host]?.[accept]?.[type]
  browser.storage.local.set({policies})
}

export async function showNotification(host, answer, type, params) {
  let {notifications} = await browser.storage.local.get('notifications')
  if (notifications) {
    let action = answer ? 'allowed' : 'denied'
    browser.notifications.create(undefined, {
      type: 'basic',
      title: `${type} ${action} for ${host}`,
      message: JSON.stringify(
        params?.event
          ? {
              kind: params.event.kind,
              content: params.event.content,
              tags: params.event.tags
            }
          : params,
        null,
        2
      ),
      iconUrl: 'icons/48x48.png'
    })
  }
}

export async function getPosition(width, height) {
  let left = 0
  let top = 0

  try {
    const lastFocused = await browser.windows.getLastFocused()

    if (
      lastFocused &&
      lastFocused.top !== undefined &&
      lastFocused.left !== undefined &&
      lastFocused.width !== undefined &&
      lastFocused.height !== undefined
    ) {
      // Position window in the center of the lastFocused window
      top = Math.round(lastFocused.top + (lastFocused.height - height) / 2)
      left = Math.round(lastFocused.left + (lastFocused.width - width) / 2)
    } else {
      console.error('Last focused window properties are undefined.')
    }
  } catch (error) {
    console.error('Error getting window position:', error)
  }

  return {
    top,
    left
  }
}
