import React, { useState } from 'react'
import SecretsModal from '../modals/SecretsModal'

const Secrets = () => {
  const [showSecretsModal, setShowSecretsModal] = useState(false)

  return (
    <div className="options-card">
      <div className="options-card__header">
        <div className="options-card__icon options-card__icon--warning">
          <i className="icon-key"></i>
        </div>
        <div className="options-card__title">
          <h3>View Secrets</h3>
          <p>Access your private keys and recovery phrases</p>
        </div>
      </div>
      <div className="options-card__content">
        <p className="options-card__description">
          View your mnemonic phrases and private keys. Never share these with anyone.
        </p>
        <button type="button" className="options-card__btn options-card__btn--secondary" onClick={() => setShowSecretsModal(true)}>
          <i className="icon-eye"></i>
          Show Secrets
        </button>
      </div>

      <SecretsModal
        isOpen={showSecretsModal}
        onClose={() => setShowSecretsModal(false)}
      />
    </div>
  )
}
export default Secrets
