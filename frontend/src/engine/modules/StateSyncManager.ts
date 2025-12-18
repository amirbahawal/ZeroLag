/**
 * State Sync Manager
 * 
 * Batches store updates to prevent excessive React re-renders.
 * Flushes at 60fps (16ms intervals) with visible symbol prioritization.
 * 
 * Performance Goals:
 * - Reduce store updates from 60+/sec to 60/sec max
 * - Prioritize visible symbols for instant UI updates
 * - Batch background symbol updates
 * - Prevent UI jank during high-frequency candle updates
 */

import type { ZeroLagState } from '../../state/useZeroLagStore';
import type { Interval, Candle, SymbolMetrics, SymbolTopEntry, SortMode } from '../../core/types';

interface PendingUpdates {
    candles: Record<string, Candle[]>;
    metrics: Record<string, SymbolMetrics>;
    rankings: Record<SortMode, SymbolTopEntry[]> | null;
}

export class StateSyncManager {
    private store: ZeroLagState;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private visibleSymbols = new Set<string>();

    // Separate queues for visible vs background symbols
    private visibleUpdates: PendingUpdates = {
        candles: {},
        metrics: {},
        rankings: null
    };

    private backgroundUpdates: PendingUpdates = {
        candles: {},
        metrics: {},
        rankings: null
    };

    // Flush intervals
    private readonly VISIBLE_FLUSH_MS = 16;      // 60fps for visible
    private readonly BACKGROUND_FLUSH_MS = 1000;  // 1fps for background

    private lastVisibleFlush = 0;
    private lastBackgroundFlush = 0;

    constructor(store: ZeroLagState) {
        this.store = store;
    }

    /**
     * Set which symbols are currently visible in the grid
     * Used to prioritize their updates
     */
    setVisibleSymbols(symbols: string[]): void {
        this.visibleSymbols = new Set(symbols);
    }

    /**
     * Queue a candle update
     * Automatically routes to visible or background queue
     */
    queueCandleUpdate(symbol: string, interval: Interval, candles: Candle[]): void {
        const key = `${symbol}:${interval}`;

        if (this.visibleSymbols.has(symbol)) {
            this.visibleUpdates.candles[key] = candles;
            this.scheduleFlush('visible');
        } else {
            this.backgroundUpdates.candles[key] = candles;
            this.scheduleFlush('background');
        }
    }

    /**
     * Queue metrics update
     * Can update multiple symbols at once
     */
    queueMetricsUpdate(metrics: Record<string, SymbolMetrics>): void {
        // Split into visible and background
        for (const [symbol, metric] of Object.entries(metrics)) {
            if (this.visibleSymbols.has(symbol)) {
                this.visibleUpdates.metrics[symbol] = metric;
            } else {
                this.backgroundUpdates.metrics[symbol] = metric;
            }
        }

        this.scheduleFlush('both');
    }

    /**
     * Queue rankings update
     * Rankings affect both visible and background, so always high priority
     */
    queueRankingsUpdate(rankings: Record<SortMode, SymbolTopEntry[]>): void {
        this.visibleUpdates.rankings = rankings;
        this.scheduleFlush('visible');
    }

    /**
     * Schedule flush based on priority
     */
    private scheduleFlush(priority: 'visible' | 'background' | 'both'): void {
        if (this.flushTimer !== null) {
            return; // Already scheduled
        }

        // Determine flush delay based on priority
        const now = Date.now();
        let delay = 0;

        if (priority === 'visible' || priority === 'both') {
            const timeSinceLastVisible = now - this.lastVisibleFlush;
            delay = Math.max(0, this.VISIBLE_FLUSH_MS - timeSinceLastVisible);
        } else {
            const timeSinceLastBackground = now - this.lastBackgroundFlush;
            delay = Math.max(0, this.BACKGROUND_FLUSH_MS - timeSinceLastBackground);
        }

        this.flushTimer = setTimeout(() => {
            this.flush(priority);
            this.flushTimer = null;
        }, delay);
    }

    /**
     * Flush pending updates to store
     */
    private flush(priority: 'visible' | 'background' | 'both'): void {
        const now = Date.now();

        // Flush visible updates
        if (priority === 'visible' || priority === 'both') {
            this.flushVisible();
            this.lastVisibleFlush = now;
        }

        // Flush background updates
        if (priority === 'background' || priority === 'both') {
            this.flushBackground();
            this.lastBackgroundFlush = now;
        }
    }

    /**
     * Flush visible symbol updates (high priority, 60fps)
     */
    private flushVisible(): void {
        const updates = this.visibleUpdates;

        // Batch candles
        if (Object.keys(updates.candles).length > 0) {
            this.store.setAllCandles(updates.candles);
            updates.candles = {};
        }

        // Batch metrics
        if (Object.keys(updates.metrics).length > 0) {
            this.store.setAllMetrics(updates.metrics);
            updates.metrics = {};
        }

        // Update rankings
        if (updates.rankings !== null) {
            this.store.setRankings(updates.rankings);
            updates.rankings = null;
        }
    }

    /**
     * Flush background symbol updates (low priority, 1fps)
     */
    private flushBackground(): void {
        const updates = this.backgroundUpdates;

        // Batch candles
        if (Object.keys(updates.candles).length > 0) {
            this.store.setAllCandles(updates.candles);
            updates.candles = {};
        }

        // Batch metrics
        if (Object.keys(updates.metrics).length > 0) {
            this.store.setAllMetrics(updates.metrics);
            updates.metrics = {};
        }
    }

    /**
     * Force immediate flush (use sparingly)
     */
    forceFlush(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        this.flushVisible();
        this.flushBackground();
    }

    /**
     * Get statistics about pending updates
     */
    getStats(): {
        visibleCandles: number;
        visibleMetrics: number;
        backgroundCandles: number;
        backgroundMetrics: number;
        hasRankings: boolean;
    } {
        return {
            visibleCandles: Object.keys(this.visibleUpdates.candles).length,
            visibleMetrics: Object.keys(this.visibleUpdates.metrics).length,
            backgroundCandles: Object.keys(this.backgroundUpdates.candles).length,
            backgroundMetrics: Object.keys(this.backgroundUpdates.metrics).length,
            hasRankings: this.visibleUpdates.rankings !== null
        };
    }
}
