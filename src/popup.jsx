import React from 'react'
import browser from 'webextension-polyfill'
import { HashRouter as Router, Route, Routes } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './middlewares/AuthContext'
import PrivateRoute from './middlewares/PrivateRoute'
import ErrorBoundary from './components/ErrorBoundary'
import MainLayout from './layouts/MainLayout'
import HomePage from './pages/HomePage'
import SigninPage from './pages/SigninPage'
import SignupPage from './pages/SignupPage'
import VaultPage from './pages/VaultPage'
import NotFoundPage from './pages/NotFoundPage'
import GeneratorPage from './pages/GeneratorPage'

// Connect to background to pause lock timer while popup is open
browser.runtime.connect({ name: 'ui-active' })

const App = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<HomePage />} />
          </Route>
          <Route path="/" element={<MainLayout />}>
            <Route path="signin" element={<SigninPage />} />
            <Route path="signup" element={<SignupPage />} />
            <Route path="vault" element={<PrivateRoute Component={VaultPage} />} />
            <Route path="generator" element={<PrivateRoute Component={GeneratorPage} />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  )
}

const container = document.getElementById('main')
const root = createRoot(container)
root.render(<App />)
