/**
 * Client Engine
 * 
 * Main data orchestration engine for ZeroLag.
 * Manages data fetching, WebSocket connections, metrics computation, and state updates.
 */

import { ClientBinanceProvider, defaultProvider } from '../data/clientProvider';
import { batchFetch } from '../data/batchFetch';
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
    private bufferManager: BufferManager;

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
            // 1. Update store: set loading state
            this.store.setApiStatus('loading');
            this.store.setBootstrapProgress(0, 'Starting bootstrap...');

            // 2. Fetch 24h tickers → determine active symbols → update store
            this.store.setBootstrapProgress(5, 'Fetching 24h tickers...');
            const tickers = await this.provider.get24hTickers();

            // Map tickers and determine active symbols (USDT pairs with volume)
            this.activeSymbols = determineActiveSymbols(tickers);

            for (const ticker of tickers) {
                if (ticker.symbol) {
                    this.tickerMap.set(ticker.symbol, ticker);
                }
            }

            this.store.setActiveSymbols(this.activeSymbols);
            console.log(`[ClientEngine] Identified ${this.activeSymbols.length} active symbols`);

            // 3. Fetch exchange info → build symbol map → update store
            this.store.setBootstrapProgress(15, 'Fetching exchange info...');
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

            // Initialize rankings with placeholder metrics so UI can render skeletons
            this.initializePlaceholderMetrics(symbolRecord);

            // 4. Phase 1: Critical - Load ONLY chart interval for visible symbols
            this.store.setBootstrapProgress(30, 'Loading charts for visible symbols...');
            const visibleCount = this.store.count;
            const visibleSymbols = this.activeSymbols.slice(0, visibleCount);
            const backgroundSymbols = this.activeSymbols.slice(visibleCount);

            // Use optimized loadRequiredIntervals for Phase 1
            await this.loadRequiredIntervals(visibleSymbols, this.store.interval, 30, 60, false);

            // 5. Connect WebSocket
            this.store.setBootstrapProgress(60, 'Connecting to WebSocket...');
            await this.provider.connectWebSocket();
            this.store.setWsConnected(true);

            // 6. Register global kline listener BEFORE subscribing
            this.provider.onKline(this.handleCandleUpdate.bind(this));

            // 7. Subscribe to visible symbols
            console.log(`[ClientEngine] Subscribing to ${visibleSymbols.length} visible symbols...`);
            for (const symbol of visibleSymbols) {
                await this.provider.subscribeCandles(
                    symbol,
                    this.store.interval,
                    () => { } // Global onKline listener handles the data
                );
                this.subscriptions.add(`${symbol}:${this.store.interval}`);
            }

            // 8. Phase 2: Background enrichment (non-blocking)
            this.store.setBootstrapProgress(70, 'Enriching background data...');
            this.startBackgroundEnrichment(visibleSymbols, backgroundSymbols, this.store.interval);

            // 9. Start periodic updates
            this.startPeriodicUpdates();
            this.handleStoreChanges();

            this.store.setApiStatus('ok');
            console.log('[ClientEngine] Bootstrap complete ✓');

        } catch (error) {
            console.error('[ClientEngine] Bootstrap failed:', error);
            this.store.setApiStatus('error');
            this.store.setBootstrapProgress(0, 'Error during initialization');
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
     * Initialize symbols list
     * 
     * Fetches exchange info and selects top symbols by volume.
     * 
     * @throws {Error} If fetching exchange info fails
     */
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
            const change24h = ticker && ticker.priceChangePercent ? parseFloat(ticker.priceChangePercent) : 0;
            const lastPrice = ticker && ticker.lastPrice ? parseFloat(ticker.lastPrice) : 0;

            initialMetrics[symbol] = {
                symbol,
                marketType: 'futures',
                lastPrice,
                lastUpdateTs: now,
                change24h,
                ranges: {
                    '5m': { window: '5m', high: 0, low: 0, abs: 0, pct: 0 },
                    '15m': { window: '15m', high: 0, low: 0, abs: 0, pct: 0 },
                    '1h': { window: '1h', high: 0, low: 0, abs: 0, pct: 0 },
                    '4h': { window: '4h', high: 0, low: 0, abs: 0, pct: 0 },
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
                    score: 0
                },
                currentSortScore: 0
            };
        });

        this.store.setAllMetrics(initialMetrics);

        const rankings = computeRankings(initialMetrics, symbolRecord);
        this.store.setRankings(rankings);
    }

    /**
     * Seed candle buffers with historical data
     * 
     * Loads historical candles for all symbols with:
     * - Priority loading for visible symbols first
     * - Batch processing (4 concurrent max)
     * - Delay between batches (1000ms)
     * - Progress events for UI updates
     * - Error handling that continues on individual failures
     * 
     * @param symbols - Array of symbols to load
     * @param interval - Candlestick interval to load
     */
    private async seedCandleBuffers(
        symbols: string[],
        interval: Interval,
        startProgress: number = 0,
        endProgress: number = 100,
        customBatchDelay?: number
    ): Promise<void> {
        if (symbols.length === 0) return;

        console.log(`[ClientEngine] Seeding ${interval} candles for ${symbols.length} symbols...`);
        this.store.setBootstrapProgress(startProgress, `Loading ${interval} candles...`);

        const limit = KLINE_FETCH_LIMITS[interval];
        const batchSize = 4; // Max concurrent requests
        const batchDelay = customBatchDelay ?? 100; // Use custom delay if provided

        let completed = 0;
        let failed = 0;

        // Process in batches
        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const batchCandles: Record<string, Candle[]> = {};
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
                            const buffer = this.bufferManager.getBuffer(symbol, interval);
                            batchCandles[`${symbol}:${interval}`] = buffer;

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
            if (Object.keys(batchCandles).length > 0) {
                this.store.setAllCandles(batchCandles);
            }
            if (Object.keys(batchMetrics).length > 0) {
                this.store.setAllMetrics(batchMetrics);
            }

            // Update progress
            const progressRange = endProgress - startProgress;
            const currentProgress = startProgress + Math.round((completed / symbols.length) * progressRange);
            this.store.setBootstrapProgress(currentProgress);

            // Delay before next batch
            if (i + batchSize < symbols.length) {
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
        }

        console.log(`[ClientEngine] Candle seeding complete: ${completed} succeeded, ${failed} failed`);
    }

    /**
     * Smart multi-interval loading strategy
     * 
     * Priority levels:
     * 1. Current chart interval for visible symbols (for immediate charts)
     * 2. Metric intervals for visible symbols (for accurate rankings)
     * 3. Current chart interval for background symbols
     * 4. Metric intervals for background symbols
     */
    /**
     * Load required intervals for a set of symbols
     * 
     * Implements the two-phase loading strategy:
     * Phase 1: Critical - Load chart interval for immediate display
     * Phase 2: Background - Load remaining metric intervals with delays
     */
    private async loadRequiredIntervals(
        symbols: string[],
        chartInterval: Interval,
        startProgress: number,
        endProgress: number,
        isBackground: boolean = false,
        customBatchDelay?: number
    ): Promise<void> {
        if (!isBackground) {
            // Phase 1: Critical - Load ONLY chart interval
            await this.seedCandleBuffers(symbols, chartInterval, startProgress, endProgress, customBatchDelay);
            return;
        }

        // Phase 2: Background - Load remaining metric intervals
        const metricIntervals: Interval[] = ['5m', '15m', '1h', '4h'];
        const intervalsToLoad = metricIntervals.filter(i => i !== chartInterval);

        if (intervalsToLoad.length === 0) return;

        const batchDelay = customBatchDelay ?? 1000; // Background priority
        const progressPerInterval = (endProgress - startProgress) / intervalsToLoad.length;

        for (let i = 0; i < intervalsToLoad.length; i++) {
            const interval = intervalsToLoad[i];
            const start = startProgress + (i * progressPerInterval);
            const end = startProgress + ((i + 1) * progressPerInterval);

            await this.seedCandleBuffers(symbols, interval, start, end, batchDelay);

            if (i < intervalsToLoad.length - 1) {
                await new Promise(r => setTimeout(r, 1000)); // 1s cool-down between background intervals
            }
        }
    }

    /**
     * Orchestrate background data enrichment
     * 
     * Fetches non-critical intervals and background symbols without blocking the UI.
     */
    private async startBackgroundEnrichment(
        visibleSymbols: string[],
        backgroundSymbols: string[],
        chartInterval: Interval
    ): Promise<void> {
        try {
            // 1. Load metric intervals for visible symbols (Background)
            await this.loadRequiredIntervals(visibleSymbols, chartInterval, 70, 80, true);

            // Cool-down between phases
            await new Promise(r => setTimeout(r, 1000));

            // 2. Load chart interval for background symbols (500ms delay to prevent rate limits)
            await this.loadRequiredIntervals(backgroundSymbols, chartInterval, 80, 90, false, 500);

            // Subscribe to background symbols for the current chart interval
            console.log(`[ClientEngine] Subscribing to ${backgroundSymbols.length} background symbols...`);
            for (let i = 0; i < backgroundSymbols.length; i += 10) {
                const batch = backgroundSymbols.slice(i, i + 10);
                await Promise.all(batch.map(symbol => {
                    this.subscriptions.add(`${symbol}:${chartInterval}`);
                    return this.provider.subscribeCandles(symbol, chartInterval, () => { });
                }));
                await new Promise(r => setTimeout(r, 200));
            }

            // Cool-down before final heavy lifting
            await new Promise(r => setTimeout(r, 1000));

            // 3. Load metric intervals for background symbols (Background, 500ms delay)
            await this.loadRequiredIntervals(backgroundSymbols, chartInterval, 90, 98, true, 500);

            this.store.setBootstrapProgress(100, 'Ready');
            console.log('[ClientEngine] Background enrichment complete ✓');
        } catch (error) {
            console.error('[ClientEngine] Background enrichment failed:', error);
        }
    }


    /**
     * Handle incoming candle update from WebSocket
     * 
     * Updates cache and recomputes metrics if candle is final.
     * 
     * @param candle - Updated candle data
     */
    private handleCandleUpdate(candle: Candle): void {
        // 1. Update buffer (O(1) operation with RingBuffer)
        this.bufferManager.updateCandle(candle.symbol, candle.interval, candle);

        // 2. Get updated buffer for store sync
        const buffer = this.bufferManager.getBuffer(candle.symbol, candle.interval);

        // 3. Queue update via StateSyncManager
        this.stateSyncManager.queueCandleUpdate(candle.symbol, candle.interval, buffer);

        // 4. Schedule debounced metrics and rankings recomputation
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
     * 
     * Subscribes to store changes to react to interval, sort mode, and count switches.
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
        this.unsubscribeAll();

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
            await this.seedCandleBuffers(symbolsNeedingData, newInterval, 0, 100);
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
     * Synchronize WebSocket subscriptions based on current visible symbols
     * 
     * Implements surgical updates and batched subscriptions to reduce churn.
     */
    private async syncSubscriptions(forceUnsubscribe: boolean = false): Promise<void> {
        if (!this.store.wsConnected) return;

        const interval = this.store.interval;

        // Target ALL active symbols for the current interval to keep rankings fresh
        const targetSubscriptions = new Set(this.activeSymbols.map(s => `${s}:${interval}`));

        // Still track visible symbols for StateSyncManager (throttling logic)
        const rankings = this.store.rankings[this.store.sortMode] || [];
        const visibleSymbols = rankings.slice(0, this.store.count).map(r => r.info.symbol);
        this.stateSyncManager.setVisibleSymbols(visibleSymbols);

        // 1. Surgical Unsubscribe: Only if forced (e.g. interval change)
        // This reduces churn during sort/count changes
        if (forceUnsubscribe) {
            const toUnsubscribe = [...this.subscriptions].filter(sub => !targetSubscriptions.has(sub));
            if (toUnsubscribe.length > 0) {
                const streams = toUnsubscribe.map(sub => {
                    const [symbol, inv] = sub.split(':');
                    return this.provider.buildStreamName(symbol, inv as Interval);
                });
                await this.provider.unsubscribe(streams);
                toUnsubscribe.forEach(sub => this.subscriptions.delete(sub));
            }
        }

        // 2. Batched Subscribe: Add only what's missing
        const newSubs = [...targetSubscriptions].filter(sub => !this.subscriptions.has(sub));
        if (newSubs.length > 0) {
            const streams = newSubs.map(sub => {
                const [symbol, inv] = sub.split(':');
                return this.provider.buildStreamName(symbol, inv as Interval);
            });

            await this.provider.subscribe(streams);
            newSubs.forEach(sub => this.subscriptions.add(sub));

            console.log(`[ClientEngine] Subscriptions synced: ${this.subscriptions.size} active (Added ${newSubs.length})`);
        }
    }

    private unsubscribeAll(): void {
        for (const sub of this.subscriptions) {
            const [symbol, inv] = sub.split(':');
            this.provider.unsubscribeCandles(symbol, inv as Interval);
        }
        this.subscriptions.clear();
    }

    /**
     * Start periodic updates
     * 
     * Runs update tasks at regular intervals.
     */
    private startPeriodicUpdates(): void {
        console.log(
            `[ClientEngine] Starting periodic updates (every ${this.UPDATE_INTERVAL_MS / 1000}s)...`
        );

        this.updateInterval = setInterval(() => {
            this.runPeriodicUpdate();

            // Log memory stats every update
            const memStats = this.bufferManager.getMemoryUsage();
            console.log(
                `[BufferManager] Memory: ${memStats.totalCandles} candles, ` +
                `${memStats.symbolCount} symbols, ` +
                `avg ${memStats.avgCandlesPerSymbol.toFixed(1)} per symbol`
            );
        }, this.UPDATE_INTERVAL_MS);
    }

    /**
     * Run periodic update tasks
     * 
     * Updates 24h tickers and refreshes rankings.
     */
    private async runPeriodicUpdate(): Promise<void> {
        if (!this.isRunning) return;

        console.log('[ClientEngine] Running periodic update...');

        // Update 24h tickers to keep change24h fresh
        await this.updateTickers();

        // Recompute all metrics and rankings
        this.recomputeAllMetrics();

        // Log StateSyncManager stats
        const syncStats = this.stateSyncManager.getStats();
        console.log('[StateSyncManager] Pending updates:', syncStats);
    }

    /**
     * Update 24h ticker data
     */
    private async updateTickers(): Promise<void> {
        try {
            const tickers = await this.provider.get24hTickers();
            for (const ticker of tickers) {
                if (ticker.symbol) {
                    this.tickerMap.set(ticker.symbol, ticker);
                }
            }
        } catch (error) {
            console.error('[ClientEngine] Failed to update tickers:', error);
        }
    }

    /* =============================================
       HISTORICAL DATA FETCHING
       ============================================= */

    /**
     * Fetch historical klines for all active symbols
     * 
     * Uses batchFetch utility with 4 concurrent requests (spec requirement).
     * Properly handles rate limiting and provides progress feedback.
     * 
     * @throws {Error} If fetching fails for critical symbols
     */
    public async fetchHistoricalKlines(symbols: string[], label: string = 'All'): Promise<void> {
        const interval = this.store.interval;
        const limit = KLINE_FETCH_LIMITS[interval];

        console.log(
            `[ClientEngine] Fetching ${label} klines for ${symbols.length} symbols ` +
            `(${interval}, limit=${limit})...`
        );

        if (symbols.length === 0) return;

        // Create tasks for batch fetching
        const tasks = symbols.map(symbol => async () => {
            // Fetch klines from Binance API using direct method (batchFetch handles concurrency)
            // Retry logic: 3 attempts with backoff
            let klinesData;
            let lastError;

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    // Use direct getKlines since batchFetch already limits concurrency
                    klinesData = await this.provider.getKlines(symbol, interval, limit);
                    break;
                } catch (err) {
                    lastError = err;
                    // Wait before retry (1s, 2s)
                    if (attempt < 3) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                }
            }

            if (!klinesData) {
                throw lastError || new Error(`Failed to fetch klines for ${symbol}`);
            }

            // klinesData is already Candle[] from getKlines
            const candles = klinesData;

            // Store in BufferManager
            this.bufferManager.setBuffer(symbol, interval, candles);

            // Update Zustand store for UI reactivity
            // We can use StateSyncManager or direct update. Direct update is fine here as it's a batch operation
            // but for consistency let's use the store directly as we want immediate feedback during load
            this.store.setCandlesForSymbol(symbol, interval, candles);

            // Compute metrics for this symbol
            this.computeMetricsForSymbol(symbol);

            return symbol; // Return symbol name on success
        });

        // Execute with proper concurrency limiting (4 concurrent, small delay between batches)
        const result = await batchFetch(tasks, {
            concurrency: 4, // Spec requirement: "maximum of 4 concurrent requests"
            delayBetweenBatches: 100, // 100ms delay between batches
            onBatchComplete: (batchNum, totalBatches) => {
                const progress = Math.round((batchNum / totalBatches) * 100);
                console.log(
                    `[ClientEngine] Progress: Batch ${batchNum}/${totalBatches} (${progress}%)`
                );
            }
        });

        // Log results
        console.log(
            `[ClientEngine] Klines fetch complete: ${result.results.length} succeeded, ` +
            `${result.errors.length} failed` +
            (result.rateLimited ? ' ⚠ RATE LIMITED' : ' ✓')
        );

        if (result.errors.length > 0) {
            console.error('[ClientEngine] Sample error:', result.errors[0]);
        }

        // Update API status if rate limited
        if (result.rateLimited) {
            this.store.setApiStatus('rate_limited');
        }

        // Recompute all metrics and rankings with the loaded data
        this.recomputeAllMetrics();
    }

    /**
     * Compute metrics for a single symbol
     * 
     * Calculates all metrics (range, volume, extremum, growth).
     * 
     * @param symbol - Trading symbol to compute metrics for
     * @returns Computed metrics or null if data is missing
     */
    private computeMetricsForSymbol(symbol: string): SymbolMetrics | null {
        // Build candle buffers map for metrics computation
        const candleBuffersMap = new Map<Interval, Candle[]>();

        // Get ALL intervals needed for metrics from BufferManager
        const intervals: Interval[] = ['5m', '15m', '1h', '4h'];
        for (const interval of intervals) {
            const buffer = this.bufferManager.getBuffer(symbol, interval);
            if (buffer.length > 0) {
                candleBuffersMap.set(interval, buffer);
            }
        }

        // Get 24h ticker data
        const ticker = this.tickerMap.get(symbol);
        if (!ticker) {
            return null;
        }

        // Use the centralized computeSymbolMetrics function
        return computeSymbolMetrics(symbol, candleBuffersMap, ticker);
    }

    /**
     * Recompute metrics and rankings for all active symbols
     * 
     * Recalculates all metrics and updates rankings in the store.
     */
    private recomputeAllMetrics(): void {
        console.log('[ClientEngine] Recomputing all metrics...');

        const allMetrics: Record<string, SymbolMetrics> = {};

        // Recompute metrics for each symbol
        for (const symbol of this.activeSymbols) {
            const metrics = this.computeMetricsForSymbol(symbol);
            if (metrics) {
                allMetrics[symbol] = metrics;
            }
        }

        // Update store with all metrics at once (batch update)
        this.stateSyncManager.queueMetricsUpdate(allMetrics);

        // Get all metrics from store
        const state = useZeroLagStore.getState();
        const metricsBySymbol = state.metricsBySymbol;

        // Compute rankings
        const rankings = computeRankings(metricsBySymbol, state.symbols);

        // Update store with rankings
        this.stateSyncManager.queueRankingsUpdate(rankings);

        console.log('[ClientEngine] Metrics and rankings updated ✓');
    }

    /* =============================================
       UTILITY METHODS
       ============================================= */

    /**
     * Ensure required intervals are loaded for a symbol and sort mode
     * 
     * Lazy loads interval data only when needed for a specific sort mode.
     * Checks which intervals are required and fetches any missing data.
     * 
     * @param symbol - Trading symbol
     * @param sortMode - Sort mode that determines required intervals
     */
    private async ensureRequiredIntervals(symbol: string, sortMode: SortMode): Promise<void> {
        const requiredIntervals = REQUIRED_INTERVALS[sortMode];

        // If no intervals required (ticker-only mode), return early
        if (requiredIntervals.length === 0) {
            return;
        }

        // Check which intervals are missing
        const missingIntervals: Interval[] = [];

        for (const interval of requiredIntervals) {
            // Use BufferManager to check if data exists
            if (!this.bufferManager.hasBuffer(symbol, interval)) {
                missingIntervals.push(interval);
            } else {
                // Check if buffer has enough data (at least 10 candles)
                const buffer = this.bufferManager.getBuffer(symbol, interval);
                if (buffer.length < 10) {
                    missingIntervals.push(interval);
                }
            }
        }

        // If all required intervals are loaded, return
        if (missingIntervals.length === 0) {
            return;
        }

        // Lazy load missing intervals
        console.log(`[ClientEngine] Lazy loading ${missingIntervals.length} intervals for ${symbol} (${sortMode})`);

        // Load all missing intervals concurrently (safe since it's just one symbol)
        await Promise.all(missingIntervals.map(async (interval) => {
            try {
                const limit = KLINE_FETCH_LIMITS[interval];
                const candles = await this.provider.getHistoricalCandles(symbol, interval, limit);

                if (candles.length > 0) {
                    // Use BufferManager
                    this.bufferManager.setBuffer(symbol, interval, candles);

                    // Update store for UI
                    const buffer = this.bufferManager.getBuffer(symbol, interval);
                    this.store.setCandlesForSymbol(symbol, interval, buffer);

                    console.log(`[ClientEngine] Loaded ${candles.length} ${interval} candles for ${symbol}`);
                }
            } catch (error) {
                console.error(`[ClientEngine] Failed to load ${interval} for ${symbol}:`, error);
            }
        }));

        // Recompute metrics after loading new intervals
        const metrics = this.computeMetricsForSymbol(symbol);
        if (metrics) {
            this.stateSyncManager.queueMetricsUpdate({ [symbol]: metrics });
        }
    }


    /**
     * Get engine status
     * 
     * @returns Object with engine status information
     */
    public getStatus(): {
        isRunning: boolean;
        activeSymbolCount: number;
        apiStatus: string;
        wsConnected: boolean;
    } {
        return {
            isRunning: this.isRunning,
            activeSymbolCount: this.activeSymbols.length,
            apiStatus: this.store.apiStatus,
            wsConnected: this.store.wsConnected,
        };
    }

    /**
     * Get active symbols
     * 
     * @returns Array of active symbol names
     */
    public getActiveSymbols(): string[] {
        return [...this.activeSymbols];
    }

    /**
     * Check if engine is running
     * 
     * @returns True if engine is running
     */
    public isEngineRunning(): boolean {
        return this.isRunning;
    }
}

/* =============================================
   SINGLETON INSTANCE
   ============================================= */

/**
 * Default shared ClientEngine instance
 * 
 * @example
 * import { defaultEngine } from './ClientEngine';
 * await defaultEngine.start();
 */
export const defaultEngine = new ClientEngine();
