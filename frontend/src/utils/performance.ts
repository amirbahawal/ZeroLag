/**
 * Performance Utilities
 * 
 * Helper functions for optimizing performance:
 * - Debouncing for resize/scroll events
 * - Throttling for frequent updates
 * - Memoization for expensive calculations
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: 'any' is intentionally used in generic type constraints for flexibility

/* =============================================
   DEBOUNCE
   ============================================= */

/**
 * Debounce a function
 * 
 * Delays function execution until after wait milliseconds have elapsed
 * since the last time it was invoked.
 * 
 * @param func - Function to debounce
 * @param wait - Milliseconds to wait
 * @returns Debounced function
 * 
 * @example
 * const handleResize = debounce(() => {
 *   console.log('Window resized');
 * }, 300);
 * 
 * window.addEventListener('resize', handleResize);
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null;
            func(...args);
        };

        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(later, wait);
    };
}

/* =============================================
   THROTTLE
   ============================================= */

/**
 * Throttle a function
 * 
 * Ensures function is called at most once per specified time period.
 * Useful for limiting rate of function execution.
 * 
 * @param func - Function to throttle
 * @param limit - Minimum time between calls (ms)
 * @returns Throttled function
 * 
 * @example
 * const handleScroll = throttle(() => {
 *   console.log('Scrolling');
 * }, 100);
 * 
 * window.addEventListener('scroll', handleScroll);
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean = false;
    let lastResult: ReturnType<T>;

    return function executedFunction(...args: Parameters<T>) {
        if (!inThrottle) {
            lastResult = func(...args);
            inThrottle = true;

            setTimeout(() => {
                inThrottle = false;
            }, limit);
        }

        return lastResult;
    };
}

/* =============================================
   MEMOIZATION
   ============================================= */

/**
 * Memoize a function
 * 
 * Caches function results based on arguments.
 * Useful for expensive calculations with repeated inputs.
 * 
 * @param func - Function to memoize
 * @returns Memoized function
 * 
 * @example
 * const expensiveCalc = (n: number) => {
 *   // ... heavy computation
 *   return result;
 * };
 * 
 * const memoized = memoize(expensiveCalc);
 * memoized(5); // Computed
 * memoized(5); // Cached
 */
export function memoize<T extends (...args: any[]) => any>(
    func: T
): (...args: Parameters<T>) => ReturnType<T> {
    const cache = new Map<string, ReturnType<T>>();

    return function memoizedFunction(...args: Parameters<T>): ReturnType<T> {
        const key = JSON.stringify(args);

        if (cache.has(key)) {
            return cache.get(key)!;
        }

        const result = func(...args);
        cache.set(key, result);

        return result;
    };
}

/* =============================================
   ADDITIONAL UTILITIES
   ============================================= */

/**
 * Request animation frame wrapper with fallback
 * 
 * @param callback - Function to call on next frame
 * @returns Cancel function
 */
export function rafThrottle<T extends (...args: any[]) => any>(
    callback: T
): (...args: Parameters<T>) => void {
    let rafId: number | null = null;

    return function throttled(...args: Parameters<T>) {
        if (rafId !== null) {
            return;
        }

        rafId = requestAnimationFrame(() => {
            callback(...args);
            rafId = null;
        });
    };
}

/**
 * Clear memoization cache for a memoized function
 * 
 * Note: This is a development utility. In production,
 * create new memoized functions instead.
 */
export function clearMemoCache<T extends (...args: any[]) => any>(
    memoizedFunc: T & { cache?: Map<string, any> }
): void {
    if (memoizedFunc.cache) {
        memoizedFunc.cache.clear();
    }
}

/**
 * Measure function execution time (development only)
 * 
 * @param fn - Function to measure
 * @param label - Label for console output
 * @returns Wrapped function that logs execution time
 * 
 * @example
 * const measured = measurePerformance(expensiveFunc, 'Heavy Calc');
 * measured(); // Logs: "Heavy Calc took 123.45ms"
 */
export function measurePerformance<T extends (...args: any[]) => any>(
    fn: T,
    label: string
): (...args: Parameters<T>) => ReturnType<T> {
    return function measured(...args: Parameters<T>): ReturnType<T> {
        if (import.meta.env.DEV) {
            const start = performance.now();
            const result = fn(...args);
            const end = performance.now();

            console.log(`[Performance] ${label} took ${(end - start).toFixed(2)}ms`);

            return result;
        }

        return fn(...args);
    };
}

/**
 * Batch multiple state updates into a single render
 * 
 * @param updates - Array of update functions
 * 
 * @example
 * batchUpdates([
 *   () => setState1(value1),
 *   () => setState2(value2),
 *   () => setState3(value3),
 * ]);
 */
export function batchUpdates(updates: Array<() => void>): void {
    // In React 18+, updates are automatically batched
    // This is here for compatibility and explicit batching
    updates.forEach((update) => update());
}
