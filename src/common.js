/**
 * Common Utilities for Nostrame Extension
 *
 * This module contains non-cryptographic utilities shared across components.
 * All cryptographic operations are in crypto.js and should only be used
 * in the background service worker.
 */

import browser from 'webextension-polyfill'
import { SimplePool } from 'nostr-tools/pool'

// ============================================================================
// NOSTR POOL
// ============================================================================

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
// VAULT ACCESS VIA MESSAGES
// ============================================================================
//
// SECURITY ARCHITECTURE:
// - Decrypted vault is stored ONLY in background service worker memory
// - UI components access vault data via message passing
// - Session storage MUST NOT contain decrypted secrets
//
// These functions provide the same API as the old session storage functions
// but route through the background service worker instead.
// ============================================================================

/**
 * Get vault from background memory (replaces old getSessionVault)
 * SECURITY: Vault is in background memory only, NOT in session storage
 *
 * @returns {Promise<object|null>}
 */
export async function getSessionVault() {
  return browser.runtime.sendMessage({ type: 'GET_SESSION_VAULT' })
}

/**
 * Update vault in background memory and persist encrypted (replaces old setSessionVault)
 * SECURITY: Vault is stored in background memory only, NOT in session storage
 *
 * @param {object} vault - Vault data to save
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setSessionVault(vault) {
  return browser.runtime.sendMessage({ type: 'SET_SESSION_VAULT', vault })
}

/**
 * Clear vault from background memory (lock the vault)
 * @deprecated Use LOCK_VAULT message directly
 */
export async function clearSessionVault() {
  return browser.runtime.sendMessage({ type: 'LOCK_VAULT' })
}

// ============================================================================
// PERMISSIONS
// ============================================================================

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
  // Must have 'remember' field to be a valid stored permission
  // This prevents old empty objects {} from auto-authorizing
  if (!conditions?.remember) {
    return false
  }

  // Check for kind-specific permissions
  if (conditions.kinds) {
    if (event?.kind !== undefined && event.kind in conditions.kinds) {
      return true
    }
    return false
  }

  // 'forever' means match all
  return conditions.remember === 'forever'
}

export async function getPermissionStatus(host, type, event) {
  let {policies} = await browser.storage.local.get('policies')

  let answers = [true, false]
  for (let i = 0; i < answers.length; i++) {
    let accept = answers[i]
    let policy = policies?.[host]?.[accept]?.[type]

    if (policy?.conditions) {
      const conditions = policy.conditions

      // Must have 'remember' field to be a valid stored permission
      if (!conditions.remember) {
        continue
      }

      if (type === 'signEvent') {
        if (matchConditions(conditions, event)) {
          return accept
        }
        continue
      } else {
        // For non-signEvent types, 'forever' or 'kind' both mean auto-authorize
        if (conditions.remember === 'forever' || conditions.remember === 'kind') {
          return accept
        }
      }
    }
  }

  return undefined
}

export async function updatePermission(host, type, accept, conditions) {
  // Only store if conditions has a 'remember' field
  if (!conditions?.remember) {
    return
  }

  let {policies = {}} = await browser.storage.local.get('policies')

  // Merge kind-specific permissions if both have kinds
  if (conditions.remember === 'kind' && conditions.kinds) {
    let existingConditions = policies[host]?.[accept]?.[type]?.conditions
    if (existingConditions?.kinds) {
      Object.keys(existingConditions.kinds).forEach(kind => {
        conditions.kinds[kind] = true
      })
    }
  }

  // If 'forever' permission, remove any kind-specific permission for opposite action
  if (conditions.remember === 'forever') {
    let other = !accept
    if (policies?.[host]?.[other]?.[type]) {
      delete policies[host][other][type]
    }
  }

  // insert our new policy
  policies[host] = policies[host] || {}
  policies[host][accept] = policies[host][accept] || {}
  policies[host][accept][type] = {
    conditions,
    created_at: Math.round(Date.now() / 1000)
  }

  browser.storage.local.set({policies})
}

export async function removePermissions(host, accept, type) {
  let {policies = {}} = await browser.storage.local.get('policies')
  delete policies[host]?.[accept]?.[type]
  browser.storage.local.set({policies})
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

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

// ============================================================================
// WINDOW POSITIONING
// ============================================================================

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
