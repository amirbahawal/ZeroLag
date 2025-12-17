












/**
 * API Status Management
 * 
 * Simple status tracking system for monitoring Binance API health.
 * Implements spec section 4.3 rate limiting requirements.
 * 
 * This module provides a lightweight event system for tracking API status
 * that can be consumed by UI components to show warnings/banners.
 * Will eventually integrate with Zustand store for global state.
 * 
 * @module data/apiStatus
 */

/**
 * API status states
 * 
 * - 'ok': Normal operation
 * - 'rate_limited': Hit 429 rate limit (spec section 4.3)
 * - 'error': Other API errors
 */
export type ApiStatus = 'ok' | 'rate_limited' | 'error';

/**
 * Callback type for status change notifications
 */
export type ApiStatusCallback = (status: ApiStatus, previousStatus: ApiStatus) => void;

/* =============================================
   STATE
   ============================================= */

let currentStatus: ApiStatus = 'ok';
const listeners: Set<ApiStatusCallback> = new Set();

/* =============================================
   PUBLIC API
   ============================================= */

/**
 * Get current API status
 * 
 * @returns Current status
 */
export function getApiStatus(): ApiStatus {
    return currentStatus;
}

/**
 * Set API status and notify listeners
 * 
 * Spec Reference: Section 4.3 - "Set a global state flag apiStatus = 'rate_limited'"
 * 
 * @param status - New status to set
 * 
 * @example
 * ```typescript
 * // When 429 detected:
 * setApiStatus('rate_limited');
 * 
 * // When recovered:
 * setApiStatus('ok');
 * ```
 */
export function setApiStatus(status: ApiStatus): void {
    const previous = currentStatus;

    // Only update and notify if status actually changed
    if (previous === status) {
        return;
    }

    currentStatus = status;

    // Log status change
    const statusLabels: Record<ApiStatus, string> = {
        ok: '✓ Normal',
        rate_limited: '⚠ Rate Limited',
        error: '✗ Error'
    };

    console.log(
        `[API Status] Changed: ${statusLabels[previous]} → ${statusLabels[status]}`
    );

    // Notify all listeners
    listeners.forEach(callback => {
        try {
            callback(status, previous);
        } catch (error) {
            console.error('[API Status] Listener error:', error);
        }
    });
}

/**
 * Register a callback for status changes
 * 
 * @param callback - Function to call when status changes
 * @returns Unsubscribe function
 * 
 * @example
 * ```typescript
 * const unsubscribe = onApiStatusChange((status, previous) => {
 *   if (status === 'rate_limited') {
 *     showWarningBanner('API rate limit hit. Please wait...');
 *   } else if (status === 'ok' && previous === 'rate_limited') {
 *     hideWarningBanner();
 *   }
 * });
 * 
 * // Later:
 * unsubscribe();
 * ```
 */
export function onApiStatusChange(callback: ApiStatusCallback): () => void {
    listeners.add(callback);

    // Return unsubscribe function
    return () => {
        listeners.delete(callback);
    };
}

/**
 * Remove a status change listener
 * 
 * @param callback - Callback to remove
 */
export function removeListener(callback: ApiStatusCallback): void {
    listeners.delete(callback);
}

/**
 * Clear all listeners (useful for cleanup/testing)
 */
export function clearListeners(): void {
    listeners.clear();
}

/**
 * Reset API status to 'ok'
 * 
 * Convenience function for recovering from error states.
 */
export function resetApiStatus(): void {
    setApiStatus('ok');
}
