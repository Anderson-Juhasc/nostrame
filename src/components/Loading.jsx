import React from 'react'

const Loading = ({ size = 'medium', text = '' }) => {
  const sizeClass = `loading--${size}`

  return (
    <div className={`loading ${sizeClass}`}>
      <div className="loading__spinner">
        <div className="loading__dot"></div>
        <div className="loading__dot"></div>
        <div className="loading__dot"></div>
      </div>
      {text && <div className="loading__text">{text}</div>}
    </div>
  )
}

export default Loading
