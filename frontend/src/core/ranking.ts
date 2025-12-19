/**
 * ZeroLag Ranking System
 * 
 * Computes rankings for all sort modes based on symbol metrics.
 * All ranking functions are pure and handle incomplete data gracefully.
 * 
 * @module ranking
 */

import type { SortMode, SymbolMetrics, SymbolTopEntry, SymbolInfo } from './types';
import { useZeroLagStore } from '../state/useZeroLagStore';

/**
 * All supported sort modes with their sort directions.
 * 
 * Descending (higher = better): range_*, volume_*, gvolume
 * Ascending (lower = better): dext
 */
const SORT_MODES: SortMode[] = [
    'range_5m', 'range_15m', 'range_1h', 'range_4h',
    'dext', 'volume_15m', 'volume_24h', 'gvolume'
];

/**
 * Extract the sort score from metrics for a given sort mode.
 * 
 * Handles incomplete/missing data by returning 0 as fallback.
 * 
 * @param metrics - Symbol metrics to extract score from
 * @param mode - Sort mode to extract score for
 * @returns Sort score (0 if data is missing or invalid)
 * 
 * @pure No side effects
 */
export function extractSortScore(metrics: SymbolMetrics, mode: SortMode): number {
    if (!metrics) return 0;

    try {
        switch (mode) {
            case 'range_5m':
                return metrics.ranges?.['5m']?.pct ?? 0;
            case 'range_15m':
                return metrics.ranges?.['15m']?.pct ?? 0;
            case 'range_1h':
                return metrics.ranges?.['1h']?.pct ?? 0;
            case 'range_4h':
                return metrics.ranges?.['4h']?.pct ?? 0;
            case 'volume_15m':
                return metrics.volume?.['15m']?.quote ?? 0;
            case 'volume_24h':
                return metrics.volume?.['24h']?.quote ?? 0;
            case 'gvolume':
                return metrics.growth?.gVolume?.ratio ?? 0;
            case 'dext':
                return metrics.dailyExtremum?.score ?? 0;
            default:
                return 0;
        }
    } catch (error) {
        // Handle any unexpected errors gracefully
        return 0;
    }
}

/**
 * Build a SymbolTopEntry for a given symbol and sort mode.
 * 
 * Handles missing symbolInfo by creating a minimal entry.
 * 
 * @param symbol - Symbol name
 * @param metrics - Symbol metrics
 * @param symbolInfo - Symbol information lookup
 * @param mode - Sort mode
 * @returns SymbolTopEntry with extracted sort score
 * 
 * @pure No side effects
 */
function buildEntry(
    symbol: string,
    metrics: SymbolMetrics,
    symbolInfo: Record<string, SymbolInfo>,
    mode: SortMode
): SymbolTopEntry {
    const info = symbolInfo[symbol] || {
        symbol,
        baseAsset: symbol.replace('USDT', ''),
        quoteAsset: 'USDT',
        marketType: 'futures' as const,
        status: 'TRADING'
    };

    const sortScore = extractSortScore(metrics, mode);

    return {
        info,
        metrics,
        sortMode: mode,
        sortScore
    };
}

/**
 * Compute rankings for all sort modes.
 * 
 * Creates a ranked list of symbols for each sort mode, with proper
 * sort direction (ascending for dext, descending for all others).
 * 
 * **Specification (5.5):**
 * - Descending: range_5m, range_15m, range_1h, range_4h, volume_15m, volume_24h, gvolume
 * - Ascending: dext (lower score = closer to extremum = better)
 * 
 * **Sort Directions:**
 * - range_* modes: Higher volatility % = Higher rank (descending)
 * - volume_* modes: Higher volume = Higher rank (descending)
 * - gvolume: Higher ratio = Higher rank (descending)
 * - dext: Lower score = Closer to extremum = Higher rank (ascending)
 * 
 * **Edge Cases:**
 * - Missing metrics → Score defaults to 0
 * - Missing symbolInfo → Creates minimal info entry
 * - Invalid/NaN scores → Treated as 0
 * - Empty metricsBySymbol → Returns empty arrays for all modes
 * 
 * **Example:**
 * ```typescript
 * const rankings = computeRankings(metricsBySymbol, symbolInfo);
 * const topVolume = rankings['volume_24h'][0]; // Highest volume symbol
 * const nearestDext = rankings['dext'][0];     // Closest to extremum
 * ```
 * 
 * @param metricsBySymbol - Map of symbol to metrics
 * @param symbolInfo - Map of symbol to info
 * @returns Map of sort mode to ranked symbol entries
 * 
 * @pure No side effects, deterministic output
 */
/**
 * Compute rankings for all sort modes.
 * 
 * Creates a ranked list of symbols for each sort mode, with proper
 * sort direction (ascending for dext, descending for all others).
 * 
 * **Specification (5.5):**
 * - Descending: range_5m, range_15m, range_1h, range_4h, volume_15m, volume_24h, gvolume
 * - Ascending: dext (lower score = closer to extremum = better)
 * - Result: Top 100 symbols for each mode
 * 
 * @param metricsBySymbol - Map of symbol to metrics
 * @returns Map of sort mode to ranked symbol entries
 * 
 * @pure This function is pure and has no side effects.
 */
export function computeRankings(
    metricsBySymbol: Record<string, SymbolMetrics>
): Record<SortMode, SymbolTopEntry[]> {
    const symbols = Object.keys(metricsBySymbol);

    // Initialize rankings object
    const rankings: Record<SortMode, SymbolTopEntry[]> = {} as any;

    // Compute rankings for each sort mode
    for (const mode of SORT_MODES) {
        // Build entries for all symbols
        const entries = symbols
            .map(symbol => {
                const metrics = metricsBySymbol[symbol];
                const sortScore = extractSortScore(metrics, mode);
                return {
                    info: metrics.info,
                    metrics,
                    sortMode: mode,
                    sortScore
                };
            })
            .filter(entry => {
                // Filter out NaN scores, but allow Infinity (important for dext sorting to bottom)
                const score = entry.sortScore;
                return !isNaN(score);
            });

        // Sort based on mode
        if (mode === 'dext') {
            // Ascending: lower score = closer to extremum = better
            // Infinity will naturally sort to the end
            entries.sort((a, b) => {
                if (a.sortScore === b.sortScore) return 0;
                return a.sortScore > b.sortScore ? 1 : -1;
            });
        } else {
            // Descending: higher value = better
            // 0 will naturally sort to the end
            entries.sort((a, b) => {
                if (a.sortScore === b.sortScore) return 0;
                return a.sortScore < b.sortScore ? 1 : -1;
            });
        }

        // Return top 100 (or all if fewer)
        rankings[mode] = entries.slice(0, 100);
    }

    return rankings;
}

/**
 * Refresh rankings with throttling.
 * 
 * Updates the global rankings in the Zustand store, but throttles
 * updates to avoid excessive recalculation.
 * 
 * **Throttle:** 2000ms (2 seconds)
 * 
 * @returns Promise that resolves when rankings are updated (or throttled)
 */
let lastRankingUpdate = 0;
const RANKING_THROTTLE_MS = 2000;

export async function refreshRankings(): Promise<void> {
    const now = Date.now();

    // Throttle updates
    if (now - lastRankingUpdate < RANKING_THROTTLE_MS) {
        return;
    }

    lastRankingUpdate = now;

    // Get current state
    const { metricsBySymbol, setRankings } = useZeroLagStore.getState();

    // Compute new rankings
    const rankings = computeRankings(metricsBySymbol);

    // Update store
    setRankings(rankings);
}

/**
 * Force refresh rankings without throttling.
 * 
 * Use this when you need immediate ranking updates (e.g., after
 * changing sort mode or loading new data).
 * 
 * @returns Promise that resolves when rankings are updated
 */
export async function forceRefreshRankings(): Promise<void> {
    lastRankingUpdate = 0; // Reset throttle
    return refreshRankings();
}
