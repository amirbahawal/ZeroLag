/**
 * ZeroLag Metric Calculation Functions
 * 
 * This module contains pure functions for computing all metrics used in the ZeroLag system.
 * All functions are pure (no side effects, no external state) and handle edge cases gracefully.
 * 
 * @module metrics
 */

import type {
    Candle,
    Interval,
    RangeMetric,
    RangeWindow,
    VolumeMetric,
    VolumeWindow,
    DailyExtremumMetric,
    GrowthMetric,
    SymbolMetrics
} from './types';
import type { Ticker24h } from '../data/binanceRest';
import { windowToMs } from './intervals';

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

/**
 * Window duration constants in milliseconds.
 */
const WINDOW_DURATIONS_MS = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000
};

/**
 * Filter candles within a time window.
 * 
 * Returns candles where closeTime is between (referenceTime - windowMs) and referenceTime.
 * 
 * @param candles - Array of candles to filter
 * @param windowMs - Window duration in milliseconds
 * @param referenceTime - Reference timestamp (defaults to Date.now())
 * @returns Filtered candles within the window
 */
function getCandlesInWindow(
    candles: Candle[],
    windowMs: number,
    referenceTime: number = Date.now()
): Candle[] {
    const windowStart = referenceTime - windowMs;
    return candles.filter(c =>
        c.closeTime >= windowStart && c.closeTime <= referenceTime
    );
}

// ============================================================================
// RANGE METRIC (VOLATILITY)
// ============================================================================

/**
 * Compute range (volatility) metric for a time window.
 * 
 * This function calculates price volatility by finding the highest and lowest
 * prices within a specified time window, then computing the percentage range.
 * 
 * **Specification (5.4.1):**
 * - Use interval-matching candles (e.g., 5m range → 5m interval candles)
 * - Filter by closeTime within the last W minutes
 * - Return high, low, absolute range, and percentage range
 * 
 * **Formula:**
 * ```
 * Range % = (High - Low) / Low
 * Absolute Range = High - Low
 * ```
 * 
 * **Algorithm:**
 * 1. Filter candles where closeTime >= (now - window)
 * 2. Find maximum high and minimum low across all filtered candles
 * 3. Calculate absolute and percentage ranges
 * 
 * **Edge Cases:**
 * - Empty candles array → Returns zeros
 * - No candles in window → Returns zeros
 * - Low price is 0 or invalid → Returns zeros to avoid division by zero
 * - Invalid high/low values → Returns zeros
 * 
 * **Example:**
 * ```typescript
 * const candles = [...]; // Array of 1h candles
 * const metric = computeRangeMetric(candles, '1h', Date.now());
 * // metric.pct = 0.025 means 2.5% volatility in the last hour
 * ```
 * 
 * @param candles - Array of candles to analyze (should match window interval)
 * @param window - Time window for calculation ('5m' | '15m' | '1h' | '4h')
 * @param now - Current timestamp in milliseconds (Unix epoch)
 * @returns RangeMetric with high, low, abs, and pct fields
 * 
 * @pure This function has no side effects
 */
export function computeRangeMetric(
    candles: Candle[],
    window: RangeWindow,
    now: number
): RangeMetric {
    const windowMs = WINDOW_DURATIONS_MS[window as keyof typeof WINDOW_DURATIONS_MS] || windowToMs(window);

    // Filter candles within the time window
    const relevantCandles = getCandlesInWindow(candles, windowMs, now);

    // Edge case: No candles in window
    if (relevantCandles.length === 0) {
        return {
            window,
            high: 0,
            low: 0,
            abs: 0,
            pct: 0
        };
    }

    // Find max high and min low across all candles
    let high = -Infinity;
    let low = Infinity;

    for (const c of relevantCandles) {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
    }

    // Edge case: Invalid high/low values or division by zero
    if (low === Infinity || low <= 0 || high === -Infinity || high < low) {
        return {
            window,
            high: high === -Infinity ? 0 : high,
            low: low === Infinity ? 0 : low,
            abs: 0,
            pct: 0
        };
    }

    // Calculate range metrics
    const abs = high - low;
    const pct = abs / low;

    return {
        window,
        high,
        low,
        abs,
        pct
    };
}

// ============================================================================
// VOLUME METRIC (LIQUIDITY)
// ============================================================================

/**
 * Compute volume metric for a time window.
 * 
 * This function aggregates trading volume over a specified time window,
 * summing both base asset volume and quote asset volume (USDT).
 * 
 * **Specification (5.4.2):**
 * - Use interval-matching candles
 * - Sum volumeBase and volumeQuote for all candles in window
 * - Quote volume (USDT) is used for ranking
 * - 24h volume should use ticker data (handled in engine)
 * 
 * **Formula:**
 * ```
 * Total Base Volume = Sum(volumeBase for all candles in window)
 * Total Quote Volume = Sum(volumeQuote for all candles in window)
 * ```
 * 
 * **Algorithm:**
 * 1. Filter candles where closeTime >= (now - window)
 * 2. Sum volumeBase and volumeQuote across all filtered candles
 * 3. Return aggregated volumes
 * 
 * **Edge Cases:**
 * - Empty candles array → Returns zeros
 * - No candles in window → Returns zeros
 * - Missing volumeQuote → Uses 0 (should not happen with valid data)
 * - Negative volumes → Included as-is (should not happen with valid data)
 * 
 * **Example:**
 * ```typescript
 * const candles = [...]; // Array of 15m candles
 * const metric = computeVolumeMetric(candles, '15m', Date.now());
 * // metric.quote = 5000000 means $5M USDT volume in last 15 minutes
 * ```
 * 
 * @param candles - Array of candles to analyze
 * @param window - Time window for calculation ('15m' | '4h' | '24h')
 * @param now - Current timestamp in milliseconds (Unix epoch)
 * @returns VolumeMetric with base and quote volume totals
 * 
 * @pure This function has no side effects
 */
export function computeVolumeMetric(
    candles: Candle[],
    window: VolumeWindow,
    now: number
): VolumeMetric {
    const windowMs = WINDOW_DURATIONS_MS[window as keyof typeof WINDOW_DURATIONS_MS] || windowToMs(window);

    // Filter candles within the time window
    const relevantCandles = getCandlesInWindow(candles, windowMs, now);

    // Sum volumes across all candles
    let base = 0;
    let quote = 0;

    for (const c of relevantCandles) {
        base += c.volumeBase || 0;
        // Spec 5.4.2: quote = candle.volumeQuote ?? candle.close * candle.volumeBase
        const quoteVal = c.volumeQuote || ((c.close || 0) * (c.volumeBase || 0));
        quote += quoteVal;
    }

    return {
        window,
        base,
        quote
    };
}

// ============================================================================
// DAILY EXTREMUM METRIC (dExt)
// ============================================================================

/**
 * Compute daily extremum (dExt) metric.
 * 
 * This function measures how close the current price is to the 24-hour high
 * or low, which is useful for identifying potential breakouts or reversals.
 * 
 * **Specification (5.4.3):**
 * - Use 24h high/low from ticker data
 * - Calculate distance to both high and low as percentages
 * - Determine which extremum is closer
 * - Score is the minimum distance (lower = closer to extremum)
 * 
 * **Formulas:**
 * ```
 * Distance to High % = (High24h - CurrentPrice) / High24h
 * Distance to Low % = (CurrentPrice - Low24h) / Low24h
 * Score = Min(Distance to High %, Distance to Low %)
 * ```
 * 
 * **Algorithm:**
 * 1. Calculate percentage distance from current price to 24h high
 * 2. Calculate percentage distance from current price to 24h low
 * 3. Determine which distance is smaller (nearest side)
 * 4. Use the smaller distance as the score
 * 
 * **Ranking:**
 * - Lower score = closer to extremum = higher rank
 * - This is the ONLY metric that uses ascending sort
 * 
 * **Edge Cases:**
 * - Any input <= 0 → Returns zeros with 'none' side
 * - Invalid price data → Returns zeros with 'none' side
 * - Price outside 24h range → Should not happen, but handled gracefully
 * 
 * **Example:**
 * ```typescript
 * const metric = computeDailyExtremumMetric(50000, 48000, 49900);
 * // metric.nearestSide = 'high' (closer to high)
 * // metric.score = 0.002 (0.2% from high)
 * ```
 * 
 * @param high24h - 24-hour high price
 * @param low24h - 24-hour low price
 * @param lastPrice - Current price
 * @returns DailyExtremumMetric with distances, nearest side, and score
 * 
 * @pure This function has no side effects
 */
export function computeDailyExtremumMetric(
    high24h: number,
    low24h: number,
    lastPrice: number
): DailyExtremumMetric {
    // Edge case: Invalid input data
    if (high24h <= 0 || low24h <= 0 || lastPrice <= 0 || high24h < low24h) {
        return {
            high24h,
            low24h,
            lastPrice,
            distToHighPct: 0,
            distToLowPct: 0,
            nearestSide: 'none',
            score: Number.POSITIVE_INFINITY
        };
    }

    // Calculate distances as percentages
    const distToHighPct = (high24h - lastPrice) / high24h;
    const distToLowPct = (lastPrice - low24h) / low24h;

    // Spec 5.4.3: If both distances are > 0
    if (distToHighPct <= 0 || distToLowPct <= 0) {
        return {
            high24h,
            low24h,
            lastPrice,
            distToHighPct,
            distToLowPct,
            nearestSide: 'none',
            score: Number.POSITIVE_INFINITY
        };
    }

    // Determine nearest side and score
    let nearestSide: 'high' | 'low' | 'none';
    let score: number;

    if (distToHighPct < distToLowPct) {
        nearestSide = 'high';
        score = distToHighPct;
    } else {
        nearestSide = 'low';
        score = distToLowPct;
    }

    return {
        high24h,
        low24h,
        lastPrice,
        distToHighPct,
        distToLowPct,
        nearestSide,
        score
    };
}

// ============================================================================
// GROWTH METRIC (gVolume)
// ============================================================================

/**
 * Compute growth metric (gVolume).
 * 
 * This function identifies "unusual" volume activity by comparing recent
 * short-term volume to a longer-term baseline.
 * 
 * **Specification (5.4.4):**
 * - Current window: 15m
 * - Baseline window: 4h
 * - Baseline per 15m = 4h Volume / 16
 * - Ratio = 15m Volume / Baseline per 15m
 * - Delta = 15m Volume - Baseline per 15m
 * 
 * **Algorithm:**
 * 1. Calculate baseline volume per 15-minute interval (4h volume / 16)
 * 2. Calculate ratio of current 15m volume to baseline
 * 3. Calculate absolute difference (delta)
 * 
 * **Edge Cases:**
 * - Baseline is 0 → Ratio = 0, Delta = current volume
 * - Negative volumes → Handled as-is
 * 
 * @param current15mQuote - Current 15-minute quote volume
 * @param baseline4hQuote - Baseline 4-hour quote volume
 * @returns GrowthMetric with ratio and delta
 * 
 * @pure This function has no side effects
 */
export function computeGrowthMetric(
    current15mQuote: number,
    baseline4hQuote: number
): GrowthMetric {
    const baselinePer15m = baseline4hQuote / 16;

    // Edge case: Division by zero
    if (baselinePer15m <= 0) {
        return {
            currentWindow: '15m',
            baselineWindow: '4h',
            baselinePer15m: 0,
            current: current15mQuote,
            ratio: 0,
            delta: current15mQuote
        };
    }

    const ratio = current15mQuote / baselinePer15m;
    const delta = current15mQuote - baselinePer15m;

    return {
        currentWindow: '15m',
        baselineWindow: '4h',
        baselinePer15m,
        current: current15mQuote,
        ratio,
        delta
    };
}

// ============================================================================
// AGGREGATE METRICS
// ============================================================================

/**
 * Compute all metrics for a single symbol.
 * 
 * This is the main entry point for metric calculation. It aggregates
 * range, volume, growth, and daily extremum metrics into a single
 * SymbolMetrics object.
 * 
 * **Algorithm:**
 * 1. Extract and validate ticker data
 * 2. Compute range metrics for all windows (5m, 15m, 1h, 4h)
 * 3. Compute volume metrics for all windows (15m, 4h, 24h)
 * 4. Compute growth metric (gVolume)
 * 5. Compute daily extremum metric (dExt)
 * 6. Return aggregated SymbolMetrics object
 * 
 * @param symbol - Trading symbol
 * @param candleBuffers - Map of candle arrays by interval
 * @param ticker24h - 24-hour ticker data from Binance
 * @returns Complete SymbolMetrics object
 */
export function computeSymbolMetrics(
    symbol: string,
    candleBuffers: Map<Interval, Candle[]>,
    ticker24h: Ticker24h
): SymbolMetrics {
    const now = Date.now();
    const lastPrice = parseFloat(ticker24h.lastPrice) || 0;
    const high24h = parseFloat(ticker24h.highPrice) || 0;
    const low24h = parseFloat(ticker24h.lowPrice) || 0;

    // Compute range metrics
    const ranges = {
        '5m': computeRangeMetric(candleBuffers.get('5m') || [], '5m', now),
        '15m': computeRangeMetric(candleBuffers.get('15m') || [], '15m', now),
        '1h': computeRangeMetric(candleBuffers.get('1h') || [], '1h', now),
        '4h': computeRangeMetric(candleBuffers.get('4h') || [], '4h', now)
    };

    // Compute volume metrics
    const volume15m = computeVolumeMetric(candleBuffers.get('15m') || [], '15m', now);
    const volume4h = computeVolumeMetric(candleBuffers.get('4h') || [], '4h', now);

    // 24h volume uses ticker data (as per spec 5.4.2)
    const volume24h = {
        window: '24h' as const,
        base: parseFloat(ticker24h.volume),
        quote: parseFloat(ticker24h.quoteVolume)
    };

    const volume = {
        '15m': volume15m,
        '4h': volume4h,
        '24h': volume24h
    };

    // Compute growth metric (gVolume)
    const gVolume = computeGrowthMetric(volume15m.quote, volume4h.quote);

    // Compute daily extremum (dExt)
    const dailyExtremum = computeDailyExtremumMetric(high24h, low24h, lastPrice);

    return {
        symbol,
        marketType: 'futures',
        lastPrice,
        lastUpdateTs: now,
        ranges,
        volume,
        growth: {
            gVolume
        },
        dailyExtremum,
        currentSortScore: 0
    };
}
