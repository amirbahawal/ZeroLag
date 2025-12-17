/**
 * Client Engine
 * 
 * Main data orchestration engine for ZeroLag.
 * Manages data fetching, WebSocket connections, metrics computation, and state updates.
 */

import { ClientBinanceProvider, defaultProvider } from '../data/clientProvider';
import { CandleCache, defaultCandleCache } from '../data/candleCache';
import { batchFetch } from '../data/batchFetch';
import { useZeroLagStore } from '../state/useZeroLagStore';
import type { ZeroLagState } from '../state/useZeroLagStore';
import type { Interval, SymbolMetrics, Candle, SymbolInfo } from '../core/types';
import { KLINE_FETCH_LIMITS } from '../core/intervals';
import {
    computeRangeMetric,
    computeVolumeMetric,
    computeDailyExtremumMetric,
    computeGrowthMetric,
} from '../core/metrics';
import { computeRankings, refreshRankings } from '../core/ranking';
import type { Ticker24h } from '../data/binanceRest';

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

    /** Candle storage cache */
    private candleCache: CandleCache;

    /** Zustand store instance */
    /** Zustand store instance */
    private get store(): ZeroLagState {
        return useZeroLagStore.getState();
    }

    /** Currently tracked symbols */
    private activeSymbols: string[] = [];

    /** Map of 24h ticker data */
    private tickerMap = new Map<string, Ticker24h>();

    /** Periodic update timer */
    private updateInterval: ReturnType<typeof setInterval> | null = null;

    /** Engine running state */
    private isRunning: boolean = false;

    /** Update interval duration (milliseconds) */
    private readonly UPDATE_INTERVAL_MS = 30000; // 30 seconds

    /* =============================================
       CONSTRUCTOR
       ============================================= */

    /**
     * Create a new ClientEngine instance
     * 
     * @param provider - Optional custom Binance provider
     * @param candleCache - Optional custom candle cache
     */
    constructor(
        provider?: ClientBinanceProvider,
        candleCache?: CandleCache
    ) {
        this.provider = provider || defaultProvider;
        this.candleCache = candleCache || defaultCandleCache;


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

        console.log('[ClientEngine] Starting...');

        try {
            // Set API status to loading
            this.store.setApiStatus('loading');

            // Test connectivity
            console.log('[ClientEngine] Testing connectivity...');
            const isConnected = await this.provider.testConnection();

            if (!isConnected) {
                throw new Error('Failed to connect to Binance API');
            }

            console.log('[ClientEngine] Connectivity test passed ✓');

            // Initialize symbols (and initial rankings)
            console.log('[ClientEngine] Step 1: Initialize symbols...');
            await this.initializeSymbols();
            console.log('[ClientEngine] Step 1: Complete');

            // Start WebSocket connections first to capture live data
            console.log('[ClientEngine] Step 2: Start WebSocket...');
            await this.startWebSocket();
            console.log('[ClientEngine] Step 2: Complete');

            // Fetch historical data for VISIBLE symbols first (Top 16)
            console.log('[ClientEngine] Step 3: Fetch visible klines (Top 16)...');
            const visibleSymbols = this.activeSymbols.slice(0, 16);
            const backgroundSymbols = this.activeSymbols.slice(16);

            await this.fetchHistoricalKlines(visibleSymbols, 'Visible');
            console.log('[ClientEngine] Step 3: Complete');

            // Fetch remaining symbols in background
            console.log('[ClientEngine] Step 4: Background enrichment...');
            this.fetchHistoricalKlines(backgroundSymbols, 'Background')
                .catch(err => console.error('[ClientEngine] Background fetch failed:', err));
            console.log('[ClientEngine] Step 4: Started (background)');

            // Setup store change listeners
            this.handleStoreChanges();

            // Set API status to ok
            this.store.setApiStatus('ok');

            // Mark as running
            this.isRunning = true;

            // Start periodic updates
            this.startPeriodicUpdates();

            console.log('[ClientEngine] Started successfully ✓');
        } catch (error) {
            console.error('[ClientEngine] Failed to start:', error);
            this.store.setApiStatus('error');
            this.isRunning = false;
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
    private async initializeSymbols(): Promise<void> {
        console.log('[ClientEngine] Initializing symbols...');

        try {
            // Fetch exchange info
            const exchangeInfo = await this.provider.getExchangeInfo();

            // Filter for USDT perpetual futures
            const futuresSymbols = this.provider.filterFuturesUSDTSymbols(
                exchangeInfo.symbols
            );

            console.log(
                `[ClientEngine] Found ${futuresSymbols.length} USDT perpetual futures`
            );

            // Fetch 24h tickers to get volume data
            const tickers = await this.provider.get24hTickers();

            // Create map of symbol -> 24h quote volume
            const volumeMap = new Map<string, number>();
            for (const ticker of tickers) {
                if (ticker.symbol) {
                    this.tickerMap.set(ticker.symbol, ticker);
                    if (ticker.quoteVolume) {
                        volumeMap.set(ticker.symbol, parseFloat(ticker.quoteVolume));
                    }
                }
            }

            // Filter and sort symbols by volume
            const symbolsWithVolume = futuresSymbols
                .map((s) => ({
                    symbol: s.symbol,
                    volume: volumeMap.get(s.symbol) || 0,
                }))
                .filter((s) => s.volume > 0)
                .sort((a, b) => b.volume - a.volume);

            // Use all active symbols (no limit)
            this.activeSymbols = symbolsWithVolume.map((s) => s.symbol);

            // Update store
            this.store.setActiveSymbols(this.activeSymbols);

            // Store full symbol info in store
            const symbolInfos = futuresSymbols
                .filter((s) => this.activeSymbols.includes(s.symbol))
                .map((s) => ({
                    symbol: s.symbol,
                    baseAsset: s.baseAsset,
                    quoteAsset: s.quoteAsset,
                    marketType: 'futures' as const,
                    status: s.status,
                }));

            const symbolRecord: Record<string, SymbolInfo> = {};
            symbolInfos.forEach(s => {
                symbolRecord[s.symbol] = s;
            });

            this.store.setSymbols(symbolRecord);

            // INITIALIZE RANKINGS
            // We need to populate rankings immediately so the UI knows which symbols to show (as skeletons)
            // while we fetch the candle data.

            // Create initial metrics with just 24h volume/change data
            const initialMetrics: Record<string, SymbolMetrics> = {};
            const now = Date.now();

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
                    ranges: { // Placeholders until candles load
                        '5m': { window: '5m', high: 0, low: 0, abs: 0, pct: 0 },
                        '15m': { window: '15m', high: 0, low: 0, abs: 0, pct: 0 },
                        '1h': { window: '1h', high: 0, low: 0, abs: 0, pct: 0 },
                        '4h': { window: '4h', high: 0, low: 0, abs: 0, pct: 0 },
                    },
                    volume: {
                        '15m': { window: '15m', base: 0, quote: 0 },
                        '4h': { window: '4h', base: 0, quote: 0 },
                        '24h': { window: '24h', base: 0, quote: volume24h }, // We have this!
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

                // Update store with initial metrics
                this.store.upsertMetrics(symbol, initialMetrics[symbol]);
            });

            // Compute initial rankings
            const rankings = computeRankings(initialMetrics, symbolRecord);
            this.store.setRankings(rankings);

            console.log(
                `[ClientEngine] Initialized ${this.activeSymbols.length} active symbols with rankings ✓`
            );
            console.log(
                `[ClientEngine] Top 10: ${this.activeSymbols.slice(0, 10).join(', ')}`
            );
        } catch (error) {
            console.error('[ClientEngine] Failed to initialize symbols:', error);
            throw error;
        }
    }

    /**
     * Start WebSocket connections and subscribe to candle streams
     * 
     * Connects to WebSocket and subscribes to all active symbols.
     */
    private async startWebSocket(): Promise<void> {
        console.log('[ClientEngine] Starting WebSocket...');

        try {
            // Connect to WebSocket
            await this.provider.connectWebSocket();

            // Get current interval
            const interval = this.store.interval;

            // Subscribe to candle updates for each symbol
            console.log(`[ClientEngine] Subscribing to ${this.activeSymbols.length} symbols...`);

            for (const symbol of this.activeSymbols) {
                try {
                    await this.provider.subscribeCandles(
                        symbol,
                        interval,
                        this.handleCandleUpdate.bind(this)
                    );
                } catch (error) {
                    console.error(`[ClientEngine] Failed to subscribe to ${symbol}:`, error);
                    // Continue with other symbols
                }
            }

            // Mark as connected
            this.store.setWsConnected(true);

            console.log('[ClientEngine] WebSocket connected and subscribed ✓');
        } catch (error) {
            console.error('[ClientEngine] Failed to start WebSocket:', error);
            // Don't throw - WebSocket is optional
            this.store.setWsConnected(false);
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
        // Update candle in cache
        this.candleCache.updateCandle(candle.symbol, candle.interval, candle);

        // Update store to trigger UI updates
        // We need to get the full array from cache to update the store
        const updatedCandles = this.candleCache.getCandlesForSymbol(candle.symbol, candle.interval);

        // Create a new array reference to ensure Zustand detects the change
        // optimization: only do this if we really need to (e.g. maybe throttle this?)
        // For now, we do it every tick for "ZeroLag" experience
        this.store.setCandlesForSymbol(candle.symbol, candle.interval, [...updatedCandles]);

        // If candle is finalized, recompute metrics
        if (candle.isFinal) {
            // Recompute metrics for this symbol
            this.computeMetricsForSymbol(candle.symbol);

            // Recompute rankings (could be optimized to only update if needed)
            const state = useZeroLagStore.getState();
            const metricsBySymbol = state.metricsBySymbol;
            const rankings = computeRankings(metricsBySymbol, state.symbols);
            this.store.setRankings(rankings);

            // Log in development
            if (import.meta.env.DEV) {
                console.log(
                    `[ClientEngine] Updated ${candle.symbol} - Price: ${candle.close.toFixed(2)}`
                );
            }
        }
        // For non-final candles, cache is updated but metrics not recomputed
        // This prevents excessive recalculation on every tick
    }

    /**
     * Switch to a new interval
     * 
     * Unsubscribes from old interval, clears cache, fetches new data,
     * and resubscribes to new interval.
     * 
     * @param newInterval - New interval to switch to
     */
    public async switchInterval(newInterval: Interval, oldIntervalOverride?: Interval): Promise<void> {
        console.log(`[ClientEngine] Switching interval to ${newInterval}...`);

        const oldInterval = oldIntervalOverride || this.store.interval;

        // Only skip if no override provided and intervals match (meaning store already has new interval and we don't know old one)
        // If override provided, we trust the caller knows we need to switch
        if (!oldIntervalOverride && oldInterval === newInterval) {
            console.log('[ClientEngine] Already on this interval');
            return;
        }

        try {
            // Unsubscribe from all current streams using OLD interval
            if (this.store.wsConnected) {
                console.log(`[ClientEngine] Unsubscribing from old streams (${oldInterval})...`);
                for (const symbol of this.activeSymbols) {
                    try {
                        this.provider.unsubscribeCandles(symbol, oldInterval);
                    } catch {
                        // Ignore unsubscribe errors
                    }
                }
            }

            // Update interval in store (idempotent if already updated)
            this.store.setInterval(newInterval);

            // Clear candle cache (old interval data is no longer relevant)
            this.candleCache.clearAll();
            console.log('[ClientEngine] Cleared candle cache');

            // Resubscribe to WebSocket with new interval
            if (this.store.wsConnected) {
                console.log('[ClientEngine] Resubscribing with new interval...');
                for (const symbol of this.activeSymbols) {
                    try {
                        await this.provider.subscribeCandles(
                            symbol,
                            newInterval,
                            this.handleCandleUpdate.bind(this)
                        );
                    } catch (error) {
                        console.error(`[ClientEngine] Failed to resubscribe ${symbol}:`, error);
                    }
                }
            }

            // Fetch historical klines for new interval
            await this.fetchHistoricalKlines(this.activeSymbols, 'All');

            // Recompute all metrics with new data
            this.recomputeAllMetrics();

            console.log(`[ClientEngine] Switched to ${newInterval} ✓`);
        } catch (error) {
            console.error('[ClientEngine] Failed to switch interval:', error);
            // Revert to old interval on failure
            this.store.setInterval(oldInterval);
            throw error;
        }
    }

    /**
     * Setup store change listeners
     * 
     * Subscribes to store changes to react to interval switches.
     * Should be called once during engine initialization.
     */
    private handleStoreChanges(): void {
        let previousInterval = this.store.interval;

        // Subscribe to store changes
        useZeroLagStore.subscribe((state) => {
            const currentInterval = state.interval;

            // Check if interval changed
            if (currentInterval !== previousInterval && this.isRunning) {
                console.log(`[ClientEngine] Interval changed: ${previousInterval} → ${currentInterval}`);

                // Switch to new interval, passing previous one explicitly
                this.switchInterval(currentInterval, previousInterval).catch((error) => {
                    console.error('[ClientEngine] Auto-switch interval failed:', error);
                });

                previousInterval = currentInterval;
            }
        });

        console.log('[ClientEngine] Store change listeners setup ✓');
    }

    /**
     * Start periodic updates
     * 
     * Runs update tasks at regular intervals.
     */
    private startPeriodicUpdates(): void {
        console.log(
            `[ClientEngine] Starting periodic updates (every ${this.UPDATE_INTERVAL_MS / 1000
            }s)...`
        );

        this.updateInterval = setInterval(() => {
            this.runPeriodicUpdate();
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

        // Refresh rankings
        await refreshRankings();
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

            // Parse klines to Candle objects
            const candles = this.provider.parseKlinesToCandles(symbol, interval, klinesData);

            // Store in cache
            this.candleCache.setCandlesForSymbol(symbol, interval, candles);

            // Also update Zustand store for UI reactivity
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
     * Calculates all metrics (range, volume, extremum, growth) and updates store.
     * 
     * @param symbol - Trading symbol to compute metrics for
     */
    private computeMetricsForSymbol(symbol: string): void {
        const interval = this.store.interval;
        const now = Date.now();

        // Get candles from cache
        const candles = this.candleCache.getCandlesForSymbol(symbol, interval);

        if (candles.length === 0) {
            console.warn(`[ClientEngine] No candles for ${symbol}, skipping metrics`);
            return;
        }

        // Get latest candle for last price
        const latestCandle = candles[candles.length - 1];
        const lastPrice = latestCandle.close;

        // Compute range metrics for all windows
        const ranges = {
            '5m': computeRangeMetric(candles, '5m', now),
            '15m': computeRangeMetric(candles, '15m', now),
            '1h': computeRangeMetric(candles, '1h', now),
            '4h': computeRangeMetric(candles, '4h', now),
        } as const;

        // Get 24h ticker data
        const ticker = this.tickerMap.get(symbol);
        const volume24h = ticker && ticker.quoteVolume ? parseFloat(ticker.quoteVolume) : 0;

        // Compute volume metrics for all windows
        const volume = {
            '15m': computeVolumeMetric(candles, '15m', now),
            '4h': computeVolumeMetric(candles, '4h', now),
            '24h': { window: '24h', base: 0, quote: volume24h }, // Use ticker data for 24h
        } as const;

        // Compute daily extremum metric
        // Use 24h ticker data if available (Spec 5.4.3), otherwise fallback to 4h range approximation
        let high24h = ranges['4h'].high;
        let low24h = ranges['4h'].low;

        if (ticker) {
            if (ticker.highPrice) high24h = parseFloat(ticker.highPrice);
            if (ticker.lowPrice) low24h = parseFloat(ticker.lowPrice);
        }

        const dailyExtremum = computeDailyExtremumMetric(high24h, low24h, lastPrice);

        // Compute growth metric (15m vs 4h)
        const gVolume = computeGrowthMetric(
            volume['15m'].quote,
            volume['4h'].quote
        );

        // Get 24h change from ticker map (already retrieved above)
        const change24h = ticker ? parseFloat(ticker.priceChangePercent || '0') : 0;

        // Build SymbolMetrics object
        const metrics: SymbolMetrics = {
            symbol,
            marketType: 'futures',
            lastPrice,
            lastUpdateTs: now,
            change24h,
            ranges,
            volume,
            growth: { gVolume },
            dailyExtremum,
            currentSortScore: 0, // Will be set by ranking computation
        };

        // Update store
        this.store.upsertMetrics(symbol, metrics);
    }

    /**
     * Recompute metrics and rankings for all active symbols
     * 
     * Recalculates all metrics and updates rankings in the store.
     */
    private recomputeAllMetrics(): void {
        console.log('[ClientEngine] Recomputing all metrics...');

        // Recompute metrics for each symbol
        for (const symbol of this.activeSymbols) {
            this.computeMetricsForSymbol(symbol);
        }

        // Get all metrics from store
        const state = useZeroLagStore.getState();
        const metricsBySymbol = state.metricsBySymbol;

        // Compute rankings
        const rankings = computeRankings(metricsBySymbol, state.symbols);

        // Update store with rankings
        this.store.setRankings(rankings);

        console.log('[ClientEngine] Metrics and rankings updated ✓');
    }

    /* =============================================
       UTILITY METHODS
       ============================================= */


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
