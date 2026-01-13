import React, { useState, useEffect } from 'react';

const Modal = ({ isOpen, onClose, children }) => {
  const [isActive, setIsActive] = useState(isOpen);

  useEffect(() => {
    setIsActive(isOpen)
  }, [isOpen])

  const closeModal = () => {
    setIsActive(false);
    onClose();
  };

  return (
    <>
      {isActive && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <button className="close" onClick={closeModal}>&times;</button>
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Modal;

