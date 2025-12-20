import type { SortMode, SymbolMetrics, SymbolTopEntry } from './types';
import { useZeroLagStore } from '../state/useZeroLagStore';

const SORT_MODES: SortMode[] = [
    'range_5m', 'range_15m', 'range_1h', 'range_4h',
    'dext', 'volume_15m', 'volume_24h', 'gvolume'
];

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
        return 0;
    }
}

export function computeRankings(
    metricsBySymbol: Record<string, SymbolMetrics>
): Record<SortMode, SymbolTopEntry[]> {
    const symbols = Object.keys(metricsBySymbol);
    const rankings: Record<SortMode, SymbolTopEntry[]> = {} as any;

    for (const mode of SORT_MODES) {
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
            .filter(entry => !isNaN(entry.sortScore));

        if (mode === 'dext') {
            entries.sort((a, b) => {
                if (a.sortScore === b.sortScore) return 0;
                return a.sortScore > b.sortScore ? 1 : -1;
            });
        } else {
            entries.sort((a, b) => {
                if (a.sortScore === b.sortScore) return 0;
                return a.sortScore < b.sortScore ? 1 : -1;
            });
        }

        rankings[mode] = entries.slice(0, 100);
    }

    return rankings;
}

let lastRankingUpdate = 0;
const RANKING_THROTTLE_MS = 2000;

export async function refreshRankings(): Promise<void> {
    const now = Date.now();

    if (now - lastRankingUpdate < RANKING_THROTTLE_MS) {
        return;
    }

    lastRankingUpdate = now;
    const { metricsBySymbol, setRankings } = useZeroLagStore.getState();
    const rankings = computeRankings(metricsBySymbol);
    setRankings(rankings);
}

export async function forceRefreshRankings(): Promise<void> {
    lastRankingUpdate = 0;
    return refreshRankings();
}
