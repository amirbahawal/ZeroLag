export type MarketType = 'futures';
export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type RangeWindow = '5m' | '15m' | '1h' | '4h';
export type VolumeWindow = '15m' | '4h' | '24h';
export type SortMode =
    | 'range_5m' | 'range_15m' | 'range_1h' | 'range_4h'
    | 'dext' | 'volume_15m' | 'volume_24h' | 'gvolume';

export interface Candle {
    symbol: string;
    interval: Interval;
    openTime: number;      // ms
    closeTime: number;     // ms
    open: number;
    high: number;
    low: number;
    close: number;
    volumeBase: number;    // Spec: volumeBase
    volumeQuote: number;   // Spec: volumeQuote
    trades: number | null;
    isFinal: boolean;
}

export interface RangeMetric {
    window: RangeWindow;
    high: number;
    low: number;
    abs: number;    // high - low
    pct: number;    // (high - low) / low
}

export interface VolumeMetric {
    window: VolumeWindow;
    base: number;
    quote: number;  // Used for ranking
}

export type ExtremumSide = 'high' | 'low' | 'none';

export interface DailyExtremumMetric {
    high24h: number;
    low24h: number;
    lastPrice: number;
    distToHighPct: number;  // (high24h - lastPrice) / high24h
    distToLowPct: number;   // (lastPrice - low24h) / low24h
    nearestSide: ExtremumSide;
    score: number;          // min(distToHighPct, distToLowPct)
}

export interface GrowthMetric {
    currentWindow: '15m';
    baselineWindow: '4h';
    baselinePer15m: number;
    current: number;
    ratio: number;  // current / baselinePer15m
    delta: number;  // ratio - 1
}

export interface SymbolMetrics {
    symbol: string;
    marketType: MarketType;
    lastPrice: number;
    lastUpdateTs: number;
    change24h: number;  // Kept for UI display

    ranges: {
        '5m': RangeMetric;
        '15m': RangeMetric;
        '1h': RangeMetric;
        '4h': RangeMetric;
    };

    volume: {
        '15m': VolumeMetric;
        '4h': VolumeMetric;
        '24h': VolumeMetric;
    };

    growth: {
        gVolume: GrowthMetric; // Spec: nested object
    };

    dailyExtremum: DailyExtremumMetric;

    currentSortScore?: number;
}

export interface SymbolTopEntry {
    info: SymbolInfo;
    metrics: SymbolMetrics;
    sortMode: SortMode;
    sortScore: number;
}

export interface SymbolInfo {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    marketType: MarketType;
    status: string;
}
