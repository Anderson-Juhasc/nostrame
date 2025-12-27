import browser from 'webextension-polyfill'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const fetchData = useCallback(async () => {
    const storage = await browser.storage.local.get('isAuthenticated')
    setIsAuthenticated(storage.isAuthenticated === true)
  }, [])

  useEffect(() => {
    fetchData()

    const handleStorageChange = (changes) => {
      if (changes.isAuthenticated) {
        setIsAuthenticated(changes.isAuthenticated.newValue === true)
      }
    }

    browser.storage.onChanged.addListener(handleStorageChange)

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [fetchData])

  const login = async () => {
    setIsAuthenticated(true)
  }

  const logout = () => {
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext)
