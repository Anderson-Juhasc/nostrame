import React, { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="Popup">
          <div className="container" style={{ textAlign: 'center', padding: '20px' }}>
            <h2>Something went wrong</h2>
            <p style={{ color: '#888', marginBottom: '16px' }}>
              An unexpected error occurred.
            </p>
            <button className="btn" onClick={this.handleReload}>
              Reload Extension
            </button>
            {this.state.error && (
              <details style={{ marginTop: '16px', textAlign: 'left' }}>
                <summary style={{ cursor: 'pointer', color: '#888' }}>
                  Error details
                </summary>
                <pre style={{
                  fontSize: '11px',
                  overflow: 'auto',
                  background: '#1a1a1a',
                  padding: '8px',
                  borderRadius: '4px',
                  marginTop: '8px'
                }}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
