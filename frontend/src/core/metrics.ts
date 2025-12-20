import type {
    Candle,
    Interval,
    RangeMetric,
    RangeWindow,
    VolumeMetric,
    VolumeWindow,
    DailyExtremumMetric,
    GrowthMetric,
    SymbolMetrics,
    SymbolInfo
} from './types';
import type { Ticker24h } from '../data/binanceRest';
import { windowToMs } from './intervals';

const WINDOW_DURATIONS_MS = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000
};

function getCandlesInWindow(
    candles: Candle[],
    windowMs: number,
    referenceTime: number = Date.now()
): Candle[] {
    const windowStart = referenceTime - windowMs;
    return candles.filter(c => c.closeTime >= windowStart && c.closeTime <= referenceTime);
}

export function computeRangeMetric(
    candles: Candle[],
    window: RangeWindow,
    now: number
): RangeMetric {
    const windowMs = WINDOW_DURATIONS_MS[window as keyof typeof WINDOW_DURATIONS_MS] || windowToMs(window);
    const relevantCandles = getCandlesInWindow(candles, windowMs, now);

    if (relevantCandles.length === 0) {
        return { window, high: 0, low: 0, abs: 0, pct: 0, inactive: true };
    }

    let high = -Infinity;
    let low = Infinity;

    for (const c of relevantCandles) {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
    }

    if (low === Infinity || low <= 0 || high === -Infinity || high < low) {
        return {
            window,
            high: high === -Infinity ? 0 : high,
            low: low === Infinity ? 0 : low,
            abs: 0,
            pct: 0,
            inactive: true
        };
    }

    const abs = high - low;
    const pct = abs / low;

    return { window, high, low, abs, pct, inactive: false };
}

export function computeVolumeMetric(
    candles: Candle[],
    window: VolumeWindow,
    now: number
): VolumeMetric {
    const windowMs = WINDOW_DURATIONS_MS[window as keyof typeof WINDOW_DURATIONS_MS] || windowToMs(window);
    const relevantCandles = getCandlesInWindow(candles, windowMs, now);

    let base = 0;
    let quote = 0;

    for (const c of relevantCandles) {
        base += c.volumeBase || 0;
        const quoteVal = c.volumeQuote ?? ((c.close || 0) * (c.volumeBase || 0));
        quote += quoteVal;
    }

    return { window, base, quote };
}

export function computeDailyExtremumMetric(
    high24h: number,
    low24h: number,
    lastPrice: number
): DailyExtremumMetric {
    if (high24h <= 0 || low24h <= 0 || lastPrice <= 0 || high24h < low24h) {
        return {
            high24h, low24h, lastPrice,
            distToHighPct: 0, distToLowPct: 0,
            nearestSide: 'none', score: Number.POSITIVE_INFINITY
        };
    }

    const distToHighPct = (high24h - lastPrice) / high24h;
    const distToLowPct = (lastPrice - low24h) / low24h;

    if (distToHighPct <= 0 || distToLowPct <= 0) {
        return {
            high24h, low24h, lastPrice,
            distToHighPct, distToLowPct,
            nearestSide: 'none', score: Number.POSITIVE_INFINITY
        };
    }

    let nearestSide: 'high' | 'low' | 'none';
    let score: number;

    if (distToHighPct < distToLowPct) {
        nearestSide = 'high';
        score = distToHighPct;
    } else {
        nearestSide = 'low';
        score = distToLowPct;
    }

    return { high24h, low24h, lastPrice, distToHighPct, distToLowPct, nearestSide, score };
}

export function computeGrowthMetric(
    current15mQuote: number,
    baseline4hQuote: number
): GrowthMetric {
    const baselinePer15m = baseline4hQuote / 16;

    if (baselinePer15m <= 0) {
        return {
            currentWindow: '15m',
            baselineWindow: '4h',
            baselinePer15m: 0,
            current: current15mQuote,
            ratio: 0,
            delta: 0
        };
    }

    const ratio = current15mQuote / baselinePer15m;
    const delta = ratio - 1;

    return {
        currentWindow: '15m',
        baselineWindow: '4h',
        baselinePer15m,
        current: current15mQuote,
        ratio,
        delta
    };
}

export function computeSymbolMetrics(
    info: SymbolInfo,
    candleBuffers: Map<Interval, Candle[]>,
    ticker24h: Ticker24h
): SymbolMetrics {
    const now = Date.now();
    const lastPrice = parseFloat(ticker24h.lastPrice) || 0;
    const high24h = parseFloat(ticker24h.highPrice) || 0;
    const low24h = parseFloat(ticker24h.lowPrice) || 0;

    const ranges = {
        '5m': computeRangeMetric(candleBuffers.get('5m') || [], '5m', now),
        '15m': computeRangeMetric(candleBuffers.get('15m') || [], '15m', now),
        '1h': computeRangeMetric(candleBuffers.get('1h') || [], '1h', now),
        '4h': computeRangeMetric(candleBuffers.get('4h') || [], '4h', now)
    };

    const volume15m = computeVolumeMetric(candleBuffers.get('15m') || [], '15m', now);
    const volume4h = computeVolumeMetric(candleBuffers.get('4h') || [], '4h', now);

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

    const gVolume = computeGrowthMetric(volume15m.quote, volume4h.quote);
    const dailyExtremum = computeDailyExtremumMetric(high24h, low24h, lastPrice);

    return {
        info,
        lastPrice,
        lastUpdateTs: now,
        ranges,
        volume,
        growth: { gVolume },
        dailyExtremum,
        currentSortScore: 0
    };
}
