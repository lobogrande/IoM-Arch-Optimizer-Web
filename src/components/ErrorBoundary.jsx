import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("🚨 Caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-st-bg text-st-text p-8 flex flex-col items-center justify-center">
          <div className="max-w-2xl w-full bg-red-50 border border-red-200 rounded-lg p-6 shadow-lg">
            <h1 className="text-3xl font-bold text-red-600 mb-4">🚨 Critical Application Crash</h1>
            <p className="text-st-text mb-4">
              The application encountered a fatal error. This usually occurs if the background Pyodide (Python WebAssembly) worker runs out of browser memory.
            </p>
            
            <div className="bg-st-bg border border-st-border p-4 rounded overflow-auto h-48 mb-6 font-mono text-sm text-red-800">
              {this.state.error && this.state.error.toString()}
              <br />
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => window.location.reload()} 
                className="flex-1 py-2 bg-st-orange text-white font-bold rounded shadow hover:opacity-90 transition"
              >
                🔄 Refresh Page
              </button>
              <button 
                onClick={() => {
                  localStorage.removeItem('iom-optimizer-storage');
                  window.location.reload();
                }} 
                className="flex-1 py-2 bg-red-600 text-white font-bold rounded shadow hover:bg-red-700 transition"
              >
                🗑️ Hard Reset (Wipe Data)
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
