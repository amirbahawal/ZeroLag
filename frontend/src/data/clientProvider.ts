/**
 * Binance Client Provider
 * 
 * Unified provider that wraps REST API and WebSocket functionality
 * for use by the ClientEngine. Provides a clean, consistent interface
 * for all Binance data operations.
 */

import type { Interval, Candle, SymbolInfo } from '../core/types';
import { useZeroLagStore } from '../state/useZeroLagStore';
import {
    fetch24hTickers,
    fetchExchangeInfo,
    fetchKlines,
    fetchServerTime,
    testConnectivity,
    BinanceApiError,
    RateLimitError,
    type Ticker24h,
    type ExchangeInfo,
    type RawKline,
    type ExchangeSymbol,
} from './binanceRest';
import {
    BinanceWebSocketManager,
    defaultWsManager,
    type CandleCallback,
} from './binanceWs';

/* =============================================
   TYPES
   ============================================= */

export type ApiStatus = 'ok' | 'error' | 'loading';

export interface DataProvider {
    getUniverse(): Promise<SymbolInfo[]>;
    get24hTickers(): Promise<Ticker24h[]>;
    getHistoricalCandles(symbol: string, interval: Interval, limit: number): Promise<Candle[]>;
    subscribeToKlines(symbol: string, interval: Interval, callback: (candle: Candle) => void): () => void;
    getConnectionStatus(): { rest: ApiStatus; ws: boolean };
}

/* =============================================
   CLIENT PROVIDER CLASS
   ============================================= */

/**
 * Client-side Binance data provider
 * 
 * Combines REST API calls and WebSocket subscriptions into a single
 * unified interface for the application to use.
 */
export class ClientBinanceProvider implements DataProvider {
    private wsManager: BinanceWebSocketManager;

    /** Number of currently active kline requests */
    private activeRequests: number = 0;

    /** Maximum concurrent kline requests */
    private readonly maxConcurrent: number = 4;

    /** Queue of pending requests waiting for slot */
    private requestQueue: Array<() => void> = [];

    /** Current REST API status */
    private restStatus: ApiStatus = 'ok';

    /** Cached universe data */
    private universeCache: SymbolInfo[] | null = null;

    /** Timestamp of last universe cache update */
    private universeCacheTime: number = 0;

    /** Universe cache TTL (5 minutes) */
    private readonly UNIVERSE_CACHE_TTL = 5 * 60 * 1000;

    /**
     * Create a new Binance provider instance
     * 
     * @param wsManager - Optional custom WebSocket manager (uses default if not provided)
     */
    constructor(wsManager?: BinanceWebSocketManager) {
        this.wsManager = wsManager || defaultWsManager;
    }

    /* =============================================
       DATA PROVIDER IMPLEMENTATION
       ============================================= */

    public async getUniverse(): Promise<SymbolInfo[]> {
        // Check cache validity
        const now = Date.now();
        if (this.universeCache && (now - this.universeCacheTime < this.UNIVERSE_CACHE_TTL)) {
            return this.universeCache;
        }

        try {
            const info = await this.getExchangeInfo();

            // Filter to USDT futures with TRADING status
            const filteredSymbols = info.symbols
                .filter((s: any) =>
                    s.quoteAsset === 'USDT' &&
                    s.status === 'TRADING'
                ) as unknown as SymbolInfo[];

            // Update cache
            this.universeCache = filteredSymbols;
            this.universeCacheTime = now;
            this.restStatus = 'ok';

            return filteredSymbols;
        } catch (e) {
            this.restStatus = 'error';
            throw e;
        }
    }

    public async getHistoricalCandles(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
        // Validate inputs
        if (!symbol || typeof symbol !== 'string') {
            console.error('[ClientProvider] Invalid symbol:', symbol);
            return [];
        }

        if (!interval) {
            console.error('[ClientProvider] Invalid interval:', interval);
            return [];
        }

        if (!limit || limit <= 0 || limit > 1500) {
            console.error('[ClientProvider] Invalid limit:', limit);
            return [];
        }

        try {
            // Use queued method which respects rate limiting via concurrency controller
            const candles = await this.getKlinesQueued(symbol, interval, limit);
            this.restStatus = 'ok';

            return candles;
        } catch (e) {
            this.restStatus = 'error';
            console.error(`[ClientProvider] Failed to fetch candles for ${symbol} ${interval}:`, e);
            // Return empty array instead of throwing to prevent cascading failures
            return [];
        }
    }

    public subscribeToKlines(symbol: string, interval: Interval, callback: (candle: Candle) => void): () => void {
        this.wsManager.on(symbol, interval, callback);
        return () => this.wsManager.off(symbol, interval, callback);
    }

    public getConnectionStatus(): { rest: ApiStatus; ws: boolean } {
        return {
            rest: this.restStatus,
            ws: useZeroLagStore.getState().wsConnected
        };
    }

    /* =============================================
       REST API METHODS
       ============================================= */

    /**
     * Fetch 24-hour ticker data for all symbols
     * 
     * @returns Array of ticker objects with price, volume, and change data
     * @throws {BinanceApiError} If the request fails
     * 
     * @example
     * const tickers = await provider.get24hTickers();
     * const btcTicker = tickers.find(t => t.symbol === 'BTCUSDT');
     */
    public async get24hTickers(): Promise<Ticker24h[]> {
        try {
            const rawTickers = await fetch24hTickers();

            // Get universe to filter valid symbols
            const universe = await this.getUniverse();
            const validSymbols = new Set(universe.map(s => s.symbol));

            // Map to internal format with number types and filter by universe
            const processedTickers = rawTickers
                .filter(t => validSymbols.has(t.symbol))
                .map(t => ({
                    symbol: t.symbol,
                    volume24h: parseFloat(t.volume),
                    quoteVolume24h: parseFloat(t.quoteVolume),
                    high24h: parseFloat(t.highPrice),
                    low24h: parseFloat(t.lowPrice),
                    lastPrice: parseFloat(t.lastPrice),
                    // Keep additional fields for compatibility
                    priceChange: t.priceChange,
                    priceChangePercent: t.priceChangePercent,
                    weightedAvgPrice: t.weightedAvgPrice,
                    lastQty: t.lastQty,
                    openPrice: t.openPrice,
                    highPrice: t.highPrice,
                    lowPrice: t.lowPrice,
                    volume: t.volume,
                    quoteVolume: t.quoteVolume,
                    openTime: t.openTime,
                    closeTime: t.closeTime,
                    firstId: t.firstId,
                    lastId: t.lastId,
                    count: t.count,
                })) as unknown as Ticker24h[];

            this.restStatus = 'ok';
            return processedTickers;
        } catch (e) {
            this.restStatus = 'error';
            throw e;
        }
    }

    /**
     * Fetch exchange information including all symbols and trading rules
     * 
     * @returns Exchange info object
     * @throws {BinanceApiError} If the request fails
     * 
     * @example
     * const info = await provider.getExchangeInfo();
     * const symbols = info.symbols.filter(s => s.status === 'TRADING');
     */
    public async getExchangeInfo(): Promise<ExchangeInfo> {
        return fetchExchangeInfo();
    }

    /**
     * Fetch historical kline/candlestick data for a symbol
     * 
     * **Note:** This method makes an immediate API call without rate limiting.
     * Use `getKlinesQueued()` when fetching data for multiple symbols to avoid
     * rate limits and connection pool exhaustion.
     * 
     * @param symbol - Trading symbol (e.g., 'BTCUSDT')
     * @param interval - Candlestick interval
     * @param limit - Number of candles to fetch
     * @returns Array of kline data
     * @throws {BinanceApiError} If the request fails
     * 
     * @example
     * const klines = await provider.getKlines('BTCUSDT', '1h', 100);
     */
    public async getKlines(
        symbol: string,
        interval: Interval,
        limit: number
    ): Promise<Candle[]> {
        return fetchKlines(symbol, interval, limit);
    }

    /**
     * Fetch historical kline/candlestick data with concurrency limiting
     * 
     * This method enforces a maximum of 4 concurrent requests to:
     * - Avoid Binance API rate limits (429 errors)
     * - Prevent browser connection pool exhaustion
     * - Ensure stable performance when fetching many symbols
     * 
     * **When to use:**
     * - Fetching klines for multiple symbols (e.g., initializing 16+ charts)
     * - High-frequency data loading scenarios
     * - When you need predictable, controlled API usage
     * 
     * **When to use getKlines() instead:**
     * - Single symbol fetch
     * - Critical path where latency matters more than rate limiting
     * 
     * @param symbol - Trading symbol (e.g., 'BTCUSDT')
     * @param interval - Candlestick interval
     * @param limit - Number of candles to fetch
     * @returns Array of kline data
     * @throws {BinanceApiError} If the request fails
     * 
     * @example
     * // Fetch klines for 20 symbols with automatic queuing
     * const promises = symbols.map(symbol => 
     *   provider.getKlinesQueued(symbol, '1h', 50)
     * );
     * const results = await Promise.all(promises);
     */
    public async getKlinesQueued(
        symbol: string,
        interval: Interval,
        limit: number
    ): Promise<Candle[]> {
        // Wait for a slot to become available
        await this.acquireSlot();

        try {
            // Make the actual API call
            return await fetchKlines(symbol, interval, limit);
        } finally {
            // Always release the slot, even if request fails
            this.releaseSlot();
        }
    }

    /**
     * Register a global listener for all kline events
     * 
     * @param callback - Function to call with every parsed candle
     * @returns Unsubscribe function
     */
    public onKline(callback: (candle: Candle) => void): () => void {
        return this.wsManager.onKline(callback);
    }

    /**
     * Acquire a slot for making a request
     * Waits if maximum concurrent requests are already active
     */
    private async acquireSlot(): Promise<void> {
        // If we're under the limit, proceed immediately
        if (this.activeRequests < this.maxConcurrent) {
            this.activeRequests++;
            return;
        }

        // Otherwise, wait in queue
        return new Promise<void>((resolve) => {
            this.requestQueue.push(resolve);
        });
    }

    /**
     * Release a slot and process next queued request if any
     */
    private releaseSlot(): void {
        // Check if there's a queued request waiting
        const nextRequest = this.requestQueue.shift();

        if (nextRequest) {
            // Give slot to next request in queue
            // activeRequests stays the same (transfer slot)
            nextRequest();
        } else {
            // No queued requests, decrement counter
            this.activeRequests--;
        }
    }

    /**
     * Get Binance server time
     * Useful for time synchronization
     * 
     * @returns Server timestamp in milliseconds
     * @throws {BinanceApiError} If the request fails
     */
    public async getServerTime(): Promise<number> {
        return fetchServerTime();
    }

    /**
     * Test connectivity to Binance API
     * 
     * @returns True if connection successful
     */
    public async testConnection(): Promise<boolean> {
        return testConnectivity();
    }


    /* =============================================
       WEBSOCKET METHODS
       ============================================= */

    /**
     * Connect to Binance WebSocket
     * 
     * @returns Promise that resolves when connected
     * 
     * @example
     * await provider.connectWebSocket();
     */
    public async connectWebSocket(): Promise<void> {
        return this.wsManager.connect();
    }

    /**
     * Subscribe to real-time candle updates for a symbol
     * 
     * @param symbol - Trading symbol (e.g., 'BTCUSDT')
     * @param interval - Candlestick interval
     * @param callback - Function to call when new candle data arrives
     * 
     * @example
     * provider.subscribeCandles('BTCUSDT', '1h', (candle) => {
     *   console.log('New candle:', candle);
     * });
     */
    public async subscribeCandles(
        symbol: string,
        interval: Interval,
        callback: CandleCallback
    ): Promise<void> {
        return this.wsManager.subscribe(symbol, interval, callback);
    }

    /**
     * Unsubscribe from candle updates for a symbol
     * 
     * @param symbol - Trading symbol
     * @param interval - Candlestick interval
     * 
     * @example
     * provider.unsubscribeCandles('BTCUSDT', '1h');
     */
    public unsubscribeCandles(symbol: string, interval: Interval): void {
        this.wsManager.unsubscribe(symbol, interval);
    }

    /**
     * Disconnect from Binance WebSocket
     * 
     * @example
     * provider.disconnectWebSocket();
     */
    public disconnectWebSocket(): void {
        this.wsManager.disconnect();
    }


    /* =============================================
       UTILITY METHODS
       ============================================= */

    /**
     * Parse raw kline array from Binance API to Candle object
     * 
     * Binance kline format:
     * [
     *   openTime, open, high, low, close, volume,
     *   closeTime, quoteVolume, trades, takerBaseVol, takerQuoteVol, ignore
     * ]
     * 
     * @param symbol - Trading symbol
     * @param interval - Candlestick interval
     * @param kline - Raw kline array from Binance
     * @returns Parsed Candle object
     */
    public parseKlineToCandle(
        symbol: string,
        interval: Interval,
        kline: RawKline
    ): Candle {
        return {
            symbol,
            interval,
            openTime: kline[0],
            closeTime: kline[6],
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volumeBase: parseFloat(kline[5]),
            volumeQuote: parseFloat(kline[7]),
            trades: kline[8],
            isFinal: kline[6] < Date.now(), // Check if candle is closed
        };
    }

    /**
     * Parse multiple klines to Candle array
     * 
     * @param symbol - Trading symbol
     * @param interval - Candlestick interval
     * @param klines - Array of raw kline arrays
     * @returns Array of Candle objects
     */
    public parseKlinesToCandles(
        symbol: string,
        interval: Interval,
        klines: RawKline[]
    ): Candle[] {
        return klines.map((kline) => this.parseKlineToCandle(symbol, interval, kline));
    }

    /**
     * Filter symbols for futures USDT-margined perpetuals only
     * 
     * @param symbols - Raw symbols from exchange info
     * @returns Filtered symbols array
     */
    public filterFuturesUSDTSymbols(symbols: ExchangeSymbol[]): ExchangeSymbol[] {
        return symbols.filter(
            (s) =>
                s.contractType === 'PERPETUAL' &&
                s.quoteAsset === 'USDT' &&
                s.status === 'TRADING'
        );
    }
}

/* =============================================
   SINGLETON INSTANCE
   ============================================= */

/**
 * Default provider instance
 * Can be imported and used directly throughout the application
 */
export const defaultProvider = new ClientBinanceProvider();

/* =============================================
   EXPORTS
   ============================================= */

// Re-export error types for convenience
export { BinanceApiError, RateLimitError };
