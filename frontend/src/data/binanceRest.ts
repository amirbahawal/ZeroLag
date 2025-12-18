/**
 * Binance Futures REST API Client
 * 
 * Provides functions for fetching market data from Binance Futures API
 * with built-in retry logic and rate limit handling.
 */

import type { Interval, Candle, SymbolInfo } from '../core/types';
import { useZeroLagStore } from '../state/useZeroLagStore';

/* =============================================
   TYPES
   ============================================= */

/** Raw kline/candlestick data from Binance API */
export type BinanceKline = [
    number,  // Open time
    string,  // Open
    string,  // High
    string,  // Low
    string,  // Close
    string,  // Volume
    number,  // Close time
    string,  // Quote asset volume
    number,  // Number of trades
    string,  // Taker buy base asset volume
    string,  // Taker buy quote asset volume
    string   // Ignore
];
export type RawKline = BinanceKline;

/** 24h ticker data from Binance API */
export interface BinanceTicker24h {
    symbol: string;
    priceChange: string;
    priceChangePercent: string;
    weightedAvgPrice: string;
    lastPrice: string;
    lastQty: string;
    openPrice: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
    quoteVolume: string;
    openTime: number;
    closeTime: number;
    firstId: number;
    lastId: number;
    count: number;
}
export type Ticker24h = BinanceTicker24h;

/** Exchange info symbol data */
export interface BinanceSymbolInfo {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
    contractType: string;
    // ... other fields
    [key: string]: unknown;
}
export type ExchangeSymbol = BinanceSymbolInfo;

/** Exchange info response */
export interface BinanceExchangeInfo {
    timezone: string;
    serverTime: number;
    symbols: BinanceSymbolInfo[];
}
export type ExchangeInfo = BinanceExchangeInfo;

/* =============================================
   CONSTANTS
   ============================================= */

/** Binance Futures API base URL */
export const BINANCE_FUTURES_BASE = 'https://fapi.binance.com';
export const BASE_URL = import.meta.env.DEV ? '' : BINANCE_FUTURES_BASE;

/** Retry delays for exponential backoff (milliseconds) */
const RETRY_DELAYS = [1000, 2000, 5000]; // 1s, 2s, 5s

/** Maximum number of retry attempts */
const MAX_RETRIES = RETRY_DELAYS.length;

/* =============================================
   ERROR TYPES
   ============================================= */

export class RestApiError extends Error {
    constructor(
        message: string,
        public statusCode?: number,
        public isTransient: boolean = false,
        public response?: unknown
    ) {
        super(message);
        this.name = 'RestApiError';
    }
}

export class RateLimitError extends RestApiError {
    constructor(message: string) {
        super(message, 429, true); // Rate limits are transient-ish (can retry after wait)
        this.name = 'RateLimitError';
    }
}

export { RestApiError as BinanceApiError }; // Alias for backward compatibility

/* =============================================
   HELPER FUNCTIONS
   ============================================= */

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Concurrency Controller
 * 
 * Limits the number of concurrent requests to prevent rate limiting.
 */
class ConcurrencyController {
    private running: number = 0;
    private queue: Array<{
        fn: () => Promise<any>;
        resolve: (value: any) => void;
        reject: (reason: any) => void;
    }> = [];
    private maxConcurrent: number;

    constructor(maxConcurrent: number) {
        this.maxConcurrent = maxConcurrent;
    }

    /**
     * Run a function with concurrency control
     */
    async run<T>(fn: () => Promise<T>): Promise<T> {
        if (this.running < this.maxConcurrent) {
            this.running++;
            try {
                return await fn();
            } finally {
                this.running--;
                this.processQueue();
            }
        } else {
            return new Promise<T>((resolve, reject) => {
                this.queue.push({ fn, resolve, reject });
            });
        }
    }

    private async processQueue() {
        if (this.running < this.maxConcurrent && this.queue.length > 0) {
            const item = this.queue.shift();
            if (item) {
                this.running++;
                try {
                    const result = await item.fn();
                    item.resolve(result);
                } catch (error) {
                    item.reject(error);
                } finally {
                    this.running--;
                    this.processQueue();
                }
            }
        }
    }
}

export const concurrencyController = new ConcurrencyController(4);

/**
 * Rate Limit Manager
 * 
 * Handles 429 rate limits with exponential backoff.
 */
class RateLimitManager {
    private isLimited: boolean = false;
    private backoffMs: number = 15000;
    private retryCount: number = 0;

    /**
     * Wait if currently rate limited
     */
    async waitIfNeeded(): Promise<void> {
        if (this.isLimited) {
            console.warn(`[RateLimitManager] Waiting ${this.backoffMs}ms due to rate limit...`);
            await sleep(this.backoffMs);
        }
    }

    /**
     * Mark as rate limited and trigger backoff
     */
    markRateLimited(): void {
        this.isLimited = true;

        // Exponential backoff: 15s -> 30s -> 60s -> 120s
        this.backoffMs = Math.min(15000 * Math.pow(2, this.retryCount), 120000);
        this.retryCount++;

        console.warn(`[RateLimitManager] Rate limit hit! Backoff set to ${this.backoffMs}ms`);

        // Update store status
        useZeroLagStore.getState().setApiStatus('rate_limited');
    }

    /**
     * Reset rate limit state after successful request
     */
    reset(): void {
        if (this.isLimited) {
            console.log('[RateLimitManager] Rate limit cleared.');
            this.isLimited = false;
            this.backoffMs = 15000;
            this.retryCount = 0;

            useZeroLagStore.getState().setApiStatus('ok');
        }
    }
}

export const rateLimitManager = new RateLimitManager();

/**
 * Make HTTP request with retry logic and rate limit handling
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryCount = 0
): Promise<Response> {
    // Check rate limit before request
    await rateLimitManager.waitIfNeeded();

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        // Handle rate limiting (429)
        if (response.status === 429) {
            rateLimitManager.markRateLimited();

            // Retry after backoff
            await rateLimitManager.waitIfNeeded();
            return fetchWithRetry(url, options, retryCount); // Don't increment retryCount for 429s, rely on backoff
        }

        // Handle transient 5xx errors
        if (response.status >= 500) {
            if (retryCount < MAX_RETRIES) {
                const delay = RETRY_DELAYS[retryCount];
                console.warn(`[Binance API] Server error ${response.status}. Retrying in ${delay}ms...`);
                await sleep(delay);
                return fetchWithRetry(url, options, retryCount + 1);
            } else {
                throw new RestApiError(
                    `Server error ${response.status} after ${MAX_RETRIES} retries`,
                    response.status,
                    true, // isTransient
                    await response.text()
                );
            }
        }

        // Handle fatal 4xx errors (excluding 429)
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Binance API] Request failed: ${url} (${response.status})`);

            // Fatal error - do not retry
            throw new RestApiError(
                `HTTP ${response.status}: ${errorText}`,
                response.status,
                false, // isTransient = false
                errorText
            );
        }

        // Success - reset rate limit state
        rateLimitManager.reset();

        return response;
    } catch (error) {
        if (error instanceof RestApiError) {
            // Update store status for fatal errors
            if (!error.isTransient && error.statusCode !== 429) {
                useZeroLagStore.getState().setApiStatus('error');
            }
            throw error;
        }

        // Network errors - retry if we haven't exceeded max retries
        if (retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAYS[retryCount];
            console.warn(
                `[Binance API] Network error. Retrying in ${delay / 1000}s... (attempt ${retryCount + 1
                }/${MAX_RETRIES})`
            );
            await sleep(delay);
            return fetchWithRetry(url, options, retryCount + 1);
        }

        // Final network failure
        useZeroLagStore.getState().setApiStatus('error');
        throw new RestApiError(
            `Network error after ${MAX_RETRIES} retries: ${error instanceof Error ? error.message : 'Unknown error'}`,
            0, // Status 0 for network error
            true // Network errors are transient
        );
    }
}

/**
 * Generic fetchBinance wrapper
 */
export async function fetchBinance<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    const url = `${BASE_URL}${endpoint}${query}`;

    const response = await fetchWithRetry(url);
    return response.json();
}

/* =============================================
   API FUNCTIONS
   ============================================= */

/**
 * Fetch 24-hour ticker data for all symbols
 * 
 * Filters for USDT pairs with non-zero volume and sorts by volume descending.
 */
export async function fetch24hTickers(): Promise<BinanceTicker24h[]> {
    try {
        const data = await fetchBinance<BinanceTicker24h[]>('/fapi/v1/ticker/24hr');

        if (!Array.isArray(data)) {
            throw new RestApiError('Expected array of tickers');
        }

        // Filter for USDT symbols with volume > 0 and sort by volume descending
        const filtered = data
            .filter(t => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 0)
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

        console.log(`[Binance API] Fetched ${filtered.length} active USDT tickers (sorted by vol)`);
        return filtered;
    } catch (error) {
        console.error('[Binance API] Failed to fetch 24h tickers:', error);
        throw error;
    }
}

/**
 * Cache for exchange info to prevent excessive calls
 */
let exchangeInfoCache: {
    data: BinanceExchangeInfo;
    timestamp: number;
} | null = null;

const EXCHANGE_INFO_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch exchange information
 * 
 * Uses in-memory caching with 5-minute TTL.
 */
export async function fetchExchangeInfo(): Promise<BinanceExchangeInfo> {
    const now = Date.now();

    // Return cached data if valid
    if (exchangeInfoCache && (now - exchangeInfoCache.timestamp < EXCHANGE_INFO_TTL)) {
        return exchangeInfoCache.data;
    }

    try {
        const data = await fetchBinance<BinanceExchangeInfo>('/fapi/v1/exchangeInfo');

        // Update cache
        exchangeInfoCache = {
            data,
            timestamp: now
        };

        console.log(
            `[Binance API] Fetched exchange info with ${data.symbols?.length || 0} symbols`
        );
        return data;
    } catch (error) {
        console.error('[Binance API] Failed to fetch exchange info:', error);
        throw error;
    }
}

/**
 * Get active USDT futures symbols
 * 
 * Fetches exchange info and filters for TRADING status and USDT quote asset.
 * Maps to internal SymbolInfo format.
 */
export async function getActiveSymbols(): Promise<SymbolInfo[]> {
    const info = await fetchExchangeInfo();

    return info.symbols
        .filter(s =>
            s.status === 'TRADING' &&
            s.quoteAsset === 'USDT' &&
            s.contractType === 'PERPETUAL'
        )
        .map(s => ({
            symbol: s.symbol,
            baseAsset: s.baseAsset,
            quoteAsset: s.quoteAsset,
            marketType: 'futures',
            status: s.status
        }));
}

/**
 * Fetch kline/candlestick data for a symbol
 * 
 * Fetches raw klines, validates inputs, and converts to Candle objects.
 * Uses concurrency controller to limit parallel requests.
 * 
 * @param symbol - Trading symbol (e.g., 'BTCUSDT')
 * @param interval - Candlestick interval (e.g., '1h')
 * @param limit - Number of candles to fetch (1-1500)
 */
export async function fetchKlines(
    symbol: string,
    interval: Interval,
    limit: number
): Promise<Candle[]> {
    // Validation
    if (limit < 1 || limit > 1500) {
        throw new Error(`Invalid limit: ${limit}. Must be between 1 and 1500.`);
    }

    const validIntervals: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
    if (!validIntervals.includes(interval)) {
        throw new Error(`Invalid interval: ${interval}`);
    }

    try {
        const rawKlines = await concurrencyController.run(() => fetchBinance<BinanceKline[]>('/fapi/v1/klines', {
            symbol: symbol.toUpperCase(),
            interval,
            limit: limit.toString(),
        }));

        if (!Array.isArray(rawKlines)) {
            throw new RestApiError('Expected array of klines');
        }

        // Parse and sort
        const candles = rawKlines.map(kline => {
            const [
                openTime,
                open,
                high,
                low,
                close,
                volume,
                closeTime,
                quoteVolume,
                trades,
            ] = kline;

            return {
                symbol,
                interval,
                openTime,
                closeTime,
                open: parseFloat(open),
                high: parseFloat(high),
                low: parseFloat(low),
                close: parseFloat(close),
                volumeBase: parseFloat(volume),
                volumeQuote: parseFloat(quoteVolume),
                trades,
                isFinal: true // REST data is considered final
            };
        }).sort((a, b) => a.openTime - b.openTime);

        console.log(`[Binance API] Fetched ${candles.length} klines for ${symbol} (${interval})`);
        return candles;
    } catch (error) {
        console.error(
            `[Binance API] Failed to fetch klines for ${symbol}:`,
            error
        );
        throw error;
    }
}

/**
 * Fetch current server time
 */
export async function fetchServerTime(): Promise<number> {
    try {
        const data = await fetchBinance<{ serverTime: number }>('/fapi/v1/time');
        return data.serverTime;
    } catch (error) {
        console.error('[Binance API] Failed to fetch server time:', error);
        throw error;
    }
}

/**
 * Test connectivity to the REST API
 */
export async function testConnectivity(): Promise<boolean> {
    try {
        await fetchBinance('/fapi/v1/ping');
        console.log('[Binance API] Connectivity test successful');
        return true;
    } catch (error) {
        console.error('[Binance API] Connectivity test failed:', error);
        return false;
    }
}

/* =============================================
   DATA PARSING FUNCTIONS
   ============================================= */

/**
 * Parse raw kline data into Candle format.
 */
export function parseKlineToCandle(
    symbol: string,
    interval: Interval,
    rawKline: BinanceKline
): Candle {
    const [
        openTime,
        open,
        high,
        low,
        close,
        volume,
        closeTime,
        quoteVolume,
        trades,
    ] = rawKline;

    return {
        symbol,
        interval,
        openTime,
        closeTime,
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
        volumeBase: parseFloat(volume),
        volumeQuote: parseFloat(quoteVolume),
        trades,
        isFinal: closeTime < Date.now()
    };
}

/**
 * Parse multiple raw klines into Candle array.
 */
export function parseKlinesToCandles(
    symbol: string,
    interval: Interval,
    rawKlines: BinanceKline[]
): Candle[] {
    return rawKlines.map(kline => parseKlineToCandle(symbol, interval, kline));
}

/**
 * Parse exchange symbol data into SymbolInfo format.
 */
export function parseExchangeSymbolToInfo(exchangeSymbol: BinanceSymbolInfo): SymbolInfo {
    return {
        symbol: exchangeSymbol.symbol,
        baseAsset: exchangeSymbol.baseAsset,
        quoteAsset: exchangeSymbol.quoteAsset,
        marketType: 'futures',
        status: exchangeSymbol.status
    };
}

/**
 * Parse exchange info into SymbolInfo array.
 */
export function parseExchangeInfoToSymbols(exchangeInfo: BinanceExchangeInfo): SymbolInfo[] {
    return exchangeInfo.symbols
        .filter(s =>
            s.quoteAsset === 'USDT' &&
            s.contractType === 'PERPETUAL' &&
            s.status === 'TRADING'
        )
        .map(parseExchangeSymbolToInfo);
}

/**
 * Parse ticker data to extract key metrics.
 */
export function parseTickerMetrics(ticker: BinanceTicker24h) {
    return {
        symbol: ticker.symbol,
        lastPrice: parseFloat(ticker.lastPrice),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        volume24h: parseFloat(ticker.volume),
        quoteVolume24h: parseFloat(ticker.quoteVolume),
        priceChange24h: parseFloat(ticker.priceChange),
        priceChangePercent24h: parseFloat(ticker.priceChangePercent),
        openTime: ticker.openTime,
        closeTime: ticker.closeTime
    };
}

/**
 * Determine active symbols from ticker data
 * 
 * Filters for USDT pairs with volume > 0, sorts by volume, and returns top 100.
 */
export function determineActiveSymbols(tickers: BinanceTicker24h[]): string[] {
    if (!Array.isArray(tickers)) {
        console.warn('[Binance API] Invalid ticker data provided to determineActiveSymbols');
        return [];
    }

    return tickers
        .filter(t => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 0)
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 100)
        .map(t => t.symbol);
}

/**
 * Unit test for determineActiveSymbols (Manual execution)
 */
export function testDetermineActiveSymbols() {
    const mockTickers: BinanceTicker24h[] = [
        { symbol: 'BTCUSDT', quoteVolume: '1000', priceChange: '0', priceChangePercent: '0', weightedAvgPrice: '0', lastPrice: '0', lastQty: '0', openPrice: '0', highPrice: '0', lowPrice: '0', volume: '0', openTime: 0, closeTime: 0, firstId: 0, lastId: 0, count: 0 },
        { symbol: 'ETHUSDT', quoteVolume: '500', priceChange: '0', priceChangePercent: '0', weightedAvgPrice: '0', lastPrice: '0', lastQty: '0', openPrice: '0', highPrice: '0', lowPrice: '0', volume: '0', openTime: 0, closeTime: 0, firstId: 0, lastId: 0, count: 0 },
        { symbol: 'XRPUSDT', quoteVolume: '0', priceChange: '0', priceChangePercent: '0', weightedAvgPrice: '0', lastPrice: '0', lastQty: '0', openPrice: '0', highPrice: '0', lowPrice: '0', volume: '0', openTime: 0, closeTime: 0, firstId: 0, lastId: 0, count: 0 }, // Zero volume
        { symbol: 'BTCBUSD', quoteVolume: '2000', priceChange: '0', priceChangePercent: '0', weightedAvgPrice: '0', lastPrice: '0', lastQty: '0', openPrice: '0', highPrice: '0', lowPrice: '0', volume: '0', openTime: 0, closeTime: 0, firstId: 0, lastId: 0, count: 0 }, // Not USDT
        { symbol: 'SOLUSDT', quoteVolume: '800', priceChange: '0', priceChangePercent: '0', weightedAvgPrice: '0', lastPrice: '0', lastQty: '0', openPrice: '0', highPrice: '0', lowPrice: '0', volume: '0', openTime: 0, closeTime: 0, firstId: 0, lastId: 0, count: 0 },
    ];

    const result = determineActiveSymbols(mockTickers);
    console.log('[Test] determineActiveSymbols result:', result);

    const expected = ['BTCUSDT', 'SOLUSDT', 'ETHUSDT'];
    const passed = JSON.stringify(result) === JSON.stringify(expected);
    console.log('[Test] determineActiveSymbols passed:', passed);
    return passed;
}
