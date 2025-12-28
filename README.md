# Nostrame - Nostr Signer & Account Management Extension

A secure **Nostr signer** and key management browser extension for Chromium. Nostrame implements the [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) protocol, allowing you to sign Nostr events on any web application without exposing your private keys.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/phfdiknibomfgpefcicfckkklimoniej?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/nostrame/phfdiknibomfgpefcicfckkklimoniej)
[![License](https://img.shields.io/badge/license-Public%20Domain-blue.svg)](LICENSE)

<img src="popup-screenshot.png" alt="Nostrame - Nostr Signer Extension" width="400">

## What is Nostrame?

Nostrame is a **Nostr key manager** and **event signer** that keeps your private keys secure while letting you interact with Nostr applications. It provides a `window.nostr` object that websites can use to request signatures, following the NIP-07 standard.

### Key Features

**Nostr Signer (NIP-07)**
- Sign Nostr events without exposing private keys
- `getPublicKey()` - Share your public key with apps
- `signEvent(event)` - Sign events securely
- `nip04.encrypt/decrypt()` - Encrypted direct messages (NIP-04)
- `nip44.encrypt/decrypt()` - Modern encryption (NIP-44)

**Account Management**
- Derive multiple accounts from a single mnemonic seed phrase
- Generate random accounts with new mnemonic
- Import existing accounts (nsec, hex, ncryptsec NIP-49)
- Switch between accounts easily

**Security**
- Master password encryption for your vault
- Auto-lock after inactivity
- Session-based storage (keys cleared on browser close)
- Permission management per website
- Never exposes private keys to websites

**Backup & Recovery**
- Export encrypted vault backup
- Import backup with password
- Mnemonic seed phrase recovery

## Install

### Chrome Web Store (Recommended)

[![Install from Chrome Web Store](https://img.shields.io/badge/Install-Chrome%20Web%20Store-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/nostrame/phfdiknibomfgpefcicfckkklimoniej)

### Manual Installation

Download the latest release from [GitHub Releases](https://github.com/Anderson-Juhasc/nostrame/releases) and load it as an unpacked extension.

## Development

```bash
# Clone the repository
git clone https://github.com/Anderson-Juhasc/nostrame
cd nostrame

# Install dependencies
npm install

# Build the extension
npm run build

# Watch for changes (development)
npm run watch
```

### Load in Chrome

1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

## Supported NIPs

| NIP | Description | Status |
|-----|-------------|--------|
| [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) | Basic protocol | ✅ |
| [NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md) | Encrypted Direct Messages | ✅ |
| [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md) | Key Derivation from Mnemonic | ✅ |
| [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) | Browser Signer | ✅ |
| [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) | Versioned Encryption | ✅ |
| [NIP-49](https://github.com/nostr-protocol/nips/blob/master/49.md) | Private Key Encryption (ncryptsec) | ✅ |

## How It Works

1. **Create or Import** - Set up your vault with a mnemonic or import existing keys
2. **Connect** - Visit any Nostr app that supports NIP-07
3. **Approve** - Nostrame prompts you to approve signing requests
4. **Sign** - Events are signed locally, only the signature is shared

Your private keys **never leave** the extension.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Public Domain - Do whatever you want with this code.

## Acknowledgments

Nostrame is based on [nos2x](https://github.com/fiatjaf/nos2x) by [@fiatjaf](https://github.com/fiatjaf), the original NIP-07 browser extension for Nostr. Thank you for pioneering the browser signer concept!

## Related Projects

- [nos2x](https://github.com/fiatjaf/nos2x) - The original NIP-07 browser extension by fiatjaf
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) - Nostr JavaScript library
- [NIP-07 Specification](https://github.com/nostr-protocol/nips/blob/master/07.md) - Browser extension protocol

---

**Keywords:** Nostr, Nostr signer, NIP-07, browser extension, key management, Nostr wallet, Nostr extension, decentralized identity, event signing, Nostr account manager, Chrome extension, Chromium extension
