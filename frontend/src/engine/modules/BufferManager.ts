/**
 * Buffer Manager Module
 * 
 * Centralized candle buffer management using RingBuffer for optimal performance.
 * Handles all buffer operations with O(1) complexity and minimal memory overhead.
 */

import { RingBuffer } from '../utils/RingBuffer';
import type { Candle, Interval } from '../../core/types';

export class BufferManager {
    private buffers = new Map<string, Map<Interval, RingBuffer<Candle>>>();

    private readonly MAX_CANDLES_PER_BUFFER: Record<Interval, number> = {
        '1m': 500,
        '5m': 500,
        '15m': 500,
        '1h': 500,
        '4h': 500,
        '1d': 500
    };

    /**
     * Get candles for a symbol and interval
     * Returns empty array if buffer doesn't exist
     */
    getBuffer(symbol: string, interval: Interval): Candle[] {
        const symbolMap = this.buffers.get(symbol);
        if (!symbolMap) return [];

        const buffer = symbolMap.get(interval);
        return buffer ? buffer.toArray() : [];
    }

    /**
     * Get last candle for a symbol and interval
     */
    getLastCandle(symbol: string, interval: Interval): Candle | undefined {
        const symbolMap = this.buffers.get(symbol);
        if (!symbolMap) return undefined;

        const buffer = symbolMap.get(interval);
        return buffer ? buffer.getLast() : undefined;
    }

    /**
     * Set entire buffer for a symbol and interval
     * Replaces existing buffer with new candles
     */
    setBuffer(symbol: string, interval: Interval, candles: Candle[]): void {
        this.ensureBuffer(symbol, interval);
        const buffer = this.buffers.get(symbol)!.get(interval)!;

        // Clear and repopulate
        buffer.clear();
        for (const candle of candles) {
            buffer.push(candle);
        }
    }

    /**
     * Update buffer with a single candle
     * Handles both updates (same openTime) and new candles
     */
    updateCandle(symbol: string, interval: Interval, newCandle: Candle): void {
        this.ensureBuffer(symbol, interval);
        const buffer = this.buffers.get(symbol)!.get(interval)!;

        const lastCandle = buffer.getLast();

        if (!lastCandle) {
            // First candle
            buffer.push(newCandle);
            return;
        }

        if (newCandle.openTime === lastCandle.openTime) {
            // Update existing candle (replace last)
            // RingBuffer doesn't have replace, so we need to handle this
            // For now, we'll just push (which overwrites in circular fashion)
            // This is acceptable since we're updating the most recent candle
            const candles = buffer.toArray();
            candles[candles.length - 1] = newCandle;
            this.setBuffer(symbol, interval, candles);
        } else if (newCandle.openTime > lastCandle.openTime) {
            // New candle
            buffer.push(newCandle);
        }
        // Ignore old candles (openTime < lastCandle.openTime)
    }

    /**
     * Clear all buffers for a symbol
     * Used when symbol drops out of active set
     */
    clearSymbol(symbol: string): void {
        this.buffers.delete(symbol);
    }

    /**
     * Clear specific interval for a symbol
     */
    clearInterval(symbol: string, interval: Interval): void {
        const symbolMap = this.buffers.get(symbol);
        if (symbolMap) {
            symbolMap.delete(interval);
        }
    }

    /**
     * Clear all buffers
     */
    clearAll(): void {
        this.buffers.clear();
    }

    /**
     * Get memory usage statistics
     * Returns total number of candles stored
     */
    getMemoryUsage(): { totalCandles: number; symbolCount: number; avgCandlesPerSymbol: number } {
        let totalCandles = 0;
        let symbolCount = 0;

        for (const [_, intervalMap] of this.buffers) {
            symbolCount++;
            for (const [_, buffer] of intervalMap) {
                totalCandles += buffer.length;
            }
        }

        return {
            totalCandles,
            symbolCount,
            avgCandlesPerSymbol: symbolCount > 0 ? totalCandles / symbolCount : 0
        };
    }

    /**
     * Get buffer statistics for a symbol
     */
    getSymbolStats(symbol: string): Record<Interval, number> | null {
        const symbolMap = this.buffers.get(symbol);
        if (!symbolMap) return null;

        const stats: Partial<Record<Interval, number>> = {};
        for (const [interval, buffer] of symbolMap) {
            stats[interval] = buffer.length;
        }

        return stats as Record<Interval, number>;
    }

    /**
     * Check if buffer exists for symbol and interval
     */
    hasBuffer(symbol: string, interval: Interval): boolean {
        const symbolMap = this.buffers.get(symbol);
        return symbolMap?.has(interval) ?? false;
    }

    /**
     * Get all symbols with buffers
     */
    getSymbols(): string[] {
        return Array.from(this.buffers.keys());
    }

    /**
     * Ensure buffer exists for symbol and interval
     * Creates nested structure if needed
     */
    private ensureBuffer(symbol: string, interval: Interval): void {
        if (!this.buffers.has(symbol)) {
            this.buffers.set(symbol, new Map());
        }

        const symbolMap = this.buffers.get(symbol)!;
        if (!symbolMap.has(interval)) {
            const capacity = this.MAX_CANDLES_PER_BUFFER[interval];
            symbolMap.set(interval, new RingBuffer<Candle>(capacity));
        }
    }
}
