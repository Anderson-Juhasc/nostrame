import browser from 'webextension-polyfill'

// Function to handle when the extension is installed or updated
browser.runtime.onInstalled.addListener(async function() {
  await browser.storage.local.set({ "relays": JSON.stringify(["wss://relay.damus.io", "wss://nos.lol"]) })
});
