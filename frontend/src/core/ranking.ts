import type { SortMode, SymbolMetrics, SymbolTopEntry, SymbolInfo } from './types';
import { useZeroLagStore } from '../state/useZeroLagStore';

/**
 * Compute rankings for all sort modes
 * 
 * Spec 5.5:
 * - Descending: range_*, volume_*, gvolume
 * - Ascending: dext
 * 
 * This must be PURE - no React, no DOM, no side effects
 */
export function computeRankings(
    metricsBySymbol: Record<string, SymbolMetrics>,
    symbolInfo: Record<string, SymbolInfo>
): Record<SortMode, SymbolTopEntry[]> {
    const symbols = Object.keys(metricsBySymbol);

    // Helper to extract score for each mode
    function getScore(metrics: SymbolMetrics, mode: SortMode): number {
        switch (mode) {
            case 'range_5m': return metrics.ranges['5m'].pct;
            case 'range_15m': return metrics.ranges['15m'].pct;
            case 'range_1h': return metrics.ranges['1h'].pct;
            case 'range_4h': return metrics.ranges['4h'].pct;
            case 'volume_15m': return metrics.volume['15m'].quote;
            case 'volume_24h': return metrics.volume['24h'].quote;
            case 'gvolume': return metrics.growth.gVolume.ratio;
            case 'dext': return metrics.dailyExtremum.score;
            default: return 0;
        }
    }

    // Build entry for each symbol
    function buildEntry(symbol: string, mode: SortMode): SymbolTopEntry {
        const metrics = metricsBySymbol[symbol];
        const info = symbolInfo[symbol];
        const sortScore = getScore(metrics, mode);

        return { info, metrics, sortMode: mode, sortScore };
    }

    // Compute rankings for each mode
    const modes: SortMode[] = [
        'range_5m', 'range_15m', 'range_1h', 'range_4h',
        'dext', 'volume_15m', 'volume_24h', 'gvolume'
    ];

    const rankings: Record<SortMode, SymbolTopEntry[]> = {} as any;

    for (const mode of modes) {
        const entries = symbols.map(s => buildEntry(s, mode));

        // Sort: descending for most, ascending for dext
        if (mode === 'dext') {
            entries.sort((a, b) => a.sortScore - b.sortScore);  // Lower is better
        } else {
            entries.sort((a, b) => b.sortScore - a.sortScore);  // Higher is better
        }

        rankings[mode] = entries;
    }

    return rankings;
}

/**
 * Refresh rankings - wrapper for periodic updates with throttling
 */
let lastRankingUpdate = 0;
const RANKING_THROTTLE_MS = 2000;

export async function refreshRankings(): Promise<void> {
    const now = Date.now();
    if (now - lastRankingUpdate < RANKING_THROTTLE_MS) {
        return;  // Throttle
    }
    lastRankingUpdate = now;

    // Get current state
    const { metricsBySymbol, symbols, setRankings } = useZeroLagStore.getState();

    // Compute new rankings
    const rankings = computeRankings(metricsBySymbol, symbols);

    // Update store
    setRankings(rankings);
}
