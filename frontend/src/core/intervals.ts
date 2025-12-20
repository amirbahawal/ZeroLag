import type { Interval, RangeWindow, VolumeWindow, Candle } from './types';

export const MAX_BARS_PER_INTERVAL: Record<Interval, number> = {
    '1m': 500, '5m': 500, '15m': 500, '1h': 500, '4h': 500, '1d': 500
};

export const KLINE_FETCH_LIMITS: Record<Interval, number> = {
    '1m': 500, '5m': 500, '15m': 500, '1h': 500, '4h': 500, '1d': 500
};

export const WINDOW_TO_INTERVAL: Record<RangeWindow | VolumeWindow, Interval> = {
    '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '24h': '1h'
};

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

export function intervalToMs(interval: Interval): number {
    return windowToMs(interval);
}

export function getWindowDurationMs(window: RangeWindow | VolumeWindow): number {
    return windowToMs(window);
}

export function getIntervalForWindow(window: RangeWindow | VolumeWindow): Interval {
    return WINDOW_TO_INTERVAL[window];
}

export function getRequiredIntervals(): Interval[] {
    return ['5m', '15m', '1h', '4h'];
}

export function getCandlesInWindow(candles: Candle[], windowMs: number, now: number = Date.now()): Candle[] {
    const cutoff = now - windowMs;
    return candles.filter(c => c.closeTime >= cutoff);
}

export function getCandlesByWindow(candles: Candle[], window: RangeWindow | VolumeWindow, now: number = Date.now()): Candle[] {
    return getCandlesInWindow(candles, windowToMs(window), now);
}

export function getRecentCandles(candles: Candle[], count: number): Candle[] {
    if (count <= 0) return [];
    if (count >= candles.length) return [...candles];
    return [...candles].sort((a, b) => b.closeTime - a.closeTime).slice(0, count).reverse();
}

export function isCandleInWindow(candle: Candle, windowMs: number, now: number = Date.now()): boolean {
    return candle.closeTime >= (now - windowMs);
}

export function isValidInterval(value: string): value is Interval {
    return ['1m', '5m', '15m', '1h', '4h', '1d'].includes(value);
}

export function isValidRangeWindow(value: string): value is RangeWindow {
    return ['5m', '15m', '1h', '4h'].includes(value);
}

export function isValidVolumeWindow(value: string): value is VolumeWindow {
    return ['15m', '4h', '24h'].includes(value);
}

export function trimCandles(candles: Candle[], maxBars: number): Candle[] {
    if (candles.length <= maxBars) return candles;
    return [...candles].sort((a, b) => a.closeTime - b.closeTime).slice(-maxBars);
}

export function mergeCandles(existing: Candle[], newCandles: Candle[], maxBars: number): Candle[] {
    const candleMap = new Map<number, Candle>();
    for (const candle of existing) candleMap.set(candle.openTime, candle);
    for (const candle of newCandles) candleMap.set(candle.openTime, candle);
    const merged = Array.from(candleMap.values()).sort((a, b) => a.closeTime - b.closeTime);
    return trimCandles(merged, maxBars);
}
