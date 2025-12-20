import { RingBuffer } from '../utils/RingBuffer';
import type { Candle, Interval } from '../../core/types';

export class BufferManager {
    private buffers = new Map<string, Map<Interval, RingBuffer<Candle>>>();

    private readonly MAX_CANDLES_PER_BUFFER: Record<Interval, number> = {
        '1m': 500, '5m': 500, '15m': 500, '1h': 500, '4h': 500, '1d': 500
    };

    getBuffer(symbol: string, interval: Interval): Candle[] {
        const buffer = this.buffers.get(symbol)?.get(interval);
        return buffer ? buffer.toArray() : [];
    }

    getLastCandle(symbol: string, interval: Interval): Candle | undefined {
        return this.buffers.get(symbol)?.get(interval)?.getLast();
    }

    setBuffer(symbol: string, interval: Interval, candles: Candle[]): void {
        this.ensureBuffer(symbol, interval);
        const buffer = this.buffers.get(symbol)!.get(interval)!;
        buffer.clear();
        for (const candle of candles) buffer.push(candle);
    }

    updateCandle(symbol: string, interval: Interval, newCandle: Candle): void {
        this.ensureBuffer(symbol, interval);
        const buffer = this.buffers.get(symbol)!.get(interval)!;
        const lastCandle = buffer.getLast();

        if (!lastCandle) {
            buffer.push(newCandle);
            return;
        }

        if (newCandle.openTime === lastCandle.openTime) {
            buffer.replaceLast(newCandle);
        } else if (newCandle.openTime > lastCandle.openTime) {
            buffer.push(newCandle);
        }
    }

    clearSymbol(symbol: string): void {
        this.buffers.delete(symbol);
    }

    clearInterval(symbol: string, interval: Interval): void {
        this.buffers.get(symbol)?.delete(interval);
    }

    clearAll(): void {
        this.buffers.clear();
    }

    getMemoryUsage() {
        let totalCandles = 0;
        let symbolCount = 0;
        for (const intervalMap of this.buffers.values()) {
            symbolCount++;
            for (const buffer of intervalMap.values()) totalCandles += buffer.length;
        }
        return { totalCandles, symbolCount, avgCandlesPerSymbol: symbolCount > 0 ? totalCandles / symbolCount : 0 };
    }

    getSymbolStats(symbol: string): Record<Interval, number> | null {
        const symbolMap = this.buffers.get(symbol);
        if (!symbolMap) return null;
        const stats: any = {};
        for (const [interval, buffer] of symbolMap) stats[interval] = buffer.length;
        return stats;
    }

    hasBuffer(symbol: string, interval: Interval): boolean {
        return this.buffers.get(symbol)?.has(interval) ?? false;
    }

    getSymbols(): string[] {
        return Array.from(this.buffers.keys());
    }

    private ensureBuffer(symbol: string, interval: Interval): void {
        if (!this.buffers.has(symbol)) this.buffers.set(symbol, new Map());
        const symbolMap = this.buffers.get(symbol)!;
        if (!symbolMap.has(interval)) {
            symbolMap.set(interval, new RingBuffer<Candle>(this.MAX_CANDLES_PER_BUFFER[interval]));
        }
    }
}
