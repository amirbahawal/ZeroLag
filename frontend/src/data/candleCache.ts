import type { Candle, Interval } from '../core/types';
import { MAX_BARS_PER_INTERVAL } from '../core/intervals';

/**
 * Ring buffer storage for candles per symbol+interval
 * 
 * Spec 5.2:
 * - Max 500 candles per symbol+interval
 * - On new kline: replace if same openTime, append if later
 * - Auto-drop oldest if exceeds max
 */
export class CandleCache {
    // Map: "SYMBOL:INTERVAL" -> Candle[]
    private cache = new Map<string, Candle[]>();

    private getKey(symbol: string, interval: Interval): string {
        return `${symbol}:${interval}`;
    }

    /**
     * Get candles for symbol+interval
     */
    getCandlesForSymbol(symbol: string, interval: Interval): Candle[] {
        return this.cache.get(this.getKey(symbol, interval)) || [];
    }

    /**
     * Set/replace entire candle array for symbol+interval
     */
    setCandlesForSymbol(
        symbol: string,
        interval: Interval,
        candles: Candle[]
    ): void {
        const key = this.getKey(symbol, interval);
        const max = MAX_BARS_PER_INTERVAL[interval];

        // Check for existing newer candles (WS updates that arrived during REST fetch)
        const existing = this.cache.get(key) || [];
        let merged = candles;

        if (existing.length > 0 && candles.length > 0) {
            const lastFetched = candles[candles.length - 1];
            // Keep existing candles that are newer than the last fetched candle
            const newer = existing.filter(c => c.openTime > lastFetched.openTime);
            if (newer.length > 0) {
                merged = [...candles, ...newer];
            }
        }

        // Keep only most recent `max` candles
        const trimmed = merged.length > max
            ? merged.slice(merged.length - max)
            : merged;

        this.cache.set(key, trimmed);
    }

    /**
     * Update/append a single candle
     * 
     * If matches last openTime → replace
     * If newer openTime → append
     */
    updateCandle(symbol: string, interval: Interval, candle: Candle): void {
        const key = this.getKey(symbol, interval);
        const existing = this.cache.get(key) || [];
        const max = MAX_BARS_PER_INTERVAL[interval];

        if (existing.length === 0) {
            this.cache.set(key, [candle]);
            return;
        }

        const last = existing[existing.length - 1];

        if (candle.openTime === last.openTime) {
            // Replace last candle
            existing[existing.length - 1] = candle;
        } else if (candle.openTime > last.openTime) {
            // Append new candle
            existing.push(candle);

            // Trim if exceeds max
            if (existing.length > max) {
                existing.shift();
            }
        }
        // Else: ignore old data
    }

    /**
     * Clear all cached candles
     */
    clearAll(): void {
        this.cache.clear();
    }
}

// Singleton instance
export const defaultCandleCache = new CandleCache();
