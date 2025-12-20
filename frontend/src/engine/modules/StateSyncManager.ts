import type { ZeroLagState } from '../../state/useZeroLagStore';
import type { SymbolMetrics, SymbolTopEntry, SortMode } from '../../core/types';

interface PendingUpdates {
    metrics: Record<string, SymbolMetrics>;
    rankings: Record<SortMode, SymbolTopEntry[]> | null;
}

export class StateSyncManager {
    private store: ZeroLagState;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private visibleSymbols = new Set<string>();
    private visibleUpdates: PendingUpdates = { metrics: {}, rankings: null };
    private backgroundUpdates: PendingUpdates = { metrics: {}, rankings: null };
    private readonly VISIBLE_FLUSH_MS = 16;
    private readonly BACKGROUND_FLUSH_MS = 1000;
    private lastVisibleFlush = 0;
    private lastBackgroundFlush = 0;

    constructor(store: ZeroLagState) { this.store = store; }

    setVisibleSymbols(symbols: string[]): void { this.visibleSymbols = new Set(symbols); }

    queueMetricsUpdate(metrics: Record<string, SymbolMetrics>): void {
        for (const [symbol, metric] of Object.entries(metrics)) {
            if (this.visibleSymbols.has(symbol)) this.visibleUpdates.metrics[symbol] = metric;
            else this.backgroundUpdates.metrics[symbol] = metric;
        }
        this.scheduleFlush('both');
    }

    queueRankingsUpdate(rankings: Record<SortMode, SymbolTopEntry[]>): void {
        this.visibleUpdates.rankings = rankings;
        this.scheduleFlush('visible');
    }

    private scheduleFlush(priority: 'visible' | 'background' | 'both'): void {
        if (this.flushTimer !== null) return;
        const now = Date.now();
        let delay = 0;
        if (priority === 'visible' || priority === 'both') {
            delay = Math.max(0, this.VISIBLE_FLUSH_MS - (now - this.lastVisibleFlush));
        } else {
            delay = Math.max(0, this.BACKGROUND_FLUSH_MS - (now - this.lastBackgroundFlush));
        }
        this.flushTimer = setTimeout(() => {
            this.flush(priority);
            this.flushTimer = null;
        }, delay);
    }

    private flush(priority: 'visible' | 'background' | 'both'): void {
        const now = Date.now();
        if (priority === 'visible' || priority === 'both') {
            this.flushVisible();
            this.lastVisibleFlush = now;
        }
        if (priority === 'background' || priority === 'both') {
            this.flushBackground();
            this.lastBackgroundFlush = now;
        }
    }

    private flushVisible(): void {
        if (Object.keys(this.visibleUpdates.metrics).length > 0) {
            this.store.updateMetricsBatch(this.visibleUpdates.metrics);
            this.visibleUpdates.metrics = {};
        }
        if (this.visibleUpdates.rankings !== null) {
            this.store.setRankings(this.visibleUpdates.rankings);
            this.visibleUpdates.rankings = null;
        }
    }

    private flushBackground(): void {
        if (Object.keys(this.backgroundUpdates.metrics).length > 0) {
            this.store.updateMetricsBatch(this.backgroundUpdates.metrics);
            this.backgroundUpdates.metrics = {};
        }
    }

    forceFlush(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.flushVisible();
        this.flushBackground();
    }

    getStats() {
        return {
            visibleMetrics: Object.keys(this.visibleUpdates.metrics).length,
            backgroundMetrics: Object.keys(this.backgroundUpdates.metrics).length,
            hasRankings: this.visibleUpdates.rankings !== null
        };
    }
}
