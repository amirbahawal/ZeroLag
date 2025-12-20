import { useClientEngine } from './hooks/useClientEngine';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RateLimitBanner } from './components/RateLimitBanner';
import './index.css';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div className="text-center">
        <div className="flex justify-center mb-6">
          <div
            className="w-16 h-16 rounded-full animate-spin"
            style={{ border: '4px solid var(--bg-panel-soft)', borderTopColor: 'var(--accent-cyan)' }}
          />
        </div>
        <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-main)' }}>ZeroLag</h1>
        <p className="text-lg animate-pulse" style={{ color: 'var(--text-muted)' }}>Initializing...</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-soft)' }}>Connecting to Binance and fetching market data</p>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div
        className="max-w-lg w-full rounded-lg p-8"
        style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-center mb-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-red)20' }}
          >
            <svg className="w-8 h-8" fill="none" stroke="var(--accent-red)" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center mb-3" style={{ color: 'var(--text-main)' }}>Failed to Initialize</h1>
        <p className="text-center mb-2" style={{ color: 'var(--text-muted)' }}>Unable to connect to the data source.</p>
        <p className="text-sm text-center mb-6" style={{ color: 'var(--text-soft)' }}>{error.message || 'An unknown error occurred'}</p>

        <div className="flex justify-center gap-3">
          <button
            onClick={onRetry}
            className="px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-80"
            style={{ backgroundColor: 'var(--accent-cyan)', color: '#000000' }}
          >
            Retry Connection
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-80"
            style={{ backgroundColor: 'var(--bg-panel-soft)', color: 'var(--text-main)', border: '1px solid var(--border-subtle)' }}
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { isInitialized, error, retry } = useClientEngine();
  if (error) return <ErrorScreen error={error} onRetry={retry} />;
  if (!isInitialized) return <LoadingScreen />;

  return (
    <ErrorBoundary>
      <RateLimitBanner />
      <AppShell />
    </ErrorBoundary>
  );
}

export default App;
