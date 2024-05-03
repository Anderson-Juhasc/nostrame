import browser from 'webextension-polyfill'
import React, { useState, useEffect } from 'react'
import QRCode from "react-qr-code"
import Modal from './Modal'

const QRCodeModal = ({ isOpen, onClose, keyValue }) => {
  const [showModal, setShowModal] = useState(isOpen)

  useEffect(() => {
    setShowModal(isOpen)
  }, [isOpen])

  const closeModal = () => {
    setShowModal(false)
    onClose()
  }

  return (
    <div>
      <Modal isOpen={showModal} onClose={onClose}>
        <div style={{ height: "auto", margin: "0 auto", maxWidth: 200, width: "100%" }}>
          <QRCode
            size={256}
            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
            value={keyValue}
            viewBox={`0 0 256 256`}
          />
          <p className="break-string">{keyValue}</p>
      </div>
      </Modal>
    </div>
  )
}

export default QRCodeModal
