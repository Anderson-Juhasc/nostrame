import CryptoJS from 'crypto-js'

export function encrypt(data, password) {
  return CryptoJS.AES.encrypt(JSON.stringify(data), password).toString()
}

export function decrypt(ciphertext, password) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, password)
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8))
}
