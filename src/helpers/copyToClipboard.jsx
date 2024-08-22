import { toast } from 'react-toastify'

export default function copyToClipboard(e, text) {
    e.preventDefault()
    navigator.clipboard.writeText(text)
    toast.success("Copied with success")
}