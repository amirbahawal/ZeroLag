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

export type ApiStatus = 'ok' | 'error' | 'loading';

export interface DataProvider {
    getUniverse(): Promise<SymbolInfo[]>;
    get24hTickers(): Promise<Ticker24h[]>;
    getHistoricalCandles(symbol: string, interval: Interval, limit: number): Promise<Candle[]>;
    subscribeToKlines(symbol: string, interval: Interval, callback: (candle: Candle) => void): () => void;
    getConnectionStatus(): { rest: ApiStatus; ws: boolean };
}

export class ClientBinanceProvider implements DataProvider {
    private wsManager: BinanceWebSocketManager;
    private activeRequests = 0;
    private readonly maxConcurrent = 4;
    private requestQueue: Array<() => void> = [];
    private restStatus: ApiStatus = 'ok';
    private universeCache: SymbolInfo[] | null = null;
    private universeCacheTime = 0;
    private readonly UNIVERSE_CACHE_TTL = 5 * 60 * 1000;

    constructor(wsManager?: BinanceWebSocketManager) {
        this.wsManager = wsManager || defaultWsManager;
    }

    public async getUniverse(): Promise<SymbolInfo[]> {
        const now = Date.now();
        if (this.universeCache && (now - this.universeCacheTime < this.UNIVERSE_CACHE_TTL)) {
            return this.universeCache;
        }

        try {
            const info = await this.getExchangeInfo();
            const filteredSymbols = info.symbols
                .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING') as unknown as SymbolInfo[];

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
        if (!symbol || !interval || !limit || limit <= 0 || limit > 1500) return [];

        try {
            const candles = await this.getKlinesQueued(symbol, interval, limit);
            this.restStatus = 'ok';
            return candles;
        } catch (e) {
            this.restStatus = 'error';
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

    public async get24hTickers(): Promise<Ticker24h[]> {
        try {
            const rawTickers = await fetch24hTickers();
            const universe = await this.getUniverse();
            const validSymbols = new Set(universe.map(s => s.symbol));

            const processedTickers = rawTickers
                .filter(t => validSymbols.has(t.symbol))
                .map(t => ({
                    ...t,
                    symbol: t.symbol,
                    volume24h: parseFloat(t.volume),
                    quoteVolume24h: parseFloat(t.quoteVolume),
                    high24h: parseFloat(t.highPrice),
                    low24h: parseFloat(t.lowPrice),
                    lastPrice: parseFloat(t.lastPrice),
                })) as unknown as Ticker24h[];

            this.restStatus = 'ok';
            return processedTickers;
        } catch (e) {
            this.restStatus = 'error';
            throw e;
        }
    }

    public async getExchangeInfo(): Promise<ExchangeInfo> {
        return fetchExchangeInfo();
    }

    public async getKlines(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
        return fetchKlines(symbol, interval, limit);
    }

    public async getKlinesQueued(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
        await this.acquireSlot();
        try {
            return await fetchKlines(symbol, interval, limit);
        } finally {
            this.releaseSlot();
        }
    }

    public onKline(callback: (candle: Candle) => void): () => void {
        return this.wsManager.onKline(callback);
    }

    private async acquireSlot(): Promise<void> {
        if (this.activeRequests < this.maxConcurrent) {
            this.activeRequests++;
            return;
        }
        return new Promise<void>((resolve) => this.requestQueue.push(resolve));
    }

    private releaseSlot(): void {
        const nextRequest = this.requestQueue.shift();
        if (nextRequest) {
            nextRequest();
        } else {
            this.activeRequests--;
        }
    }

    public async getServerTime(): Promise<number> {
        return fetchServerTime();
    }

    public async testConnection(): Promise<boolean> {
        return testConnectivity();
    }

    public async connectWebSocket(): Promise<void> {
        return this.wsManager.connect();
    }

    public async subscribeCandles(symbol: string, interval: Interval, callback: CandleCallback): Promise<void> {
        return this.wsManager.subscribeWithCallback(symbol, interval, callback);
    }

    public async subscribe(streams: string[]): Promise<void> {
        return this.wsManager.subscribe(streams);
    }

    public async unsubscribe(streams: string[]): Promise<void> {
        return this.wsManager.unsubscribe(streams);
    }

    public buildStreamName(symbol: string, interval: Interval): string {
        return this.wsManager.buildStreamName(symbol, interval);
    }

    public async unsubscribeCandles(symbol: string, interval: Interval): Promise<void> {
        return this.wsManager.unsubscribeWithCallback(symbol, interval);
    }

    public disconnectWebSocket(): void {
        this.wsManager.disconnect();
    }

    public parseKlineToCandle(symbol: string, interval: Interval, kline: RawKline): Candle {
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
            isFinal: kline[6] < Date.now(),
        };
    }

    public parseKlinesToCandles(symbol: string, interval: Interval, klines: RawKline[]): Candle[] {
        return klines.map((kline) => this.parseKlineToCandle(symbol, interval, kline));
    }

    public filterFuturesUSDTSymbols(symbols: ExchangeSymbol[]): ExchangeSymbol[] {
        return symbols.filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING');
    }
}

export const defaultProvider = new ClientBinanceProvider();

export { BinanceApiError, RateLimitError };
