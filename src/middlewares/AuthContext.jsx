import browser from 'webextension-polyfill'
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    fetchData()
  }, []);

  const fetchData = async () => {
    const storage = await browser.storage.local.get('isAuthenticated')

    setIsAuthenticated(storage.isAuthenticated === true);
  }

  const login = async () => {
    setIsAuthenticated(true)
  };

  const logout = () => {
    // Perform logout logic
    setIsAuthenticated(false);
    localStorage.removeItem('isAuthenticated');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
