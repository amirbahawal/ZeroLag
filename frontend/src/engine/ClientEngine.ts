import { ClientBinanceProvider, defaultProvider } from '../data/clientProvider';
import { useZeroLagStore } from '../state/useZeroLagStore';
import { BufferManager } from './modules/BufferManager';
import { StateSyncManager } from './modules/StateSyncManager';
import type { ZeroLagState } from '../state/useZeroLagStore';
import type { Interval, SymbolMetrics, Candle, SymbolInfo, SortMode } from '../core/types';
import { KLINE_FETCH_LIMITS } from '../core/intervals';
import { computeSymbolMetrics } from '../core/metrics';
import { computeRankings } from '../core/ranking';
import { type Ticker24h, determineActiveSymbols } from '../data/binanceRest';

const REQUIRED_INTERVALS: Record<SortMode, Interval[]> = {
    'range_5m': ['5m'],
    'range_15m': ['15m'],
    'range_1h': ['1h'],
    'range_4h': ['4h'],
    'dext': [],
    'volume_15m': ['15m'],
    'volume_24h': [],
    'gvolume': ['15m', '4h']
};

export class ClientEngine {
    private provider: ClientBinanceProvider;
    public bufferManager: BufferManager;
    private activeSymbols: string[] = [];
    private tickerMap = new Map<string, Ticker24h>();
    private subscriptions = new Set<string>();
    private updateInterval: ReturnType<typeof setInterval> | null = null;
    private isRunning: boolean = false;
    private readonly UPDATE_INTERVAL_MS = 30000;
    private metricsUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly METRICS_UPDATE_INTERVAL = 2000;
    private stateSyncManager: StateSyncManager;

    private get store(): ZeroLagState {
        return useZeroLagStore.getState();
    }

    constructor(provider?: ClientBinanceProvider) {
        this.provider = provider || defaultProvider;
        this.bufferManager = new BufferManager();
        this.stateSyncManager = new StateSyncManager(this.store);
    }

    public async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        try {
            await this.init();
        } catch (error) {
            this.isRunning = false;
            throw error;
        }
    }

    public async init(): Promise<void> {
        try {
            const tickers = await this.provider.get24hTickers();
            this.activeSymbols = determineActiveSymbols(tickers);

            for (const ticker of tickers) {
                if (ticker.symbol) this.tickerMap.set(ticker.symbol, ticker);
            }

            this.store.setActiveSymbols(this.activeSymbols);

            const exchangeInfo = await this.provider.getExchangeInfo();
            const futuresSymbols = this.provider.filterFuturesUSDTSymbols(exchangeInfo.symbols);

            const symbolRecord: Record<string, SymbolInfo> = {};
            futuresSymbols.forEach(s => {
                if (this.activeSymbols.includes(s.symbol)) {
                    symbolRecord[s.symbol] = {
                        symbol: s.symbol,
                        baseAsset: s.baseAsset,
                        quoteAsset: s.quoteAsset,
                        marketType: 'futures',
                        status: s.status
                    };
                }
            });
            this.store.setSymbols(symbolRecord);

            this.initializePlaceholderMetrics(symbolRecord);

            const visibleCount = this.store.count;
            const visibleSymbols = this.activeSymbols.slice(0, visibleCount);
            const backgroundSymbols = this.activeSymbols.slice(visibleCount);

            await this.loadRequiredIntervals(visibleSymbols, this.store.interval);

            this.provider.onKline(this.handleCandleUpdate.bind(this));
            await this.provider.connectWebSocket();
            this.store.setWsConnected(true);

            await this.syncSubscriptions();

            this.startBackgroundEnrichment(visibleSymbols, backgroundSymbols, this.store.interval);
            this.startPeriodicUpdates();
            this.handleStoreChanges();

            this.store.setApiStatus('ok');
        } catch (error) {
            this.store.setApiStatus('error');
            throw error;
        }
    }

    public stop(): void {
        if (!this.isRunning) return;

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        this.provider.disconnectWebSocket();
        this.store.setWsConnected(false);
        this.isRunning = false;
    }

    public scheduleMetricsUpdate(): void {
        if (this.metricsUpdateTimer === null) {
            this.metricsUpdateTimer = setTimeout(() => {
                this.recomputeAllMetrics();
                this.metricsUpdateTimer = null;
            }, this.METRICS_UPDATE_INTERVAL);
        }
    }

    private initializePlaceholderMetrics(symbolRecord: Record<string, SymbolInfo>): void {
        const now = Date.now();
        const initialMetrics: Record<string, SymbolMetrics> = {};

        this.activeSymbols.forEach(symbol => {
            const ticker = this.tickerMap.get(symbol);
            const volume24h = ticker?.quoteVolume ? parseFloat(ticker.quoteVolume) : 0;
            const lastPrice = ticker?.lastPrice ? parseFloat(ticker.lastPrice) : 0;
            const info = symbolRecord[symbol] || {
                symbol,
                baseAsset: symbol.replace('USDT', ''),
                quoteAsset: 'USDT',
                marketType: 'futures' as const,
                status: 'TRADING'
            };

            initialMetrics[symbol] = {
                info,
                lastPrice,
                lastUpdateTs: now,
                ranges: {
                    '5m': { window: '5m', high: 0, low: 0, abs: 0, pct: 0, inactive: true },
                    '15m': { window: '15m', high: 0, low: 0, abs: 0, pct: 0, inactive: true },
                    '1h': { window: '1h', high: 0, low: 0, abs: 0, pct: 0, inactive: true },
                    '4h': { window: '4h', high: 0, low: 0, abs: 0, pct: 0, inactive: true },
                },
                volume: {
                    '15m': { window: '15m', base: 0, quote: 0 },
                    '4h': { window: '4h', base: 0, quote: 0 },
                    '24h': { window: '24h', base: 0, quote: volume24h },
                },
                growth: {
                    gVolume: {
                        currentWindow: '15m', baselineWindow: '4h',
                        baselinePer15m: 0, current: 0, ratio: 0, delta: 0
                    }
                },
                dailyExtremum: {
                    high24h: 0, low24h: 0, lastPrice,
                    distToHighPct: 0, distToLowPct: 0,
                    nearestSide: 'none', score: Number.POSITIVE_INFINITY
                },
                currentSortScore: 0
            };
        });

        for (const [symbol, metrics] of Object.entries(initialMetrics)) {
            this.store.upsertMetrics(symbol, metrics);
        }

        this.store.setRankings(computeRankings(initialMetrics));
    }

    private async seedCandleBuffers(
        symbols: string[],
        interval: Interval,
        customBatchDelay?: number
    ): Promise<void> {
        if (symbols.length === 0) return;

        const limit = KLINE_FETCH_LIMITS[interval];
        const batchSize = 4;
        const batchDelay = customBatchDelay ?? 100;

        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const batchMetrics: Record<string, SymbolMetrics> = {};

            await Promise.all(batch.map(async (symbol: string) => {
                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        const candles = await this.provider.getHistoricalCandles(symbol, interval, limit);
                        if (candles.length > 0) {
                            this.bufferManager.setBuffer(symbol, interval, candles);
                            const metrics = this.computeMetricsForSymbol(symbol);
                            if (metrics) batchMetrics[symbol] = metrics;
                            break;
                        }
                    } catch (error) {
                        if (attempt === 1) await new Promise(r => setTimeout(r, 2000));
                    }
                }
            }));

            if (Object.keys(batchMetrics).length > 0) {
                for (const [symbol, metric] of Object.entries(batchMetrics)) {
                    this.store.upsertMetrics(symbol, metric);
                }
            }

            if (i + batchSize < symbols.length) {
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
        }
    }

    private async loadRequiredIntervals(
        symbols: string[],
        chartInterval: Interval,
        isBackground: boolean = false,
        customBatchDelay?: number
    ): Promise<void> {
        if (!isBackground) {
            await this.seedCandleBuffers(symbols, chartInterval, customBatchDelay);
            return;
        }

        const metricIntervals: Interval[] = ['5m', '15m', '1h', '4h'];
        const intervalsToLoad = metricIntervals.filter(i => i !== chartInterval);
        if (intervalsToLoad.length === 0) return;

        const batchDelay = customBatchDelay ?? 1000;
        for (let i = 0; i < intervalsToLoad.length; i++) {
            await this.seedCandleBuffers(symbols, intervalsToLoad[i], batchDelay);
            if (i < intervalsToLoad.length - 1) await new Promise(r => setTimeout(r, 1000));
        }
    }

    private async startBackgroundEnrichment(
        visibleSymbols: string[],
        backgroundSymbols: string[],
        chartInterval: Interval
    ): Promise<void> {
        try {
            await this.loadRequiredIntervals(visibleSymbols, chartInterval, true);
            await new Promise(r => setTimeout(r, 1000));
            await this.loadRequiredIntervals(backgroundSymbols, chartInterval, false, 500);
            await new Promise(r => setTimeout(r, 1000));
            await this.loadRequiredIntervals(backgroundSymbols, chartInterval, true, 500);
        } catch (error) {
            console.error('[ClientEngine] Background enrichment failed:', error);
        }
    }

    private handleCandleUpdate(candle: Candle): void {
        this.bufferManager.updateCandle(candle.symbol, candle.interval, candle);
        this.scheduleMetricsUpdate();
    }

    private handleStoreChanges(): void {
        let previousInterval = this.store.interval;
        let previousSortMode = this.store.sortMode;
        let previousCount = this.store.count;

        useZeroLagStore.subscribe((state) => {
            if (!this.isRunning) return;

            if (state.interval !== previousInterval) {
                const oldInterval = previousInterval;
                previousInterval = state.interval;
                this.onIntervalChange(state.interval, oldInterval).catch(console.error);
            }

            if (state.sortMode !== previousSortMode) {
                previousSortMode = state.sortMode;
                this.onSortModeChange(state.sortMode);
            }

            if (state.count !== previousCount) {
                previousCount = state.count;
                this.onCountChange();
            }
        });
    }

    private onSortModeChange(newMode: SortMode): void {
        if (newMode.startsWith('range_')) {
            const rangeInterval = newMode.replace('range_', '') as Interval;
            if (this.store.interval !== rangeInterval) this.store.setInterval(rangeInterval);
        } else if (newMode === 'volume_15m' || newMode === 'gvolume') {
            if (this.store.interval !== '15m') this.store.setInterval('15m');
        }

        const rankings = this.store.rankings[newMode] || [];
        const visibleSymbols = rankings.length > 0
            ? rankings.slice(0, this.store.count).map(r => r.info.symbol)
            : this.activeSymbols.slice(0, this.store.count);

        visibleSymbols.forEach(symbol => {
            this.ensureRequiredIntervals(symbol, newMode).catch(console.error);
        });

        this.syncSubscriptions().catch(console.error);
    }

    private async onIntervalChange(newInterval: Interval, oldInterval: Interval): Promise<void> {
        await this.unsubscribeAll();

        const metricIntervals: Interval[] = ['5m', '15m', '4h'];
        if (!metricIntervals.includes(oldInterval)) {
            for (const symbol of this.activeSymbols) {
                this.bufferManager.clearInterval(symbol, oldInterval);
            }
        }

        const visibleSymbols = this.getVisibleSymbols();
        const symbolsNeedingData = visibleSymbols.filter(s => !this.bufferManager.hasBuffer(s, newInterval));

        if (symbolsNeedingData.length > 0) {
            await this.seedCandleBuffers(symbolsNeedingData, newInterval);
        }

        this.recomputeAllMetrics();
        await this.syncSubscriptions(true);
    }

    private getVisibleSymbols(): string[] {
        const rankings = this.store.rankings[this.store.sortMode] || [];
        return rankings.slice(0, this.store.count).map(r => r.info.symbol);
    }

    private onCountChange(): void {
        this.syncSubscriptions().catch(console.error);
    }

    private async syncSubscriptions(forceUnsubscribe: boolean = false): Promise<void> {
        if (!this.isRunning) return;

        const interval = this.store.interval;
        const targetSubs = new Set(this.activeSymbols.map(s => `${s}:${interval}`));

        for (const sub of this.subscriptions) {
            if (!targetSubs.has(sub) || forceUnsubscribe) {
                const [symbol, subInterval] = sub.split(':');
                this.provider.unsubscribeCandles(symbol, subInterval as Interval);
                this.subscriptions.delete(sub);
            }
        }

        for (const sub of targetSubs) {
            if (!this.subscriptions.has(sub)) {
                const [symbol, subInterval] = sub.split(':');
                this.subscriptions.add(sub);
                this.provider.subscribeCandles(symbol, subInterval as Interval, () => { });
            }
        }
    }

    private async unsubscribeAll(): Promise<void> {
        for (const sub of this.subscriptions) {
            const [symbol, interval] = sub.split(':');
            this.provider.unsubscribeCandles(symbol, interval as Interval);
        }
        this.subscriptions.clear();
    }

    private async ensureRequiredIntervals(symbol: string, mode: SortMode): Promise<void> {
        const intervals = REQUIRED_INTERVALS[mode];
        for (const interval of intervals) {
            if (!this.bufferManager.hasBuffer(symbol, interval)) {
                await this.seedCandleBuffers([symbol], interval);
            }
        }
    }

    private recomputeAllMetrics(): void {
        const visibleSymbols = this.getVisibleSymbols();
        this.stateSyncManager.setVisibleSymbols(visibleSymbols);

        const metrics: Record<string, SymbolMetrics> = {};
        for (const symbol of this.activeSymbols) {
            const m = this.computeMetricsForSymbol(symbol);
            if (m) metrics[symbol] = m;
        }

        this.stateSyncManager.queueMetricsUpdate(metrics);
        this.stateSyncManager.queueRankingsUpdate(computeRankings(metrics));
    }

    private computeMetricsForSymbol(symbol: string): SymbolMetrics | null {
        const ticker = this.tickerMap.get(symbol);
        if (!ticker) return null;

        const info = this.store.symbols[symbol] || {
            symbol,
            baseAsset: symbol.replace('USDT', ''),
            quoteAsset: 'USDT',
            marketType: 'futures' as const,
            status: 'TRADING'
        };

        const candleMap = new Map<Interval, Candle[]>();
        const intervals: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
        for (const interval of intervals) {
            candleMap.set(interval, this.bufferManager.getBuffer(symbol, interval));
        }

        return computeSymbolMetrics(info, candleMap, ticker as any);
    }

    private startPeriodicUpdates(): void {
        this.updateInterval = setInterval(() => {
            this.recomputeAllMetrics();
        }, this.UPDATE_INTERVAL_MS);
    }

    public isEngineRunning(): boolean {
        return this.isRunning;
    }
}

export const defaultEngine = new ClientEngine();
