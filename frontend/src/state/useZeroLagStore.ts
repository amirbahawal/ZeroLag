import { create } from 'zustand';
import { useMemo } from 'react';
import type {
    SortMode,
    Interval,
    SymbolInfo,
    SymbolMetrics,
    SymbolTopEntry,
    Candle
} from '../core/types';

export type ApiStatus = 'ok' | 'rate_limited' | 'error' | 'loading';

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
    candles: Record<string, Candle[]>; // Key: "symbol:interval"
    searchQuery: string;
    page: number;

    // ========== ACTIONS ==========
    setSortMode: (mode: SortMode) => void;
    setInterval: (interval: Interval) => void;
    setCount: (count: 4 | 9 | 16 | 25) => void;
    setSearchQuery: (query: string) => void;
    setPage: (page: number) => void;

    setApiStatus: (status: ApiStatus) => void;
    setWsConnected: (connected: boolean) => void;

    setSymbols: (symbols: Record<string, SymbolInfo>) => void;
    setActiveSymbols: (symbols: string[]) => void;

    upsertMetrics: (symbol: string, metrics: SymbolMetrics) => void;
    setRankings: (rankings: Record<SortMode, SymbolTopEntry[]>) => void;
    setCandlesForSymbol: (symbol: string, interval: Interval, candles: Candle[]) => void;
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
    },
    candles: {},
    searchQuery: '',
    page: 1
};

export const useZeroLagStore = create<ZeroLagState>((set) => ({
    ...initialState as ZeroLagState,

    setSortMode: (mode) => set({ sortMode: mode }),
    setInterval: (interval) => set({ interval }),
    setCount: (count) => set({ count }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setPage: (page) => set({ page }),

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

    setRankings: (rankings) => set({ rankings }),

    setCandlesForSymbol: (symbol, interval, candles) => set((state) => ({
        candles: {
            ...state.candles,
            [`${symbol}:${interval}`]: candles
        }
    }))
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

export function usePage(): number {
    return useZeroLagStore(state => state.page);
}

export function useTotalPages(): number {
    const sortMode = useZeroLagStore(state => state.sortMode);
    const count = useZeroLagStore(state => state.count);
    const rankings = useZeroLagStore(state => state.rankings);

    return useMemo(() => {
        const ranking = rankings[sortMode] || [];
        return Math.ceil(ranking.length / count);
    }, [rankings, sortMode, count]);
}

export function useSortMode(): SortMode {
    return useZeroLagStore(state => state.sortMode);
}
