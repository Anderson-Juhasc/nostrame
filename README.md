# Nostrame(Nostr Account Management Extension)

Nostrame, a powerful Chromium extension that acts as a secure vault for managing your accounts. 

With Nostrame, you can:

- Derive accounts from a mnemonic seed
- Generate random mnemonic accounts
- NIP-07 - window.nostr capability for web browsers
- Import external accounts
- Set basic metadata on Nostr
- Enjoy encryption secured by a master password
- Lock and unlock the vault with ease
- Easily import and export backups

<img src="popup-screenshot.png" alt="Nostrame Popup">

This extension is Chromium-only.

## Install

- [Chrome Extension](https://chromewebstore.google.com/detail/nostrame/phfdiknibomfgpefcicfckkklimoniej)

## Develop

To run the plugin from this code:

```
git clone https://github.com/Anderson-Juhasc/nostrame
cd nostrame
npm i
npm run build
```

then

1. go to `chrome://extensions`;
2. ensure "developer mode" is enabled on the top right;
3. click on "Load unpackaged";
4. select the `extension/` folder of this repository.

---

LICENSE: public domain.
