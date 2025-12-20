import type { Interval, Candle, SymbolInfo } from '../core/types';
import { rateLimitHandler } from './RateLimitHandler';

export type BinanceKline = [
    number, string, string, string, string, string, number, string, number, string, string, string
];
export type RawKline = BinanceKline;

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

export interface BinanceSymbolInfo {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
    contractType: string;
    [key: string]: unknown;
}
export type ExchangeSymbol = BinanceSymbolInfo;

export interface BinanceExchangeInfo {
    timezone: string;
    serverTime: number;
    symbols: BinanceSymbolInfo[];
}
export type ExchangeInfo = BinanceExchangeInfo;

export const BINANCE_FUTURES_BASE = 'https://fapi.binance.com';
export const BASE_URL = import.meta.env.DEV ? '' : BINANCE_FUTURES_BASE;

export class RestApiError extends Error {
    public statusCode?: number;
    public isTransient: boolean;
    public response?: unknown;

    constructor(message: string, statusCode?: number, isTransient: boolean = false, response?: unknown) {
        super(message);
        this.name = 'RestApiError';
        this.statusCode = statusCode;
        this.isTransient = isTransient;
        this.response = response;
    }
}

export class RateLimitError extends RestApiError {
    constructor(message: string) {
        super(message, 429, true);
        this.name = 'RateLimitError';
    }
}

export { RestApiError as BinanceApiError };

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

export async function fetchBinance<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    const url = `${BASE_URL}${endpoint}${query}`;

    return rateLimitHandler.executeRequest<T>(() => fetch(url, {
        headers: {
            'Content-Type': 'application/json',
        }
    }));
}

export async function fetch24hTickers(): Promise<BinanceTicker24h[]> {
    try {
        const data = await fetchBinance<BinanceTicker24h[]>('/fapi/v1/ticker/24hr');
        if (!Array.isArray(data)) throw new RestApiError('Expected array of tickers');
        return data;
    } catch (error) {
        console.error('[Binance API] Failed to fetch 24h tickers:', error);
        throw error;
    }
}

let exchangeInfoCache: { data: BinanceExchangeInfo; timestamp: number } | null = null;
const EXCHANGE_INFO_TTL = 5 * 60 * 1000;

export async function fetchExchangeInfo(): Promise<BinanceExchangeInfo> {
    const now = Date.now();
    if (exchangeInfoCache && (now - exchangeInfoCache.timestamp < EXCHANGE_INFO_TTL)) {
        return exchangeInfoCache.data;
    }

    try {
        const data = await fetchBinance<BinanceExchangeInfo>('/fapi/v1/exchangeInfo');
        exchangeInfoCache = { data, timestamp: now };
        return data;
    } catch (error) {
        console.error('[Binance API] Failed to fetch exchange info:', error);
        throw error;
    }
}

export async function getActiveSymbols(): Promise<SymbolInfo[]> {
    const info = await fetchExchangeInfo();
    return info.symbols.map(s => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        marketType: 'futures',
        status: s.status
    }));
}

export async function fetchKlines(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
    if (limit < 1 || limit > 1500) throw new Error(`Invalid limit: ${limit}`);
    const validIntervals: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
    if (!validIntervals.includes(interval)) throw new Error(`Invalid interval: ${interval}`);

    try {
        const rawKlines = await concurrencyController.run(() => fetchBinance<BinanceKline[]>('/fapi/v1/klines', {
            symbol: symbol.toUpperCase(),
            interval,
            limit: limit.toString(),
        }));

        if (!Array.isArray(rawKlines)) throw new RestApiError('Expected array of klines');

        return rawKlines.map(kline => {
            const [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades] = kline;
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
                isFinal: true
            };
        }).sort((a, b) => a.openTime - b.openTime);
    } catch (error) {
        console.error(`[Binance API] Failed to fetch klines for ${symbol}:`, error);
        throw error;
    }
}

export async function fetchServerTime(): Promise<number> {
    try {
        const data = await fetchBinance<{ serverTime: number }>('/fapi/v1/time');
        return data.serverTime;
    } catch (error) {
        console.error('[Binance API] Failed to fetch server time:', error);
        throw error;
    }
}

export async function testConnectivity(): Promise<boolean> {
    try {
        await fetchBinance('/fapi/v1/ping');
        return true;
    } catch (error) {
        console.error('[Binance API] Connectivity test failed:', error);
        return false;
    }
}

export function parseKlineToCandle(symbol: string, interval: Interval, rawKline: BinanceKline): Candle {
    const [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades] = rawKline;
    return {
        symbol, interval, openTime, closeTime,
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

export function parseKlinesToCandles(symbol: string, interval: Interval, rawKlines: BinanceKline[]): Candle[] {
    return rawKlines.map(kline => parseKlineToCandle(symbol, interval, kline));
}

export function parseExchangeSymbolToInfo(exchangeSymbol: BinanceSymbolInfo): SymbolInfo {
    return {
        symbol: exchangeSymbol.symbol,
        baseAsset: exchangeSymbol.baseAsset,
        quoteAsset: exchangeSymbol.quoteAsset,
        marketType: 'futures',
        status: exchangeSymbol.status
    };
}

export function parseExchangeInfoToSymbols(exchangeInfo: BinanceExchangeInfo): SymbolInfo[] {
    return exchangeInfo.symbols
        .filter(s => s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL' && s.status === 'TRADING')
        .map(parseExchangeSymbolToInfo);
}

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

export function determineActiveSymbols(tickers: BinanceTicker24h[]): string[] {
    if (!Array.isArray(tickers)) return [];
    return tickers
        .filter(t => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 0)
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 100)
        .map(t => t.symbol);
}
