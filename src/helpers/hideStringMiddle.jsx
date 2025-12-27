export default function hideStringMiddle(inputString, startChars = 10, endChars = 8) {
  if (!inputString) {
    return ''
  }
  if (inputString.length <= startChars + endChars) {
    return inputString
  }

  const hiddenPart = '...'
  return inputString.slice(0, startChars) + hiddenPart + inputString.slice(-endChars)
}
