/**
 * Client Engine
 * 
 * Main data orchestration engine for ZeroLag.
 * Manages data fetching, WebSocket connections, metrics computation, and state updates.
 */

import { ClientBinanceProvider, defaultProvider } from '../data/clientProvider';
import { useZeroLagStore } from '../state/useZeroLagStore';
import { BufferManager } from './modules/BufferManager';
import { StateSyncManager } from './modules/StateSyncManager';
import type { ZeroLagState } from '../state/useZeroLagStore';
import type { Interval, SymbolMetrics, Candle, SymbolInfo } from '../core/types';
import { KLINE_FETCH_LIMITS } from '../core/intervals';
import {
    computeSymbolMetrics,
} from '../core/metrics';
import { computeRankings } from '../core/ranking';
import { type Ticker24h, determineActiveSymbols } from '../data/binanceRest';
import type { SortMode } from '../core/types';

/* =============================================
   CONSTANTS
   ============================================= */

/**
 * Required intervals for each sort mode
 * 
 * Maps each sort mode to the intervals it needs for metric computation.
 * Empty arrays indicate the mode uses ticker data only.
 */
const REQUIRED_INTERVALS: Record<SortMode, Interval[]> = {
    'range_5m': ['5m'],
    'range_15m': ['15m'],
    'range_1h': ['1h'],
    'range_4h': ['4h'],
    'dext': [],  // uses ticker data
    'volume_15m': ['15m'],
    'volume_24h': [],  // uses ticker data
    'gvolume': ['15m', '4h']
};

/* =============================================
   CLIENT ENGINE CLASS
   ============================================= */

/**
 * Client-side engine for data orchestration
 * 
 * Coordinates all data operations:
 * - Fetching market data from Binance
 * - Managing WebSocket connections
 * - Computing metrics
 * - Updating application state
 * 
 * @example
 * const engine = new ClientEngine();
 * await engine.start();
 */
export class ClientEngine {
    /* =============================================
       PROPERTIES
       ============================================= */

    /** Binance data provider */
    private provider: ClientBinanceProvider;

    /** Buffer Manager for candle storage */
    public bufferManager: BufferManager;

    /** Zustand store instance */
    private get store(): ZeroLagState {
        return useZeroLagStore.getState();
    }

    /** Currently tracked symbols */
    private activeSymbols: string[] = [];

    /** Map of 24h ticker data */
    private tickerMap = new Map<string, Ticker24h>();

    /** Currently subscribed symbols (symbol:interval) */
    private subscriptions = new Set<string>();

    /** Periodic update timer */
    private updateInterval: ReturnType<typeof setInterval> | null = null;

    /** Engine running state */
    private isRunning: boolean = false;

    /** Update interval duration (milliseconds) */
    private readonly UPDATE_INTERVAL_MS = 30000; // 30 seconds

    /** Debounced metrics update timer */
    private metricsUpdateTimer: ReturnType<typeof setTimeout> | null = null;

    /** Metrics update debounce interval (milliseconds) */
    private readonly METRICS_UPDATE_INTERVAL = 2000; // 2 seconds

    /* =============================================
       CONSTRUCTOR
       ============================================= */

    /** State Sync Manager for batched updates */
    private stateSyncManager: StateSyncManager;

    /**
     * Create a new ClientEngine instance
     * 
     * @param provider - Optional custom Binance provider
     */
    constructor(
        provider?: ClientBinanceProvider
    ) {
        this.provider = provider || defaultProvider;
        this.bufferManager = new BufferManager();
        this.stateSyncManager = new StateSyncManager(this.store);

        console.log('[ClientEngine] Initialized');
    }

    /* =============================================
       CORE LIFECYCLE METHODS
       ============================================= */

    /**
     * Start the engine
     * 
     * Initializes data fetching, WebSocket connections, and periodic updates.
     * 
     * @throws {Error} If connectivity test fails
     * 
     * @example
     * await engine.start();
     */
    public async start(): Promise<void> {
        if (this.isRunning) {
            console.warn('[ClientEngine] Already running');
            return;
        }

        this.isRunning = true;
        try {
            await this.init();
        } catch (error) {
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Initialize the engine
     * 
     * Runs the complete bootstrap pipeline:
     * 1. Update store: set loading state
     * 2. Fetch 24h tickers → determine active symbols → update store
     * 3. Fetch exchange info → build symbol map → update store
     * 4. Seed candles for visible symbols → update store progressively
     * 5. Connect WebSocket → subscribe to visible symbols → update store
     * 6. Background: seed remaining symbols
     * 7. Start metrics update timer
     */
    public async init(): Promise<void> {
        console.log('[ClientEngine] Initializing bootstrap pipeline...');

        try {
            // 2. Fetch 24h tickers → determine active symbols (Top 100) → update store
            const tickers = await this.provider.get24hTickers();
            this.activeSymbols = determineActiveSymbols(tickers);

            for (const ticker of tickers) {
                if (ticker.symbol) {
                    this.tickerMap.set(ticker.symbol, ticker);
                }
            }

            this.store.setActiveSymbols(this.activeSymbols);
            console.log(`[ClientEngine] Identified ${this.activeSymbols.length} active symbols`);

            // 3. Fetch exchange info → build symbol map
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

            // Initialize rankings with placeholder metrics so real symbol labels appear
            this.initializePlaceholderMetrics(symbolRecord);

            // 4. Seed candles for visible symbols (Critical for initial charts)
            const visibleCount = this.store.count;
            const visibleSymbols = this.activeSymbols.slice(0, visibleCount);
            const backgroundSymbols = this.activeSymbols.slice(visibleCount);

            // Fetch 500 bars for visible symbols (chart interval)
            await this.loadRequiredIntervals(visibleSymbols, this.store.interval);

            // 5. Open WebSocket connection & Subscribe
            // Register global kline listener
            this.provider.onKline(this.handleCandleUpdate.bind(this));

            await this.provider.connectWebSocket();
            this.store.setWsConnected(true);

            // syncSubscriptions will handle subscribing to all 100 active symbols
            await this.syncSubscriptions();

            // 6. Background enrichment (non-blocking)
            this.startBackgroundEnrichment(visibleSymbols, backgroundSymbols, this.store.interval);

            // 7. Start periodic updates
            this.startPeriodicUpdates();
            this.handleStoreChanges();

            this.store.setApiStatus('ok');
            console.log('[ClientEngine] Bootstrap complete ✓');

        } catch (error) {
            console.error('[ClientEngine] Bootstrap failed:', error);
            this.store.setApiStatus('error');
            throw error;
        }
    }

    /**
     * Stop the engine
     * 
     * Cleans up all connections and timers.
     * 
     * @example
     * engine.stop();
     */
    public stop(): void {
        if (!this.isRunning) {
            console.warn('[ClientEngine] Not running');
            return;
        }

        console.log('[ClientEngine] Stopping...');

        // Clear update interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Disconnect WebSocket
        this.provider.disconnectWebSocket();
        this.store.setWsConnected(false);

        // Mark as stopped
        this.isRunning = false;

        console.log('[ClientEngine] Stopped ✓');
    }

    /**
     * Schedule a debounced metrics update
     * 
     * Limits recomputation to once every METRICS_UPDATE_INTERVAL.
     */
    public scheduleMetricsUpdate(): void {
        if (this.metricsUpdateTimer === null) {
            this.metricsUpdateTimer = setTimeout(() => {
                this.recomputeAllMetrics();
                this.metricsUpdateTimer = null;
            }, this.METRICS_UPDATE_INTERVAL);
        }
    }


    /* =============================================
       INITIALIZATION METHODS
       ============================================= */

    /**
     * Initialize placeholder metrics for symbols
     * 
     * Allows the UI to render skeletons with basic 24h data while candles load.
     */
    private initializePlaceholderMetrics(symbolRecord: Record<string, SymbolInfo>): void {
        const now = Date.now();
        const initialMetrics: Record<string, SymbolMetrics> = {};

        this.activeSymbols.forEach(symbol => {
            const ticker = this.tickerMap.get(symbol);
            const volume24h = ticker && ticker.quoteVolume ? parseFloat(ticker.quoteVolume) : 0;
            const lastPrice = ticker && ticker.lastPrice ? parseFloat(ticker.lastPrice) : 0;
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
                        currentWindow: '15m',
                        baselineWindow: '4h',
                        baselinePer15m: 0,
                        current: 0,
                        ratio: 0,
                        delta: 0
                    }
                },
                dailyExtremum: {
                    high24h: 0,
                    low24h: 0,
                    lastPrice,
                    distToHighPct: 0,
                    distToLowPct: 0,
                    nearestSide: 'none',
                    score: Number.POSITIVE_INFINITY
                },
                currentSortScore: 0
            };
        });

        // Use upsert for each symbol since setAllMetrics is removed
        for (const [symbol, metrics] of Object.entries(initialMetrics)) {
            this.store.upsertMetrics(symbol, metrics);
        }

        const rankings = computeRankings(initialMetrics);
        this.store.setRankings(rankings);
    }

    /**
     * Seed candle buffers with historical data
     * 
     * Loads historical candles for all symbols with:
     * - Priority loading for visible symbols first
     * - Batch processing (4 concurrent max)
     * - Delay between batches (100ms)
     * - Error handling that continues on individual failures
     * 
     * @param symbols - Array of symbols to load
     * @param interval - Candlestick interval to load
     */
    private async seedCandleBuffers(
        symbols: string[],
        interval: Interval,
        customBatchDelay?: number
    ): Promise<void> {
        if (symbols.length === 0) return;

        console.log(`[ClientEngine] Seeding ${interval} candles for ${symbols.length} symbols...`);

        const limit = KLINE_FETCH_LIMITS[interval];
        const batchSize = 4; // Max concurrent requests
        const batchDelay = customBatchDelay ?? 100; // Use custom delay if provided

        let completed = 0;
        let failed = 0;

        // Process in batches
        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const batchMetrics: Record<string, SymbolMetrics> = {};

            // Fetch batch concurrently with retry logic
            const promises = batch.map(async (symbol: string) => {
                let success = false;

                // Spec requirement: Simple retry (max 2 attempts) with 2s delay
                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        const candles = await this.provider.getHistoricalCandles(symbol, interval, limit);

                        if (candles.length > 0) {
                            this.bufferManager.setBuffer(symbol, interval, candles);

                            const metrics = this.computeMetricsForSymbol(symbol);
                            if (metrics) {
                                batchMetrics[symbol] = metrics;
                            }

                            completed++;
                            success = true;
                            break; // Success, exit retry loop
                        }
                    } catch (error) {
                        if (attempt === 1) {
                            console.warn(`[ClientEngine] Retry 1/2 for ${symbol} ${interval} after error...`);
                            await new Promise(r => setTimeout(r, 2000)); // 2s delay before retry
                        } else {
                            console.error(`[ClientEngine] Failed to seed candles for ${symbol} after 2 attempts:`, error);
                        }
                    }
                }

                if (!success) {
                    failed++;
                }
            });

            // Wait for batch to complete
            await Promise.all(promises);

            // Batch update store
            if (Object.keys(batchMetrics).length > 0) {
                for (const [symbol, metric] of Object.entries(batchMetrics)) {
                    this.store.upsertMetrics(symbol, metric);
                }
            }

            // Delay before next batch
            if (i + batchSize < symbols.length) {
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
        }

        console.log(`[ClientEngine] Candle seeding complete: ${completed} succeeded, ${failed} failed`);
    }

    /**
     * Load required intervals for a set of symbols
     */
    private async loadRequiredIntervals(
        symbols: string[],
        chartInterval: Interval,
        isBackground: boolean = false,
        customBatchDelay?: number
    ): Promise<void> {
        if (!isBackground) {
            // Phase 1: Critical - Load ONLY chart interval
            await this.seedCandleBuffers(symbols, chartInterval, customBatchDelay);
            return;
        }

        // Phase 2: Background - Load remaining metric intervals
        const metricIntervals: Interval[] = ['5m', '15m', '1h', '4h'];
        const intervalsToLoad = metricIntervals.filter(i => i !== chartInterval);

        if (intervalsToLoad.length === 0) return;

        const batchDelay = customBatchDelay ?? 1000; // Background priority

        for (let i = 0; i < intervalsToLoad.length; i++) {
            const interval = intervalsToLoad[i];
            await this.seedCandleBuffers(symbols, interval, batchDelay);

            if (i < intervalsToLoad.length - 1) {
                await new Promise(r => setTimeout(r, 1000)); // 1s cool-down between background intervals
            }
        }
    }

    /**
     * Orchestrate background data enrichment
     */
    private async startBackgroundEnrichment(
        visibleSymbols: string[],
        backgroundSymbols: string[],
        chartInterval: Interval
    ): Promise<void> {
        try {
            // 1. Load metric intervals for visible symbols (Background)
            await this.loadRequiredIntervals(visibleSymbols, chartInterval, true);

            // Cool-down between phases
            await new Promise(r => setTimeout(r, 1000));

            // 2. Load chart interval for background symbols (500ms delay to prevent rate limits)
            await this.loadRequiredIntervals(backgroundSymbols, chartInterval, false, 500);

            // Cool-down before final heavy lifting
            await new Promise(r => setTimeout(r, 1000));

            // 3. Load metric intervals for background symbols (Background, 500ms delay)
            await this.loadRequiredIntervals(backgroundSymbols, chartInterval, true, 500);

            console.log('[ClientEngine] Background enrichment complete ✓');
        } catch (error) {
            console.error('[ClientEngine] Background enrichment failed:', error);
        }
    }


    /**
     * Handle incoming candle update from WebSocket
     */
    private handleCandleUpdate(candle: Candle): void {
        // 1. Update buffer (O(1) operation with RingBuffer)
        this.bufferManager.updateCandle(candle.symbol, candle.interval, candle);

        // 2. Schedule debounced metrics and rankings recomputation
        this.scheduleMetricsUpdate();

        // Log in development (throttled)
        if (import.meta.env.DEV && candle.isFinal) {
            console.log(
                `[ClientEngine] Finalized ${candle.symbol} ${candle.interval} - Price: ${candle.close.toFixed(2)}`
            );
        }
    }


    /**
     * Setup store change listeners
     */
    private handleStoreChanges(): void {
        let previousInterval = this.store.interval;
        let previousSortMode = this.store.sortMode;
        let previousCount = this.store.count;

        // Subscribe to store changes
        useZeroLagStore.subscribe((state) => {
            if (!this.isRunning) return;

            // 1. Handle Interval Change
            if (state.interval !== previousInterval) {
                const oldInterval = previousInterval;
                previousInterval = state.interval;
                this.onIntervalChange(state.interval, oldInterval).catch(console.error);
            }

            // 2. Handle Sort Mode Change
            if (state.sortMode !== previousSortMode) {
                previousSortMode = state.sortMode;
                this.onSortModeChange(state.sortMode);
            }

            // 3. Handle Count Change
            if (state.count !== previousCount) {
                previousCount = state.count;
                this.onCountChange(state.count);
            }
        });

        console.log('[ClientEngine] Store change listeners setup ✓');
    }

    /**
     * Handle sort mode change
     */
    private onSortModeChange(newMode: SortMode): void {
        console.log(`[ClientEngine] Sort mode changed to ${newMode}`);

        // Ensure required intervals for visible symbols
        const rankings = this.store.rankings[newMode] || [];
        const visibleSymbols = rankings.length > 0
            ? rankings.slice(0, this.store.count).map(r => r.info.symbol)
            : this.activeSymbols.slice(0, this.store.count);

        visibleSymbols.forEach(symbol => {
            this.ensureRequiredIntervals(symbol, newMode).catch(console.error);
        });

        this.syncSubscriptions().catch(console.error);
    }

    /**
     * Handle interval change
     */
    private async onIntervalChange(newInterval: Interval, oldInterval: Interval): Promise<void> {
        console.log(`[ClientEngine] Interval changed: ${oldInterval} → ${newInterval}`);

        // 1. Unsubscribe from all old interval streams
        await this.unsubscribeAll();

        // 2. DON'T clear buffers - we need metric intervals (5m, 15m, 4h)
        const metricIntervals: Interval[] = ['5m', '15m', '4h'];
        if (!metricIntervals.includes(oldInterval)) {
            // Safe to clear old chart interval
            for (const symbol of this.activeSymbols) {
                this.bufferManager.clearInterval(symbol, oldInterval);
            }
        }

        // 3. Fetch new interval for visible symbols (if not already loaded)
        const visibleSymbols = this.getVisibleSymbols();
        const symbolsNeedingData = visibleSymbols.filter(s =>
            !this.bufferManager.hasBuffer(s, newInterval)
        );

        if (symbolsNeedingData.length > 0) {
            await this.seedCandleBuffers(symbolsNeedingData, newInterval);
        }

        // 4. Recompute all metrics and rankings
        this.recomputeAllMetrics();

        // 5. Sync subscriptions for new interval (force unsubscribe old ones)
        await this.syncSubscriptions(true);
    }

    private getVisibleSymbols(): string[] {
        const rankings = this.store.rankings[this.store.sortMode] || [];
        return rankings.slice(0, this.store.count).map(r => r.info.symbol);
    }

    /**
     * Handle count change
     */
    private onCountChange(newCount: number): void {
        console.log(`[ClientEngine] Count changed to ${newCount}`);
        this.syncSubscriptions().catch(console.error);
    }

    /**
     * Synchronize WebSocket subscriptions
     */
    private async syncSubscriptions(forceUnsubscribe: boolean = false): Promise<void> {
        if (!this.isRunning) return;

        const interval = this.store.interval;

        // Determine which symbols to subscribe to (Top 100)
        const targetSymbols = this.activeSymbols;
        const targetSubs = new Set(targetSymbols.map(s => `${s}:${interval}`));

        // 1. Unsubscribe from old ones
        for (const sub of this.subscriptions) {
            if (!targetSubs.has(sub) || forceUnsubscribe) {
                const [symbol, subInterval] = sub.split(':');
                this.provider.unsubscribeCandles(symbol, subInterval as Interval);
                this.subscriptions.delete(sub);
            }
        }

        // 2. Subscribe to new ones
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

        const rankings = computeRankings(metrics);
        this.stateSyncManager.queueRankingsUpdate(rankings);
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
