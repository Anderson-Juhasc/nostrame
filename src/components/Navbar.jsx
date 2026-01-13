import browser from 'webextension-polyfill'
import React from 'react'
import { NavLink } from 'react-router-dom'

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
            <NavLink to="/vault" className={({ isActive }) => isActive ? 'active' : ''}>
                <i className="icon-user"></i>
                Profile
            </NavLink>
            </li>
            <li>
            <NavLink to="/generator" className={({ isActive }) => isActive ? 'active' : ''}>
                <i className="icon-loop2"></i>
                Generator
            </NavLink>
            </li>
            <li>
            <NavLink to="/relays" className={({ isActive }) => isActive ? 'active' : ''}>
                <i className="icon-sphere"></i>
                Relays
            </NavLink>
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
