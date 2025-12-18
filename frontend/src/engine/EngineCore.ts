/**
 * Engine Core Module
 * 
 * Pure domain logic layer for ZeroLag trading engine.
 * Implements all business rules, filtering, and metric computation.
 * 
 * ARCHITECTURE:
 * - REST layer: Pure transport (fetch/parse only)
 * - Engine layer: Domain logic (THIS FILE)
 * - UI layer: State management and rendering
 */

import {
    fetch24hTickers,
    fetchKlines,
    determineActiveSymbols,
    type BinanceTicker24h,
} from '../data/binanceRest';
import type { Interval, Candle } from '../core/types';

/* =============================================
   TYPES
   ============================================= */

/**
 * Symbol metrics computed by the engine
 */
export interface SymbolMetrics {
    symbol: string;
    avgPrice: number;
    high24h: number;
    low24h: number;
    volume24h: number;
    quoteVolume24h: number;
    priceChangePercent24h: number;
    volatility: number;
    trend: 'bullish' | 'bearish' | 'neutral';
}

/**
 * Engine result for a single symbol
 */
export interface SymbolEngineData {
    symbol: string;
    metrics: SymbolMetrics;
    klines: Candle[];
    isFiltered: boolean;
    filterReason?: string;
}

/**
 * Complete engine output
 */
export interface EngineResult {
    activeSymbols: string[];
    symbolData: SymbolEngineData[];
    timestamp: number;
    errors: Array<{ symbol: string; error: string }>;
}

/**
 * Filter configuration
 */
export interface FilterConfig {
    minVolume24h?: number;
    minVolatility?: number;
    maxVolatility?: number;
    trendFilter?: 'bullish' | 'bearish' | 'neutral' | 'any';
}

/* =============================================
   ENGINE CORE CLASS
   ============================================= */

/**
 * Core Engine - Pure domain logic
 * 
 * Responsibilities:
 * 1. Compute active set (top 100 symbols)
 * 2. Fetch klines for active symbols only
 * 3. Compute metrics from klines + ticker data
 * 4. Apply domain filters
 * 5. Return structured data
 */
export class EngineCore {
    /**
     * Run the complete engine pipeline
     * 
     * @param interval - Candlestick interval to fetch
     * @param limit - Number of candles to fetch per symbol
     * @param filterConfig - Optional filter configuration
     * @returns Complete engine result with metrics and klines
     */
    public async run(
        interval: Interval,
        limit: number = 100,
        filterConfig?: FilterConfig
    ): Promise<EngineResult> {
        const startTime = Date.now();
        const errors: Array<{ symbol: string; error: string }> = [];

        try {
            // STEP 1: Fetch 24h ticker data (raw from REST)
            console.log('[EngineCore] Step 1: Fetching 24h tickers...');
            const rawTickers = await fetch24hTickers();

            // STEP 2: ENGINE LOGIC - Compute active set (top 100 by volume)
            console.log('[EngineCore] Step 2: Computing active set...');
            const activeSymbols = determineActiveSymbols(rawTickers);
            console.log(`[EngineCore] Active set: ${activeSymbols.length} symbols`);

            // Create ticker map for quick lookup
            const tickerMap = new Map<string, BinanceTicker24h>();
            for (const ticker of rawTickers) {
                tickerMap.set(ticker.symbol, ticker);
            }

            // STEP 3: Fetch klines for active symbols only
            console.log(`[EngineCore] Step 3: Fetching klines for ${activeSymbols.length} symbols...`);
            const klinesData = await this.fetchKlinesForActiveSet(
                activeSymbols,
                interval,
                limit,
                errors
            );

            // STEP 4: Compute metrics for each symbol
            console.log('[EngineCore] Step 4: Computing metrics...');
            const symbolData: SymbolEngineData[] = [];

            for (const symbol of activeSymbols) {
                const ticker = tickerMap.get(symbol);
                const klines = klinesData.get(symbol);

                if (!ticker) {
                    errors.push({ symbol, error: 'Ticker data not found' });
                    continue;
                }

                if (!klines || klines.length === 0) {
                    errors.push({ symbol, error: 'Klines data not found' });
                    continue;
                }

                // Compute metrics
                const metrics = this.computeMetrics(symbol, ticker, klines);

                // Apply filters
                const filterResult = this.applyFilters(metrics, filterConfig);

                symbolData.push({
                    symbol,
                    metrics,
                    klines,
                    isFiltered: filterResult.isFiltered,
                    filterReason: filterResult.reason,
                });
            }

            const endTime = Date.now();
            console.log(`[EngineCore] Pipeline complete in ${endTime - startTime}ms`);
            console.log(`[EngineCore] Processed: ${symbolData.length} symbols, Errors: ${errors.length}`);

            return {
                activeSymbols,
                symbolData,
                timestamp: endTime,
                errors,
            };
        } catch (error) {
            console.error('[EngineCore] Pipeline failed:', error);
            throw error;
        }
    }

    /**
     * Fetch klines for all active symbols with concurrency control
     * 
     * Uses REST's built-in concurrency controller (4 concurrent max)
     * 
     * @param symbols - Active symbols to fetch
     * @param interval - Candlestick interval
     * @param limit - Number of candles per symbol
     * @param errors - Array to collect errors
     * @returns Map of symbol -> candles
     */
    private async fetchKlinesForActiveSet(
        symbols: string[],
        interval: Interval,
        limit: number,
        errors: Array<{ symbol: string; error: string }>
    ): Promise<Map<string, Candle[]>> {
        const klinesMap = new Map<string, Candle[]>();

        // Fetch with concurrency (REST layer handles rate limiting via concurrencyController)
        const promises = symbols.map(async (symbol) => {
            try {
                // Retry logic: 3 attempts with exponential backoff
                let lastError: any;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const candles = await fetchKlines(symbol, interval, limit);
                        klinesMap.set(symbol, candles);
                        return;
                    } catch (err) {
                        lastError = err;
                        if (attempt < 3) {
                            // Exponential backoff: 1s, 2s
                            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        }
                    }
                }
                throw lastError;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                errors.push({ symbol, error: errorMsg });
                console.error(`[EngineCore] Failed to fetch klines for ${symbol}:`, errorMsg);
            }
        });

        await Promise.all(promises);
        return klinesMap;
    }

    /**
     * Compute metrics for a symbol
     * 
     * ENGINE LOGIC: All metric computation happens here
     * 
     * @param symbol - Trading symbol
     * @param ticker - 24h ticker data
     * @param klines - Historical candles
     * @returns Computed metrics
     */
    private computeMetrics(
        symbol: string,
        ticker: BinanceTicker24h,
        klines: Candle[]
    ): SymbolMetrics {
        // Basic metrics from ticker
        const high24h = parseFloat(ticker.highPrice);
        const low24h = parseFloat(ticker.lowPrice);
        const volume24h = parseFloat(ticker.volume);
        const quoteVolume24h = parseFloat(ticker.quoteVolume);
        const priceChangePercent24h = parseFloat(ticker.priceChangePercent);

        // Compute average price from klines
        const avgPrice = klines.reduce((sum, k) => sum + k.close, 0) / klines.length;

        // Compute volatility (standard deviation of close prices)
        const variance = klines.reduce((sum, k) => {
            const diff = k.close - avgPrice;
            return sum + (diff * diff);
        }, 0) / klines.length;
        const volatility = Math.sqrt(variance);

        // Determine trend (simple: compare first and last candle)
        const firstClose = klines[0].close;
        const lastClose = klines[klines.length - 1].close;
        const priceChange = ((lastClose - firstClose) / firstClose) * 100;

        let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        if (priceChange > 1) trend = 'bullish';
        else if (priceChange < -1) trend = 'bearish';

        return {
            symbol,
            avgPrice,
            high24h,
            low24h,
            volume24h,
            quoteVolume24h,
            priceChangePercent24h,
            volatility,
            trend,
        };
    }

    /**
     * Apply domain filters to metrics
     * 
     * ENGINE LOGIC: Filtering happens here, not in REST
     * 
     * @param metrics - Computed metrics
     * @param config - Filter configuration
     * @returns Filter result
     */
    private applyFilters(
        metrics: SymbolMetrics,
        config?: FilterConfig
    ): { isFiltered: boolean; reason?: string } {
        if (!config) {
            return { isFiltered: false };
        }

        // Filter by minimum volume
        if (config.minVolume24h && metrics.quoteVolume24h < config.minVolume24h) {
            return {
                isFiltered: true,
                reason: `Volume ${metrics.quoteVolume24h.toFixed(0)} < ${config.minVolume24h}`,
            };
        }

        // Filter by minimum volatility
        if (config.minVolatility && metrics.volatility < config.minVolatility) {
            return {
                isFiltered: true,
                reason: `Volatility ${metrics.volatility.toFixed(2)} < ${config.minVolatility}`,
            };
        }

        // Filter by maximum volatility
        if (config.maxVolatility && metrics.volatility > config.maxVolatility) {
            return {
                isFiltered: true,
                reason: `Volatility ${metrics.volatility.toFixed(2)} > ${config.maxVolatility}`,
            };
        }

        // Filter by trend
        if (config.trendFilter && config.trendFilter !== 'any' && metrics.trend !== config.trendFilter) {
            return {
                isFiltered: true,
                reason: `Trend ${metrics.trend} != ${config.trendFilter}`,
            };
        }

        return { isFiltered: false };
    }

    /**
     * Get filtered symbols (not filtered out)
     * 
     * @param result - Engine result
     * @returns Array of symbol data that passed filters
     */
    public getFilteredSymbols(result: EngineResult): SymbolEngineData[] {
        return result.symbolData.filter(s => !s.isFiltered);
    }

    /**
     * Get symbols sorted by a metric
     * 
     * ENGINE LOGIC: Sorting happens here
     * 
     * @param result - Engine result
     * @param sortBy - Metric to sort by
     * @param descending - Sort order
     * @returns Sorted symbol data
     */
    public sortByMetric(
        result: EngineResult,
        sortBy: keyof SymbolMetrics,
        descending: boolean = true
    ): SymbolEngineData[] {
        const filtered = this.getFilteredSymbols(result);

        return filtered.sort((a, b) => {
            const aVal = a.metrics[sortBy];
            const bVal = b.metrics[sortBy];

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return descending ? bVal - aVal : aVal - bVal;
            }

            return 0;
        });
    }
}

/* =============================================
   SINGLETON INSTANCE
   ============================================= */

/**
 * Default engine core instance
 */
export const defaultEngineCore = new EngineCore();

/* =============================================
   EXAMPLE USAGE
   ============================================= */

/**
 * Example: Run engine and get top 10 symbols by volume
 */
export async function exampleUsage() {
    const engine = new EngineCore();

    // Run engine pipeline
    const result = await engine.run('1h', 100, {
        minVolume24h: 1000000, // Min $1M volume
        minVolatility: 0.5,    // Min 0.5% volatility
        trendFilter: 'bullish', // Only bullish symbols
    });

    // Get filtered and sorted symbols
    const topSymbols = engine.sortByMetric(result, 'quoteVolume24h', true).slice(0, 10);

    console.log('Top 10 symbols by volume:');
    topSymbols.forEach((s, i) => {
        console.log(
            `${i + 1}. ${s.symbol}: $${s.metrics.quoteVolume24h.toFixed(0)} ` +
            `(${s.metrics.trend}, vol: ${s.metrics.volatility.toFixed(2)}%)`
        );
    });

    return topSymbols;
}
