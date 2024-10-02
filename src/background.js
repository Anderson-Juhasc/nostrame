import browser from 'webextension-polyfill'

// Function to handle when the extension is installed or updated
browser.runtime.onInstalled.addListener(async function() {
  await browser.storage.local.set({ 
    "relays": [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://nostr.bitcoiner.social",
      "wss://offchain.pub",
    ] 
  })
})
