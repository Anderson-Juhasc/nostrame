import Identicon from "identicon.js"

export default async function getIdenticon(pubkey) {
  if (pubkey.length < 15) return ""

  const svg = new Identicon(pubkey, { format: "svg" }).toString()
  return svg
}
