/**
 * Binance Futures REST API Client
 * 
 * Provides functions for fetching market data from Binance Futures API
 * with built-in retry logic and rate limit handling.
 */

import type { Interval } from '../core/types';

/* =============================================
   TYPES
   ============================================= */

/** Raw kline/candlestick data from Binance API */
export type RawKline = [
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

/** 24h ticker data from Binance API */
export interface Ticker24h {
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

/** Exchange info symbol data */
export interface ExchangeSymbol {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
    contractType: string;
    // ... other fields
    [key: string]: unknown;
}

/** Exchange info response */
export interface ExchangeInfo {
    timezone: string;
    serverTime: number;
    symbols: ExchangeSymbol[];
}

/* =============================================
   CONSTANTS
   ============================================= */

/** Binance Futures API base URL */
/** Binance Futures API base URL */
export const BASE_URL = import.meta.env.DEV ? '' : 'https://fapi.binance.com';

/** Retry delays for exponential backoff (milliseconds) */
const RETRY_DELAYS = [1000, 2000, 5000]; // 1s, 2s, 5s

/** Maximum number of retry attempts */
const MAX_RETRIES = RETRY_DELAYS.length;

/* =============================================
   ERROR TYPES
   ============================================= */

class BinanceApiError extends Error {
    statusCode?: number;
    response?: unknown;

    constructor(
        message: string,
        statusCode?: number,
        response?: unknown
    ) {
        super(message);
        this.name = 'BinanceApiError';
        this.statusCode = statusCode;
        this.response = response;
    }
}

class RateLimitError extends BinanceApiError {
    constructor(message: string) {
        super(message, 429);
        this.name = 'RateLimitError';
    }
}

export { BinanceApiError, RateLimitError };

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
 * Make HTTP request with retry logic
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryCount = 0
): Promise<Response> {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
            },
        });

        // DEBUG LOGGING
        if (!response.ok) {
            console.error(`[Binance API] Request failed: ${url} (${response.status})`);
        }

        // Handle rate limiting (429)
        if (response.status === 429) {
            if (retryCount < MAX_RETRIES) {
                const delay = RETRY_DELAYS[retryCount];
                console.warn(
                    `[Binance API] Rate limit hit. Retrying in ${delay / 1000}s... (attempt ${retryCount + 1
                    }/${MAX_RETRIES})`
                );
                await sleep(delay);
                return fetchWithRetry(url, options, retryCount + 1);
            } else {
                throw new RateLimitError(
                    'Rate limit exceeded and max retries reached'
                );
            }
        }

        // Handle other HTTP errors
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Binance API] Error details:`, errorText);
            throw new BinanceApiError(
                `HTTP ${response.status}: ${errorText}`,
                response.status,
                errorText
            );
        }

        return response;
    } catch (error) {
        if (error instanceof BinanceApiError) {
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

        throw new BinanceApiError(
            `Network error after ${MAX_RETRIES} retries: ${error instanceof Error ? error.message : 'Unknown error'
            }`
        );
    }
}

/* =============================================
   API FUNCTIONS
   ============================================= */

/**
 * Fetch 24-hour ticker data for all symbols
 * 
 * @returns Array of ticker objects
 * @throws {BinanceApiError} If the request fails
 * 
 * @example
 * const tickers = await fetch24hTickers();
 * console.log(`Fetched ${tickers.length} tickers`);
 */
export async function fetch24hTickers(): Promise<Ticker24h[]> {
    const url = `${BASE_URL}/fapi/v1/ticker/24hr`;

    try {
        const response = await fetchWithRetry(url);
        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new BinanceApiError('Expected array of tickers');
        }

        console.log(`[Binance API] Fetched ${data.length} 24h tickers`);
        return data;
    } catch (error) {
        console.error('[Binance API] Failed to fetch 24h tickers:', error);
        throw error;
    }
}

/**
 * Fetch exchange information (symbols, trading rules, etc.)
 * 
 * @returns Exchange info object
 * @throws {BinanceApiError} If the request fails
 * 
 * @example
 * const info = await fetchExchangeInfo();
 * console.log(`Exchange has ${info.symbols.length} symbols`);
 */
export async function fetchExchangeInfo(): Promise<ExchangeInfo> {
    const url = `${BASE_URL}/fapi/v1/exchangeInfo`;

    try {
        const response = await fetchWithRetry(url);
        const data = await response.json();

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
 * Fetch kline/candlestick data for a symbol
 * 
 * @param symbol - Trading symbol (e.g., 'BTCUSDT')
 * @param interval - Candlestick interval (e.g., '1h')
 * @param limit - Number of candles to fetch (max 1500)
 * @returns Array of kline data arrays
 * @throws {BinanceApiError} If the request fails
 * 
 * @example
 * const klines = await fetchKlines('BTCUSDT', '1h', 100);
 * console.log(`Fetched ${klines.length} candles`);
 */
export async function fetchKlines(
    symbol: string,
    interval: Interval,
    limit: number
): Promise<RawKline[]> {
    const params = new URLSearchParams({
        symbol: symbol.toUpperCase(),
        interval,
        limit: limit.toString(),
    });

    const url = `${BASE_URL}/fapi/v1/klines?${params}`;

    try {
        const response = await fetchWithRetry(url);
        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new BinanceApiError('Expected array of klines');
        }

        console.log(`[Binance API] Fetched ${data.length} klines for ${symbol} (${interval})`);
        return data;
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
 * Useful for time synchronization
 * 
 * @returns Server timestamp in milliseconds
 * @throws {BinanceApiError} If the request fails
 */
export async function fetchServerTime(): Promise<number> {
    const url = `${BASE_URL}/fapi/v1/time`;

    try {
        const response = await fetchWithRetry(url);
        const data = await response.json();

        return data.serverTime;
    } catch (error) {
        console.error('[Binance API] Failed to fetch server time:', error);
        throw error;
    }
}

/**
 * Test connectivity to the REST API
 * 
 * @returns True if connection successful
 */
export async function testConnectivity(): Promise<boolean> {
    const url = `${BASE_URL}/fapi/v1/ping`;

    try {
        await fetchWithRetry(url);
        console.log('[Binance API] Connectivity test successful');
        return true;
    } catch (error) {
        console.error('[Binance API] Connectivity test failed:', error);
        return false;
    }
}
