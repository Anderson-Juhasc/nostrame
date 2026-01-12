import browser from 'webextension-polyfill'
import React from 'react'
import { Link } from 'react-router-dom'

const Navbar = () => {
  const openOptionsButton = async () => {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage()
    } else {
      window.open(browser.runtime.getURL('options.html'))
    }
  }

  return (
    <div className="foot">
        <ul className="foot-nav">
            <li>
            <Link to="/vault">
                <i className="icon-user"></i>
                Profile
            </Link>
            </li>
            <li>
            <Link to="/generator">
                <i className="icon-loop2"></i>
                Generator
            </Link>
            </li>
            <li>
            <a href="#" onClick={(e) => { e.preventDefault(); openOptionsButton() }} title="Options">
                <i className="icon-cog"></i>
                Options
            </a>
            </li>
        </ul>
    </div>
  )
}

export default Navbar
