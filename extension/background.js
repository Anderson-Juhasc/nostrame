import browser from 'webextension-polyfill'

// Function to handle when the extension is installed or updated
browser.runtime.onInstalled.addListener(async function() {
  //console.log("Extension installed or updated.");
  await browser.storage.local.set({ "defaultRelay": "wss://relay.damus.io" })
  // Perform any necessary setup here
});
