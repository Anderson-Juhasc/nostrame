import CryptoJS from 'crypto-js'

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
