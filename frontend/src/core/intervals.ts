import type { Interval, RangeWindow, VolumeWindow } from './types';

/**
 * Maximum candles to store per symbol+interval
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
 * Klines fetch limits for bootstrap
 * (from constants.ts but here for reference)
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
 * Convert window string to milliseconds
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
 * Convert interval to milliseconds
 */
export function intervalToMs(interval: Interval): number {
    return windowToMs(interval);
}
