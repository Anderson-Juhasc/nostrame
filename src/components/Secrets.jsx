import React, { useState } from 'react'
import SecretsModal from '../modals/SecretsModal'

const Secrets = () => {
  const [showSecretsModal, setShowSecretsModal] = useState(false)

  return (
    <>
      <h2>Secrets</h2>
      <button onClick={() => setShowSecretsModal(true)}>Show secrets</button>

      <SecretsModal 
        isOpen={showSecretsModal}
        onClose={() => setShowSecretsModal(false)}
      ></SecretsModal>
    </>
  )
}
export default Secrets
