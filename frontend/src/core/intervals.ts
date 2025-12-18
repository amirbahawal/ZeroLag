/**
 * ZeroLag Interval and Window Utilities
 * 
 * Utilities for managing time intervals, windows, and candle data.
 * All functions are pure and handle edge cases gracefully.
 * 
 * @module intervals
 */

import type { Interval, RangeWindow, VolumeWindow, Candle } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum candles to store per symbol+interval.
 * Limits memory usage while providing sufficient historical data.
 */
export const MAX_BARS_PER_INTERVAL: Record<Interval, number> = {
    '1m': 500,
    '5m': 500,
    '15m': 500,
    '1h': 500,
    '4h': 500,
    '1d': 500
};

/**
 * Klines fetch limits for initial bootstrap.
 * Matches MAX_BARS_PER_INTERVAL for consistency.
 */
export const KLINE_FETCH_LIMITS: Record<Interval, number> = {
    '1m': 500,
    '5m': 500,
    '15m': 500,
    '1h': 500,
    '4h': 500,
    '1d': 500
};

/**
 * Mapping of range/volume windows to their matching intervals.
 * 
 * For accurate metric calculation, each window should use candles
 * of the matching interval (e.g., 5m window uses 5m candles).
 */
export const WINDOW_TO_INTERVAL: Record<RangeWindow | VolumeWindow, Interval> = {
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '24h': '1h'  // 24h uses 1h candles (24 candles cover the window)
};

// ============================================================================
// TIME CONVERSION FUNCTIONS
// ============================================================================

/**
 * Convert window or interval string to milliseconds.
 * 
 * Supports formats: '1m', '5m', '15m', '1h', '4h', '1d', '24h'
 * 
 * @param window - Window or interval string
 * @returns Duration in milliseconds
 * 
 * @pure No side effects
 */
export function windowToMs(window: RangeWindow | VolumeWindow | Interval): number {
    const value = parseInt(window);
    const unit = window.replace(/\d+/, '');

    switch (unit) {
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return 0;
    }
}

/**
 * Convert interval to milliseconds.
 * 
 * Alias for windowToMs for semantic clarity.
 * 
 * @param interval - Interval string
 * @returns Duration in milliseconds
 * 
 * @pure No side effects
 */
export function intervalToMs(interval: Interval): number {
    return windowToMs(interval);
}

/**
 * Get window duration in milliseconds.
 * 
 * Alias for windowToMs with more explicit naming.
 * 
 * @param window - Range or volume window
 * @returns Duration in milliseconds
 * 
 * @pure No side effects
 */
export function getWindowDurationMs(window: RangeWindow | VolumeWindow): number {
    return windowToMs(window);
}

// ============================================================================
// WINDOW-TO-INTERVAL MAPPING
// ============================================================================

/**
 * Get the recommended interval for a given window.
 * 
 * Returns the interval that should be used to calculate metrics
 * for the specified window. For example, a 5m range window should
 * use 5m interval candles.
 * 
 * @param window - Range or volume window
 * @returns Matching interval
 * 
 * @pure No side effects
 */
export function getIntervalForWindow(window: RangeWindow | VolumeWindow): Interval {
    return WINDOW_TO_INTERVAL[window];
}

/**
 * Get all intervals needed for metric calculations.
 * 
 * Returns the set of intervals required to compute all metrics
 * (ranges, volumes, growth).
 * 
 * @returns Array of required intervals
 * 
 * @pure No side effects
 */
export function getRequiredIntervals(): Interval[] {
    return ['5m', '15m', '1h', '4h'];
}

// ============================================================================
// CANDLE FILTERING UTILITIES
// ============================================================================

/**
 * Filter candles within a time window.
 * 
 * Returns candles where closeTime >= (now - windowMs).
 * Used by metric calculation functions.
 * 
 * @param candles - Array of candles to filter
 * @param windowMs - Window duration in milliseconds
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Filtered candles within the window
 * 
 * @pure No side effects (creates new array)
 */
export function getCandlesInWindow(
    candles: Candle[],
    windowMs: number,
    now: number = Date.now()
): Candle[] {
    const cutoff = now - windowMs;
    return candles.filter(c => c.closeTime >= cutoff);
}

/**
 * Filter candles by window string.
 * 
 * Convenience wrapper that converts window string to milliseconds.
 * 
 * @param candles - Array of candles to filter
 * @param window - Window string (e.g., '1h', '4h')
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Filtered candles within the window
 * 
 * @pure No side effects (creates new array)
 */
export function getCandlesByWindow(
    candles: Candle[],
    window: RangeWindow | VolumeWindow,
    now: number = Date.now()
): Candle[] {
    const windowMs = windowToMs(window);
    return getCandlesInWindow(candles, windowMs, now);
}

/**
 * Get the most recent N candles.
 * 
 * Returns the last N candles from the array, sorted by closeTime.
 * 
 * @param candles - Array of candles
 * @param count - Number of candles to return
 * @returns Most recent N candles
 * 
 * @pure No side effects (creates new array)
 */
export function getRecentCandles(candles: Candle[], count: number): Candle[] {
    if (count <= 0) return [];
    if (count >= candles.length) return [...candles];

    // Sort by closeTime descending, take first N, then reverse
    return [...candles]
        .sort((a, b) => b.closeTime - a.closeTime)
        .slice(0, count)
        .reverse();
}

/**
 * Check if a candle is within a time window.
 * 
 * @param candle - Candle to check
 * @param windowMs - Window duration in milliseconds
 * @param now - Current timestamp (defaults to Date.now())
 * @returns True if candle is within window
 * 
 * @pure No side effects
 */
export function isCandleInWindow(
    candle: Candle,
    windowMs: number,
    now: number = Date.now()
): boolean {
    const cutoff = now - windowMs;
    return candle.closeTime >= cutoff;
}

// ============================================================================
// INTERVAL VALIDATION
// ============================================================================

/**
 * Check if a string is a valid interval.
 * 
 * @param value - String to check
 * @returns True if value is a valid Interval
 * 
 * @pure No side effects
 */
export function isValidInterval(value: string): value is Interval {
    return ['1m', '5m', '15m', '1h', '4h', '1d'].includes(value);
}

/**
 * Check if a string is a valid range window.
 * 
 * @param value - String to check
 * @returns True if value is a valid RangeWindow
 * 
 * @pure No side effects
 */
export function isValidRangeWindow(value: string): value is RangeWindow {
    return ['5m', '15m', '1h', '4h'].includes(value);
}

/**
 * Check if a string is a valid volume window.
 * 
 * @param value - String to check
 * @returns True if value is a valid VolumeWindow
 * 
 * @pure No side effects
 */
export function isValidVolumeWindow(value: string): value is VolumeWindow {
    return ['15m', '4h', '24h'].includes(value);
}

// ============================================================================
// CANDLE ARRAY UTILITIES
// ============================================================================

/**
 * Trim candle array to maximum length.
 * 
 * Keeps the most recent candles up to maxBars limit.
 * Used to prevent unbounded memory growth.
 * 
 * @param candles - Array of candles
 * @param maxBars - Maximum number of candles to keep
 * @returns Trimmed array (most recent candles)
 * 
 * @pure No side effects (creates new array)
 */
export function trimCandles(candles: Candle[], maxBars: number): Candle[] {
    if (candles.length <= maxBars) return candles;

    // Sort by closeTime and keep most recent
    return [...candles]
        .sort((a, b) => a.closeTime - b.closeTime)
        .slice(-maxBars);
}

/**
 * Merge new candles into existing array.
 * 
 * Adds new candles, removes duplicates (by openTime), sorts by closeTime,
 * and trims to maxBars.
 * 
 * @param existing - Existing candles
 * @param newCandles - New candles to merge
 * @param maxBars - Maximum candles to keep
 * @returns Merged and trimmed array
 * 
 * @pure No side effects (creates new array)
 */
export function mergeCandles(
    existing: Candle[],
    newCandles: Candle[],
    maxBars: number
): Candle[] {
    // Create map to deduplicate by openTime
    const candleMap = new Map<number, Candle>();

    // Add existing candles
    for (const candle of existing) {
        candleMap.set(candle.openTime, candle);
    }

    // Add/update with new candles
    for (const candle of newCandles) {
        candleMap.set(candle.openTime, candle);
    }

    // Convert to array, sort, and trim
    const merged = Array.from(candleMap.values())
        .sort((a, b) => a.closeTime - b.closeTime);

    return trimCandles(merged, maxBars);
}
