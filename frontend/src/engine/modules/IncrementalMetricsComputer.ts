import { computeSymbolMetrics } from '../../core/metrics';
import type { SymbolMetrics, Candle, Interval } from '../../core/types';
import type { Ticker24h } from '../../data/binanceRest';

export class IncrementalMetricsComputer {
    private metricCache = new Map<string, SymbolMetrics>();
    private dirtySymbols = new Set<string>();

    markDirty(symbol: string): void {
        this.dirtySymbols.add(symbol);
    }

    markDirtyBatch(symbols: string[]): void {
        for (const symbol of symbols) this.dirtySymbols.add(symbol);
    }

    computeIncremental(
        candleBuffers: Map<string, Map<Interval, Candle[]>>,
        tickerMap: Map<string, Ticker24h>,
        symbolInfoMap: Record<string, any>
    ): Record<string, SymbolMetrics> {
        const updates: Record<string, SymbolMetrics> = {};
        for (const symbol of this.dirtySymbols) {
            const buffers = candleBuffers.get(symbol);
            const ticker = tickerMap.get(symbol);
            const info = symbolInfoMap[symbol];

            if (buffers && ticker && info) {
                const metrics = computeSymbolMetrics(info, buffers, ticker);
                this.metricCache.set(symbol, metrics);
                updates[symbol] = metrics;
            }
        }
        this.dirtySymbols.clear();
        return updates;
    }

    computeAll(
        symbols: string[],
        candleBuffers: Map<string, Map<Interval, Candle[]>>,
        tickerMap: Map<string, Ticker24h>,
        symbolInfoMap: Record<string, any>
    ): Record<string, SymbolMetrics> {
        const allMetrics: Record<string, SymbolMetrics> = {};
        for (const symbol of symbols) {
            const buffers = candleBuffers.get(symbol);
            const ticker = tickerMap.get(symbol);
            const info = symbolInfoMap[symbol];

            if (buffers && ticker && info) {
                const metrics = computeSymbolMetrics(info, buffers, ticker);
                this.metricCache.set(symbol, metrics);
                allMetrics[symbol] = metrics;
            }
        }
        this.dirtySymbols.clear();
        return allMetrics;
    }

    getCached(symbol: string): SymbolMetrics | undefined {
        return this.metricCache.get(symbol);
    }

    getAllCached(): Record<string, SymbolMetrics> {
        const result: Record<string, SymbolMetrics> = {};
        for (const [symbol, metrics] of this.metricCache) result[symbol] = metrics;
        return result;
    }

    hasCached(symbol: string): boolean {
        return this.metricCache.has(symbol);
    }

    remove(symbol: string): void {
        this.metricCache.delete(symbol);
        this.dirtySymbols.delete(symbol);
    }

    removeBatch(symbols: string[]): void {
        for (const symbol of symbols) this.remove(symbol);
    }

    clearCache(): void {
        this.metricCache.clear();
        this.dirtySymbols.clear();
    }

    getDirtyCount(): number { return this.dirtySymbols.size; }
    getCacheSize(): number { return this.metricCache.size; }
    hasDirty(): boolean { return this.dirtySymbols.size > 0; }
    getDirtySymbols(): string[] { return Array.from(this.dirtySymbols); }
}
