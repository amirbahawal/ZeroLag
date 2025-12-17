/**
 * ErrorBoundary Component
 * 
 * React error boundary for catching rendering errors.
 * Displays fallback UI with error details and reload option.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/* =============================================
   TYPES
   ============================================= */

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/* =============================================
   COMPONENT
   ============================================= */

/**
 * Error boundary component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 * 
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    /**
     * Update state when an error is caught
     */
    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return {
            hasError: true,
            error,
        };
    }

    /**
     * Log error details
     */
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('[ErrorBoundary] Caught an error:', error);
        console.error('[ErrorBoundary] Error info:', errorInfo);

        // Update state with error info
        this.setState({
            errorInfo,
        });

        // You could also log to an error reporting service here
        // e.g., Sentry, LogRocket, etc.
    }

    /**
     * Reload the page to recover from error
     */
    handleReload = (): void => {
        window.location.reload();
    };

    /**
     * Reset error state to try rendering again
     */
    handleReset = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div
                    className="min-h-screen flex items-center justify-center p-6"
                    style={{ backgroundColor: 'var(--bg-page)' }}
                >
                    <div
                        className="max-w-2xl w-full rounded-lg p-8"
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
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                    />
                                </svg>
                            </div>
                        </div>

                        {/* Error Title */}
                        <h1
                            className="text-2xl font-bold text-center mb-3"
                            style={{ color: 'var(--text-main)' }}
                        >
                            Something Went Wrong
                        </h1>

                        {/* Error Message */}
                        <p
                            className="text-center mb-6"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            An unexpected error occurred. Please try reloading the page.
                        </p>

                        {/* Error Details (Development Only) */}
                        {import.meta.env.DEV && this.state.error && (
                            <div
                                className="mb-6 p-4 rounded font-mono text-sm overflow-auto max-h-64"
                                style={{
                                    backgroundColor: 'var(--bg-panel-soft)',
                                    border: '1px solid var(--border-subtle)',
                                }}
                            >
                                <div
                                    className="font-bold mb-2"
                                    style={{ color: 'var(--accent-red)' }}
                                >
                                    Error Details:
                                </div>
                                <div style={{ color: 'var(--text-main)' }}>
                                    {this.state.error.toString()}
                                </div>
                                {this.state.errorInfo && (
                                    <details className="mt-4">
                                        <summary
                                            className="cursor-pointer"
                                            style={{ color: 'var(--text-muted)' }}
                                        >
                                            Component Stack
                                        </summary>
                                        <pre
                                            className="mt-2 text-xs"
                                            style={{ color: 'var(--text-soft)' }}
                                        >
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={this.handleReload}
                                className="px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-80"
                                style={{
                                    backgroundColor: 'var(--accent-blue)',
                                    color: '#000000',
                                }}
                            >
                                Reload Page
                            </button>

                            {import.meta.env.DEV && (
                                <button
                                    onClick={this.handleReset}
                                    className="px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-80"
                                    style={{
                                        backgroundColor: 'var(--bg-panel-soft)',
                                        color: 'var(--text-main)',
                                        border: '1px solid var(--border-subtle)',
                                    }}
                                >
                                    Try Again
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
