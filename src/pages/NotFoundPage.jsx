import React from 'react'
import {Link} from 'react-router-dom'

const NotFoundPage = () => {
  return (
    <section>
      <h1>404 Not Found</h1>
      <p>This page does not exist</p>
      <Link to="/">Go Back</Link
      >
    </section>
  )
}

export default NotFoundPage
