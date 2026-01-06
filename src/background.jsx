import browser from 'webextension-polyfill'
import {validateEvent, finalizeEvent, getPublicKey} from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import * as nip04 from 'nostr-tools/nip04'
import * as nip44 from 'nostr-tools/nip44'
import {Mutex} from 'async-mutex'
import {LRUCache} from './utils'

import {
  NO_PERMISSIONS_REQUIRED,
  getPermissionStatus,
  updatePermission,
  showNotification,
  getPosition,
  getSessionVault,
  clearSessionPassword,
  clearSessionVault,
  hasSessionPassword
} from './common'

let openPrompt = null
let promptMutex = new Mutex()
let releasePromptMutex = () => {}
let secretsCache = new LRUCache(100)
let lastUsedAccount = null

// Auto-lock timeout (default 5 minutes in milliseconds, converted to minutes for alarms API)
const DEFAULT_LOCK_TIMEOUT = 5 * 60 * 1000
const LOCK_ALARM_NAME = 'autoLockAlarm'

async function lockVault() {
  const { isAuthenticated } = await browser.storage.local.get(['isAuthenticated'])
  if (!isAuthenticated) return // Don't lock if not authenticated

  await clearSessionPassword()
  await clearSessionVault()
  await browser.storage.local.set({ isLocked: true })
  clearAllCaches()
}

async function resetLockTimer() {
  // Clear any existing alarm
  await chrome.alarms.clear(LOCK_ALARM_NAME)

  // Check if vault is unlocked before setting timer
  const { isLocked, isAuthenticated } = await browser.storage.local.get(['isLocked', 'isAuthenticated'])
  if (!isAuthenticated || isLocked) return

  // Get timeout setting (default 5 minutes)
  const { autoLockTimeout = DEFAULT_LOCK_TIMEOUT } = await browser.storage.local.get(['autoLockTimeout'])
  if (autoLockTimeout <= 0) return // Disabled if 0 or negative

  // Convert milliseconds to minutes for alarms API (minimum 0.5 minutes = 30 seconds in dev mode)
  const delayInMinutes = Math.max(autoLockTimeout / 60000, 0.5)
  await chrome.alarms.create(LOCK_ALARM_NAME, { delayInMinutes })
}

// Listen for alarm to trigger lock
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOCK_ALARM_NAME) {
    lockVault()
  }
})

function clearAllCaches() {
  secretsCache.clear()
  lastUsedAccount = null
}

function getSharedSecret(sk, peer) {
  // Clear cache if account changed
  if (lastUsedAccount !== sk) {
    secretsCache.clear()
    lastUsedAccount = sk
  }

  let key = secretsCache.get(peer)

  if (!key) {
    key = nip44.v2.utils.getConversationKey(sk, peer)
    secretsCache.set(peer, key)
  }

  return key
}

// Always get fresh account from session storage - NEVER cache
async function getCurrentAccount() {
  const vault = await getSessionVault()
  if (!vault || !vault.accountDefault) {
    return null
  }
  return vault.accountDefault
}

const width = 340
const height = 360

browser.runtime.onInstalled.addListener(async (_, __, reason) => {
  if (reason === 'install') browser.runtime.openOptionsPage()

  // Set default relays and auto-lock timeout
  await browser.storage.local.set({
    "relays": [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://nostr.bitcoiner.social",
      "wss://offchain.pub",
    ],
    "autoLockTimeout": DEFAULT_LOCK_TIMEOUT
  })

  // Cleanup: remove unencrypted vault from local storage (security fix)
  await browser.storage.local.remove(['vault'])
})

// Start lock timer on extension startup
resetLockTimer()

browser.runtime.onMessage.addListener(async (message, sender) => {
  // Reset lock timer on any message (user activity)
  resetLockTimer()

  if (message.openSignUp) {
    openSignUpWindow()
    browser.windows.remove(sender.tab.windowId)
  } else {
    let {prompt} = message
    if (prompt) {
      handlePromptMessage(message, sender)
    } else {
      return handleContentScriptMessage(message)
    }
  }
})

browser.runtime.onMessageExternal.addListener(
  async ({type, params}, sender) => {
    // Reset lock timer on external message (user activity)
    resetLockTimer()

    let extensionId = new URL(sender.url).host
    return handleContentScriptMessage({type, params, host: extensionId})
  }
)

browser.windows.onRemoved.addListener(_ => {
  if (openPrompt) {
    // calling this with a simple "no" response will not store anything, so it's fine
    // it will just return a failure
    handlePromptMessage({accept: false}, null)
  }
})

browser.storage.onChanged.addListener((changes, area) => {
  // Clear all caches when vault changes (account switch) or vault locks
  if (area === 'session' && changes.vault) {
    clearAllCaches()
    resetLockTimer() // Reset timer on vault activity
  }
  if (changes.isLocked?.newValue === true) {
    clearAllCaches()
    chrome.alarms.clear(LOCK_ALARM_NAME)
  }
  // Reset timer when vault is unlocked
  if (changes.isLocked?.newValue === false) {
    resetLockTimer()
  }
})

// Chrome-specific listener for session storage (polyfill may not handle it)
if (globalThis.chrome?.storage?.onChanged) {
  globalThis.chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.vault) {
      clearAllCaches()
    }
  })
}

async function handleContentScriptMessage({type, params, host}) {
  if (NO_PERMISSIONS_REQUIRED[type]) {
    // authorized, and we won't do anything with private key here, so do a separate handler
    switch (type) {
      case 'replaceURL': {
        let {protocol_handler: ph} = await browser.storage.local.get([
          'protocol_handler'
        ])
        if (!ph) return false

        let {url} = params
        let raw = url.split('nostr:')[1]
        let {type, data} = nip19.decode(raw)
        let replacements = {
          raw,
          hrp: type,
          hex:
            type === 'npub' || type === 'note'
              ? data
              : type === 'nprofile'
              ? data.pubkey
              : type === 'nevent'
              ? data.id
              : null,
          p_or_e: {npub: 'p', note: 'e', nprofile: 'p', nevent: 'e'}[type],
          u_or_n: {npub: 'u', note: 'n', nprofile: 'u', nevent: 'n'}[type],
          relay0: type === 'nprofile' ? data.relays[0] : null,
          relay1: type === 'nprofile' ? data.relays[1] : null,
          relay2: type === 'nprofile' ? data.relays[2] : null
        }
        let result = ph
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        Object.entries(replacements).forEach(([pattern, value]) => {
          result = result.replace(new RegExp(`\\{ *${escapeRegex(pattern)} *\\}`, 'g'), value)
        })

        return result
      }
    }

    return
  } else {
    // acquire mutex here before reading policies
    releasePromptMutex = await promptMutex.acquire()

    // Check if vault is locked - if so, we must show prompt for unlock
    const isVaultLocked = !(await hasSessionPassword())

    let allowed = await getPermissionStatus(
      host,
      type,
      type === 'signEvent' ? params.event : undefined
    )

    // If vault is locked, always show prompt for unlock (even if permission granted)
    const needsPrompt = isVaultLocked || allowed === undefined

    if (allowed === false) {
      // denied, just refuse immediately
      releasePromptMutex()
      showNotification(host, allowed, type, params)
      return {
        error: {message: 'denied'}
      }
    } else if (needsPrompt) {
      // vault locked OR permission not yet granted - show prompt
      try {
        const array = new Uint32Array(2)
        crypto.getRandomValues(array)
        let id = Array.from(array, x => x.toString(16)).join('')

        // Get current account to show in prompt (will be null if locked)
        const currentAccount = await getCurrentAccount()
        const currentPubkey = currentAccount ? getPublicKey(currentAccount) : null

        let qs = new URLSearchParams({
          host,
          id,
          params: JSON.stringify(params),
          type,
          pubkey: currentPubkey || '',
          // If permission already granted, just need unlock (no permission UI needed)
          unlockOnly: allowed === true ? 'true' : ''
        })
        // center prompt
        const {top, left} = await getPosition(width, height)
        // prompt will be resolved with true or false
        let accept = await new Promise((resolve, reject) => {
          openPrompt = {resolve, reject}

          browser.windows.create({
            url: `${browser.runtime.getURL('prompt.html')}?${qs.toString()}`,
            type: 'popup',
            width: width,
            height: height,
            top: top,
            left: left
          })
        })

        // denied, stop here
        if (!accept) return {error: {message: 'denied'}}
      } catch (err) {
        // errored, stop here
        releasePromptMutex()
        return {
          error: {message: err.message, stack: err.stack}
        }
      }
    } else {
      // authorized and unlocked, proceed without prompt
      releasePromptMutex()
      showNotification(host, allowed, type, params)
    }
  }

  // if we're here this means it was accepted
  let { isLocked } = await browser.storage.local.get(['isLocked'])

  if (isLocked) {
    return {error: {message: 'vault is locked, please unlock it first'} }
  }

  // ALWAYS get fresh account - never use cached value
  const activeAccount = await getCurrentAccount()

  if (!activeAccount) {
    return {error: {message: 'no private key found'} }
  }

  try {
    switch (type) {
      case 'getPublicKey': {
        return getPublicKey(activeAccount)
      }
      case 'signEvent': {
        const event = finalizeEvent(params.event, activeAccount)

        return validateEvent(event)
          ? event
          : {error: {message: 'invalid event'}}
      }
      case 'nip04.encrypt': {
        let {peer, plaintext} = params
        return nip04.encrypt(activeAccount, peer, plaintext)
      }
      case 'nip04.decrypt': {
        let {peer, ciphertext} = params
        return nip04.decrypt(activeAccount, peer, ciphertext)
      }
      case 'nip44.encrypt': {
        const {peer, plaintext} = params
        const key = getSharedSecret(activeAccount, peer)

        return nip44.v2.encrypt(plaintext, key)
      }
      case 'nip44.decrypt': {
        const {peer, ciphertext} = params
        const key = getSharedSecret(activeAccount, peer)

        return nip44.v2.decrypt(ciphertext, key)
      }
    }
  } catch (error) {
    return {error: {message: error.message, stack: error.stack}}
  }
}

async function handlePromptMessage({host, type, accept, conditions}, sender) {
  // return response
  openPrompt?.resolve?.(accept)

  // Only store permission if conditions is explicitly set (not null/undefined)
  // "authorize just this" passes null, "authorize forever" passes {remember: 'forever'}
  if (conditions !== null && conditions !== undefined && typeof conditions === 'object') {
    await updatePermission(host, type, accept, conditions)
  }

  // cleanup this
  openPrompt = null

  // release mutex here after updating policies
  releasePromptMutex()

  // close prompt
  if (sender) {
    browser.windows.remove(sender.tab.windowId)
  }
}

async function openSignUpWindow() {
  const {top, left} = await getPosition(width, height)

  browser.windows.create({
    url: `${browser.runtime.getURL('signup.html')}`,
    type: 'popup',
    width: width,
    height: height,
    top: top,
    left: left
  })
}
