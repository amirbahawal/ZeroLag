import { create } from 'zustand';
import { useMemo } from 'react';
import type {
    SortMode,
    Interval,
    SymbolInfo,
    SymbolMetrics,
    SymbolTopEntry
} from '../core/types';

export type ApiStatus = 'ok' | 'rate_limited' | 'error';

export interface ZeroLagState {
    // ========== CONTROLS ==========
    sortMode: SortMode;
    interval: Interval;
    count: 4 | 9 | 16 | 25;

    // ========== SYSTEM ==========
    apiStatus: ApiStatus;
    wsConnected: boolean;

    // ========== DATA ==========
    symbols: Record<string, SymbolInfo>;  // by symbol
    activeSymbols: string[];              // top 100 by volume_24h

    metricsBySymbol: Record<string, SymbolMetrics>;
    rankings: Record<SortMode, SymbolTopEntry[]>;

    // ========== ACTIONS ==========
    setSortMode: (mode: SortMode) => void;
    setInterval: (interval: Interval) => void;
    setCount: (count: 4 | 9 | 16 | 25) => void;

    setApiStatus: (status: ApiStatus) => void;
    setWsConnected: (connected: boolean) => void;

    setSymbols: (symbols: Record<string, SymbolInfo>) => void;
    setActiveSymbols: (symbols: string[]) => void;

    upsertMetrics: (symbol: string, metrics: SymbolMetrics) => void;
    updateMetricsBatch: (metrics: Record<string, SymbolMetrics>) => void;
    setRankings: (rankings: Record<SortMode, SymbolTopEntry[]>) => void;
}

// Initial state
const initialState: Partial<ZeroLagState> = {
    sortMode: 'volume_24h',
    interval: '1h',
    count: 16,
    apiStatus: 'ok',
    wsConnected: false,
    symbols: {},
    activeSymbols: [],
    metricsBySymbol: {},
    rankings: {
        range_5m: [],
        range_15m: [],
        range_1h: [],
        range_4h: [],
        dext: [],
        volume_15m: [],
        volume_24h: [],
        gvolume: []
    }
};

export const useZeroLagStore = create<ZeroLagState>((set) => ({
    ...initialState as ZeroLagState,

    setSortMode: (mode) => set({ sortMode: mode }),
    setInterval: (interval) => set({ interval }),
    setCount: (count) => set({ count }),

    setApiStatus: (status) => set({ apiStatus: status }),
    setWsConnected: (connected) => set({ wsConnected: connected }),

    setSymbols: (symbols) => set({ symbols }),
    setActiveSymbols: (symbols) => set({ activeSymbols: symbols }),

    upsertMetrics: (symbol, metrics) => set((state) => ({
        metricsBySymbol: {
            ...state.metricsBySymbol,
            [symbol]: metrics
        }
    })),

    updateMetricsBatch: (metrics) => set((state) => ({
        metricsBySymbol: {
            ...state.metricsBySymbol,
            ...metrics
        }
    })),
    setRankings: (rankings) => set({ rankings })
}));

/**
 * Derived selector: visible symbols
 */
export function useVisibleSymbols(): SymbolTopEntry[] {
    const sortMode = useZeroLagStore(state => state.sortMode);
    const count = useZeroLagStore(state => state.count);
    const rankings = useZeroLagStore(state => state.rankings);

    return useMemo(() => {
        const ranking = rankings[sortMode] || [];
        return ranking.slice(0, count);
    }, [rankings, sortMode, count]);
}

export function useSortMode(): SortMode {
    return useZeroLagStore(state => state.sortMode);
}
