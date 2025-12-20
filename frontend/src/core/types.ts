export type MarketType = 'futures';

export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export type RangeWindow = '5m' | '15m' | '1h' | '4h';

export type VolumeWindow = '15m' | '4h' | '24h';

export type SortMode =
    | 'range_5m' | 'range_15m' | 'range_1h' | 'range_4h'
    | 'dext' | 'volume_15m' | 'volume_24h' | 'gvolume';

export type ExtremumSide = 'high' | 'low' | 'none';

export interface Candle {
    symbol: string;
    interval: Interval;
    openTime: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volumeBase: number;
    volumeQuote: number | null;
    trades: number | null;
    isFinal: boolean;
}

export interface SymbolInfo {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    marketType: MarketType;
    status: string;
}

export interface RangeMetric {
    window: RangeWindow;
    high: number;
    low: number;
    abs: number;
    pct: number;
    inactive: boolean;
}

export interface VolumeMetric {
    window: VolumeWindow;
    base: number;
    quote: number;
}

export interface DailyExtremumMetric {
    high24h: number;
    low24h: number;
    lastPrice: number;
    distToHighPct: number;
    distToLowPct: number;
    nearestSide: ExtremumSide;
    score: number;
}

export interface GrowthMetric {
    currentWindow: '15m';
    baselineWindow: '4h';
    baselinePer15m: number;
    current: number;
    ratio: number;
    delta: number;
}

export interface SymbolMetrics {
    info: SymbolInfo;
    lastPrice: number;
    lastUpdateTs: number;
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
        gVolume: GrowthMetric;
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
