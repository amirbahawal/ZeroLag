import { useState, useEffect, useRef } from 'react';
import { defaultEngine } from '../engine/ClientEngine';

interface UseClientEngineReturn {
    isRunning: boolean;
    error: Error | null;
    isInitialized: boolean;
    retry: () => void;
}

let engineStarted = false;
let engineStarting = false;

export function useClientEngine(): UseClientEngineReturn {
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const didStart = useRef(false);

    const startEngine = async () => {
        if (engineStarted || engineStarting) return;
        engineStarting = true;
        try {
            setError(null);
            await defaultEngine.start();
            engineStarted = true;
            didStart.current = true;
            setIsRunning(true);
            setIsInitialized(true);
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
            engineStarted = false;
            didStart.current = false;
        } finally {
            engineStarting = false;
        }
    };

    const stopEngine = () => {
        if (!didStart.current) return;
        try {
            defaultEngine.stop();
            engineStarted = false;
            engineStarting = false;
            didStart.current = false;
            setIsRunning(false);
            setIsInitialized(false);
        } catch (err) {
            console.error('[useClientEngine] Stop error:', err);
        }
    };

    const retry = () => {
        setError(null);
        setIsInitialized(false);
        engineStarted = false;
        engineStarting = false;
        didStart.current = false;
        startEngine();
    };

    useEffect(() => {
        if (defaultEngine.isEngineRunning()) {
            setIsRunning(true);
            setIsInitialized(true);
            engineStarted = true;
            engineStarting = false;
            return;
        }

        if (!engineStarted && !engineStarting) {
            startEngine();
        } else if (engineStarted) {
            setIsRunning(true);
            setIsInitialized(true);
        }

        return () => stopEngine();
    }, []);

    return { isRunning, error, isInitialized, retry };
}

export function resetEngineState(): void {
    engineStarted = false;
    engineStarting = false;
}
