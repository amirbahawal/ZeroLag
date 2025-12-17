import type { Candle, RangeMetric, RangeWindow, VolumeMetric, VolumeWindow, DailyExtremumMetric, GrowthMetric } from './types';
import { windowToMs } from './intervals';

/**
 * Compute range metric for a time window
 * 
 * Spec 5.4.1:
 * - Use interval-matching candles (5m range → 5m interval candles)
 * - Filter by closeTime within last W minutes
 * - Return high, low, abs, pct
 */
export function computeRangeMetric(
    candles: Candle[],
    window: RangeWindow,
    now: number
): RangeMetric {
    const windowMs = windowToMs(window);
    const cutoff = now - windowMs;

    // Filter candles within the window
    const relevantCandles = candles.filter(c => c.closeTime >= cutoff);

    if (relevantCandles.length === 0) {
        return {
            window,
            high: 0,
            low: 0,
            abs: 0,
            pct: 0
        };
    }

    let high = -Infinity;
    let low = Infinity;

    for (const c of relevantCandles) {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
    }

    // Handle edge case where low is 0 or Infinity (shouldn't happen with valid data)
    if (low === Infinity || low === 0) {
        return {
            window,
            high: high === -Infinity ? 0 : high,
            low: low === Infinity ? 0 : low,
            abs: 0,
            pct: 0
        };
    }

    return {
        window,
        high,
        low,
        abs: high - low,
        pct: (high - low) / low
    };
}

/**
 * Compute volume metric for a time window
 * 
 * Spec 5.4.2:
 * - Use matching interval candles
 * - Sum baseVolume and quoteVolume
 * - Handle 24h separately (use ticker data in engine)
 */
export function computeVolumeMetric(
    candles: Candle[],
    window: VolumeWindow,
    now: number
): VolumeMetric {
    const windowMs = windowToMs(window);
    const cutoff = now - windowMs;

    const relevantCandles = candles.filter(c => c.closeTime >= cutoff);

    let base = 0;
    let quote = 0;

    for (const c of relevantCandles) {
        base += c.volumeBase;
        // Use quoteVolume if available, otherwise estimate
        quote += c.volumeQuote;
    }

    return {
        window,
        base,
        quote
    };
}

/**
 * Compute daily extremum metric (dExt)
 * 
 * Spec 5.4.3:
 * - Use 24h high/low from ticker
 * - Determine nearest side and score
 */
export function computeDailyExtremumMetric(
    high24h: number,
    low24h: number,
    lastPrice: number
): DailyExtremumMetric {
    if (high24h <= 0 || low24h <= 0 || lastPrice <= 0) {
        return {
            high24h,
            low24h,
            lastPrice,
            distToHighPct: 0,
            distToLowPct: 0,
            nearestSide: 'none',
            score: 0
        };
    }

    const distToHighPct = (high24h - lastPrice) / high24h;
    const distToLowPct = (lastPrice - low24h) / low24h;

    let nearestSide: 'high' | 'low' | 'none' = 'none';
    let score = 0;

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

/**
 * Compute growth metric (gvolume)
 * 
 * Spec 5.4.4:
 * - Baseline: volume_4h / 16 (per 15m)
 * - Current: volume_15m
 * - Ratio = current / baseline
 */
export function computeGrowthMetric(
    volume15mQuote: number,
    volume4hQuote: number
): GrowthMetric {
    const baselinePer15m = volume4hQuote / 16;

    if (baselinePer15m <= 0) {
        return {
            currentWindow: '15m',
            baselineWindow: '4h',
            baselinePer15m: 0,
            current: volume15mQuote,
            ratio: 0,
            delta: 0
        };
    }

    const ratio = volume15mQuote / baselinePer15m;
    return {
        currentWindow: '15m',
        baselineWindow: '4h',
        baselinePer15m,
        current: volume15mQuote,
        ratio,
        delta: ratio - 1
    };
}
