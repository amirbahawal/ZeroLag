/**
 * App Component
 * 
 * Main application entry point.
 * Manages engine initialization and renders the main UI.
 */

import { useClientEngine } from './hooks/useClientEngine';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

/* =============================================
   LOADING COMPONENT
   ============================================= */

function LoadingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      <div className="text-center">
        {/* Spinner */}
        <div className="flex justify-center mb-6">
          <div
            className="w-16 h-16 rounded-full animate-spin"
            style={{
              border: '4px solid var(--bg-panel-soft)',
              borderTopColor: 'var(--accent-cyan)',
            }}
          />
        </div>

        {/* Title */}
        <h1
          className="text-3xl font-bold mb-3"
          style={{ color: 'var(--text-main)' }}
        >
          ZeroLag
        </h1>

        {/* Status Text */}
        <p
          className="text-lg animate-pulse"
          style={{ color: 'var(--text-muted)' }}
        >
          Initializing...
        </p>

        {/* Sub-status */}
        <p
          className="text-sm mt-2"
          style={{ color: 'var(--text-soft)' }}
        >
          Connecting to Binance and fetching market data
        </p>
      </div>
    </div>
  );
}

/* =============================================
   ERROR COMPONENT
   ============================================= */

interface ErrorScreenProps {
  error: Error;
  onRetry: () => void;
}

function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      <div
        className="max-w-lg w-full rounded-lg p-8"
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Error Icon */}
        <div className="flex items-center justify-center mb-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-red)20' }}
          >
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="var(--accent-red)"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        </div>

        {/* Error Title */}
        <h1
          className="text-2xl font-bold text-center mb-3"
          style={{ color: 'var(--text-main)' }}
        >
          Failed to Initialize
        </h1>

        {/* Error Message */}
        <p
          className="text-center mb-2"
          style={{ color: 'var(--text-muted)' }}
        >
          Unable to connect to the data source.
        </p>

        {/* Error Details */}
        <p
          className="text-sm text-center mb-6"
          style={{ color: 'var(--text-soft)' }}
        >
          {error.message || 'An unknown error occurred'}
        </p>

        {/* Retry Button */}
        <div className="flex justify-center gap-3">
          <button
            onClick={onRetry}
            className="px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-80"
            style={{
              backgroundColor: 'var(--accent-cyan)',
              color: '#000000',
            }}
          >
            Retry Connection
          </button>

          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-panel-soft)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            Reload Page
          </button>
        </div>

        {/* Help Text */}
        <div
          className="mt-6 p-4 rounded text-sm"
          style={{
            backgroundColor: 'var(--bg-panel-soft)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <p
            className="font-semibold mb-2"
            style={{ color: 'var(--text-main)' }}
          >
            Possible Solutions:
          </p>
          <ul
            className="list-disc list-inside space-y-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <li>Check your internet connection</li>
            <li>Disable VPN or proxy if enabled</li>
            <li>Try refreshing the page</li>
            <li>Check if Binance API is accessible</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* =============================================
   MAIN APP COMPONENT
   ============================================= */

/**
 * Main App Component
 * 
 * Handles engine initialization and renders appropriate UI based on state.
 */
function App() {
  // Initialize and manage client engine
  const { isInitialized, error, retry } = useClientEngine();

  if (error) {
    return <ErrorScreen error={error} onRetry={retry} />;
  }

  if (!isInitialized) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

export default App;
