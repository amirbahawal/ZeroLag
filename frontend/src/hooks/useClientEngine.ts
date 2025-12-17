/**
 * useClientEngine Hook
 * 
 * React hook for managing ClientEngine lifecycle.
 * Handles engine initialization, state tracking, and cleanup.
 * 
 * @example
 * function App() {
 *   const { isRunning, error, isInitialized } = useClientEngine();
 *   
 *   if (error) return <ErrorScreen error={error} />;
 *   if (!isInitialized) return <LoadingScreen />;
 *   
 *   return <MainApp />;
 * }
 */

import { useState, useEffect, useRef } from 'react';
import { defaultEngine } from '../engine/ClientEngine';

/* =============================================
   TYPES
   ============================================= */

/**
 * Hook return type
 */
interface UseClientEngineReturn {
    /** Whether the engine is currently running */
    isRunning: boolean;
    /** Any error that occurred during initialization or runtime */
    error: Error | null;
    /** Whether initial data load is complete */
    isInitialized: boolean;
    /** Retry function to restart the engine after an error */
    retry: () => void;
}

/* =============================================
   SINGLETON STATE
   ============================================= */

// Track if engine has been started to prevent double initialization
let engineStarted = false;

// Track if we're in the process of starting
let engineStarting = false;

/* =============================================
   HOOK
   ============================================= */

/**
 * React hook for managing ClientEngine lifecycle
 * 
 * Features:
 * - Automatic engine initialization on mount
 * - State tracking (running, error, initialized)
 * - Automatic cleanup on unmount
 * - React StrictMode safe (prevents double initialization)
 * - Error handling with retry capability
 * 
 * @returns Object with engine status, error state, and retry function
 * 
 * @example
 * ```tsx
 * function App() {
 *   const { isRunning, error, isInitialized, retry } = useClientEngine();
 *   
 *   if (error) {
 *     return (
 *       <ErrorScreen 
 *         error={error} 
 *         onRetry={retry} 
 *       />
 *     );
 *   }
 *   
 *   if (!isInitialized) {
 *     return <LoadingScreen />;
 *   }
 *   
 *   return <Dashboard />;
 * }
 * ```
 */
export function useClientEngine(): UseClientEngineReturn {
    // State for tracking engine status
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    // Track if this component instance started the engine
    const didStart = useRef(false);

    /**
     * Start the engine
     */
    const startEngine = async () => {
        // Prevent double start
        if (engineStarted || engineStarting) {
            console.log('[useClientEngine] Engine already started or starting');
            return;
        }

        console.log('[useClientEngine] Starting engine...');
        engineStarting = true;

        try {
            // Clear any previous errors
            setError(null);

            // Start the engine
            await defaultEngine.start();

            // Mark as started
            engineStarted = true;
            didStart.current = true;

            // Update state
            setIsRunning(true);
            setIsInitialized(true);

            console.log('[useClientEngine] Engine started successfully ✓');
        } catch (err) {
            console.error('[useClientEngine] Failed to start engine:', err);

            // Store error
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);

            // Reset flags
            engineStarted = false;
            didStart.current = false;
        } finally {
            engineStarting = false;
        }
    };

    /**
     * Stop the engine
     */
    const stopEngine = () => {
        if (!didStart.current) {
            console.log('[useClientEngine] This instance did not start the engine, skipping stop');
            return;
        }

        console.log('[useClientEngine] Stopping engine...');

        try {
            defaultEngine.stop();

            // Reset flags
            engineStarted = false;
            engineStarting = false; // Ensure this is reset too!
            didStart.current = false;

            // Update state
            setIsRunning(false);
            setIsInitialized(false);

            console.log('[useClientEngine] Engine stopped ✓');
        } catch (err) {
            console.error('[useClientEngine] Error stopping engine:', err);
        }
    };

    /**
     * Retry starting the engine after an error
     */
    const retry = () => {
        console.log('[useClientEngine] Retrying engine start...');

        // Reset error state
        setError(null);
        setIsInitialized(false);

        // Reset singleton flags to allow restart
        engineStarted = false;
        engineStarting = false;
        didStart.current = false;

        // Start engine
        startEngine();
    };

    // Initialize engine on mount
    useEffect(() => {
        console.log('[useClientEngine] Hook mounted');

        // Check if engine is actually running (e.g. from HMR persistence)
        if (defaultEngine.isEngineRunning()) {
            console.log('[useClientEngine] Engine already running (recovered state)');
            setIsRunning(true);
            setIsInitialized(true);
            engineStarted = true;
            engineStarting = false;

            // We don't set didStart.current = true here because we didn't start it,
            // so we shouldn't stop it on unmount (unless we want to force restart)
            // But for HMR, we probably want to attach to the running instance.
            return;
        }

        // Start engine if not already started
        if (!engineStarted && !engineStarting) {
            startEngine();
        } else if (engineStarted) {
            // Engine already running (tracked by module flag), just update local state
            setIsRunning(true);
            setIsInitialized(true);
        }

        // Cleanup on unmount
        return () => {
            console.log('[useClientEngine] Hook unmounting');
            stopEngine();
        };
    }, []); // Empty dependency array - only run on mount/unmount

    return {
        isRunning,
        error,
        isInitialized,
        retry,
    };
}

/* =============================================
   UTILITY FUNCTIONS
   ============================================= */

/**
 * Reset the engine singleton state
 * 
 * Useful for testing or forcing a complete restart.
 * USE WITH CAUTION in production.
 * 
 * @internal
 */
export function resetEngineState(): void {
    engineStarted = false;
    engineStarting = false;
    console.warn('[useClientEngine] Engine state reset');
}
