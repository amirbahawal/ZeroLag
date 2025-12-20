/* eslint-disable @typescript-eslint/no-explicit-any */

export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null;
            func(...args);
        };
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void {
    let inThrottle = false;
    let lastResult: ReturnType<T>;
    return function executedFunction(...args: Parameters<T>) {
        if (!inThrottle) {
            lastResult = func(...args);
            inThrottle = true;
            setTimeout(() => { inThrottle = false; }, limit);
        }
        return lastResult;
    };
}

export function memoize<T extends (...args: any[]) => any>(func: T): (...args: Parameters<T>) => ReturnType<T> {
    const cache = new Map<string, ReturnType<T>>();
    return function memoizedFunction(...args: Parameters<T>): ReturnType<T> {
        const key = JSON.stringify(args);
        if (cache.has(key)) return cache.get(key)!;
        const result = func(...args);
        cache.set(key, result);
        return result;
    };
}

export function rafThrottle<T extends (...args: any[]) => any>(callback: T): (...args: Parameters<T>) => void {
    let rafId: number | null = null;
    return function throttled(...args: Parameters<T>) {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
            callback(...args);
            rafId = null;
        });
    };
}

export function clearMemoCache<T extends (...args: any[]) => any>(memoizedFunc: T & { cache?: Map<string, any> }): void {
    if (memoizedFunc.cache) memoizedFunc.cache.clear();
}

export function measurePerformance<T extends (...args: any[]) => any>(fn: T, label: string): (...args: Parameters<T>) => ReturnType<T> {
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

export function batchUpdates(updates: Array<() => void>): void {
    updates.forEach((update) => update());
}
