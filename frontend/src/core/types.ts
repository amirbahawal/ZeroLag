/**
 * ZeroLag Type System
 * 
 * This file defines all core TypeScript types and interfaces for the ZeroLag application.
 * These types form the foundation of the entire system, from data fetching to metric
 * calculation to UI rendering.
 * 
 * @module types
 */

// ============================================================================
// ENUMS & LITERAL TYPES
// ============================================================================

/**
 * Supported market types.
 * Currently only supports Binance Futures perpetual contracts.
 */
export type MarketType = 'futures';

/**
 * Candlestick chart intervals.
 * These intervals are used for candle data fetching and chart display.
 * 
 * Available intervals:
 * - 1m: 1 minute
 * - 5m: 5 minutes
 * - 15m: 15 minutes
 * - 1h: 1 hour
 * - 4h: 4 hours
 * - 1d: 1 day
 */
export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

/**
 * Time windows for range (volatility) metrics.
 * Used to calculate high-low price ranges over specific time periods.
 * 
 * Available windows:
 * - 5m: 5-minute range
 * - 15m: 15-minute range
 * - 1h: 1-hour range
 * - 4h: 4-hour range
 */
export type RangeWindow = '5m' | '15m' | '1h' | '4h';

/**
 * Time windows for volume metrics.
 * Used to aggregate trading volume over specific time periods.
 * 
 * Available windows:
 * - 15m: 15-minute volume
 * - 4h: 4-hour volume
 * - 24h: 24-hour volume
 */
export type VolumeWindow = '15m' | '4h' | '24h';

/**
 * Sort modes for ranking symbols.
 * Each mode ranks symbols based on a different metric.
 * 
 * Available modes:
 * - range_5m, range_15m, range_1h, range_4h: Price volatility over different time periods
 * - dext: Daily extremum - proximity to 24h high/low
 * - volume_15m, volume_24h: Trading volume over different time periods
 * - gvolume: Volume growth/acceleration (15m volume vs 4h average)
 * 
 * Sorting behavior:
 * - Most modes: Descending (higher value = higher rank)
 * - dext: Ascending (lower score = closer to extremum = higher rank)
 */
export type SortMode =
    | 'range_5m' | 'range_15m' | 'range_1h' | 'range_4h'
    | 'dext' | 'volume_15m' | 'volume_24h' | 'gvolume';

/**
 * Side of the daily price range where the current price is closest.
 * Used in daily extremum calculations.
 * 
 * - 'high': Price is closer to 24h high
 * - 'low': Price is closer to 24h low
 * - 'none': No extremum detected or invalid data
 */
export type ExtremumSide = 'high' | 'low' | 'none';

// ============================================================================
// CORE DATA STRUCTURES
// ============================================================================

/**
 * Candlestick (OHLCV) data for a single time period.
 * 
 * This represents a single candle from the Binance API, containing
 * price and volume information for a specific time interval.
 * 
 * @property symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @property interval - Time interval of this candle
 * @property openTime - Candle start time in milliseconds (Unix timestamp)
 * @property closeTime - Candle end time in milliseconds (Unix timestamp)
 * @property open - Opening price
 * @property high - Highest price during the period
 * @property low - Lowest price during the period
 * @property close - Closing price
 * @property volumeBase - Volume in base asset (e.g., BTC in BTCUSDT)
 * @property volumeQuote - Volume in quote asset (e.g., USDT in BTCUSDT)
 * @property trades - Number of trades during the period (null if unavailable)
 * @property isFinal - Whether this candle is complete/final or still updating
 */
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
    volumeQuote: number;
    trades: number | null;
    isFinal: boolean;
}

/**
 * Basic information about a trading symbol.
 * 
 * Contains static metadata that doesn't change frequently,
 * fetched from Binance exchange info endpoint.
 * 
 * @property symbol - Full trading pair symbol (e.g., "BTCUSDT")
 * @property baseAsset - Base asset ticker (e.g., "BTC")
 * @property quoteAsset - Quote asset ticker (e.g., "USDT")
 * @property marketType - Type of market (currently only 'futures')
 * @property status - Trading status (e.g., "TRADING", "HALT")
 */
export interface SymbolInfo {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    marketType: MarketType;
    status: string;
}

// ============================================================================
// METRIC STRUCTURES
// ============================================================================

/**
 * Price range (volatility) metric for a time window.
 * 
 * Calculates the high-low price range over a specific time period,
 * which indicates price volatility and potential trading opportunities.
 * 
 * Formula: pct = (high - low) / low
 * 
 * @property window - Time window for this range calculation
 * @property high - Highest price in the window
 * @property low - Lowest price in the window
 * @property abs - Absolute range (high - low)
 * @property pct - Percentage range relative to low price
 */
export interface RangeMetric {
    window: RangeWindow;
    high: number;
    low: number;
    abs: number;
    pct: number;
}

/**
 * Trading volume metric for a time window.
 * 
 * Aggregates trading volume over a specific time period.
 * Quote volume (USDT) is primarily used for ranking.
 * 
 * @property window - Time window for this volume calculation
 * @property base - Total volume in base asset
 * @property quote - Total volume in quote asset (used for ranking)
 */
export interface VolumeMetric {
    window: VolumeWindow;
    base: number;
    quote: number;
}

/**
 * Daily extremum (dExt) metric.
 * 
 * Measures how close the current price is to the 24-hour high or low.
 * Useful for identifying potential breakouts or reversals.
 * 
 * Formula:
 * - distToHighPct = (high24h - lastPrice) / high24h
 * - distToLowPct = (lastPrice - low24h) / low24h
 * - score = min(distToHighPct, distToLowPct)
 * 
 * Lower score = closer to an extremum
 * 
 * @property high24h - 24-hour high price
 * @property low24h - 24-hour low price
 * @property lastPrice - Current price
 * @property distToHighPct - Distance to 24h high as percentage
 * @property distToLowPct - Distance to 24h low as percentage
 * @property nearestSide - Which extremum the price is closer to
 * @property score - Final dExt score (lower = closer to extremum)
 */
export interface DailyExtremumMetric {
    high24h: number;
    low24h: number;
    lastPrice: number;
    distToHighPct: number;
    distToLowPct: number;
    nearestSide: ExtremumSide;
    score: number;
}

/**
 * Volume growth (gVolume) metric.
 * 
 * Detects volume acceleration by comparing recent volume to a baseline average.
 * Useful for identifying sudden spikes in trading activity.
 * 
 * Formula:
 * - baselinePer15m = volume_4h / 16 (average 15m volume over 4h)
 * - ratio = volume_15m / baselinePer15m
 * - delta = ratio - 1
 * 
 * Ratio > 1.0 means volume is above average
 * Ratio of 3.0 means 3x normal volume
 * 
 * @property currentWindow - Current measurement window (always '15m')
 * @property baselineWindow - Baseline window for comparison (always '4h')
 * @property baselinePer15m - Average 15m volume over the 4h baseline
 * @property current - Current 15m volume
 * @property ratio - Current volume / baseline (the gVolume score)
 * @property delta - Growth delta (ratio - 1)
 */
export interface GrowthMetric {
    currentWindow: '15m';
    baselineWindow: '4h';
    baselinePer15m: number;
    current: number;
    ratio: number;
    delta: number;
}

// ============================================================================
// AGGREGATE STRUCTURES
// ============================================================================

/**
 * Complete metrics package for a single symbol.
 * 
 * Contains all calculated metrics used for ranking and display.
 * This is the primary data structure stored in the Zustand state.
 * 
 * @property symbol - Trading pair symbol
 * @property marketType - Type of market
 * @property lastPrice - Most recent price
 * @property lastUpdateTs - Timestamp of last update (milliseconds)
 * @property change24h - 24-hour price change percentage (for UI display)
 * @property ranges - Range metrics for all supported time windows
 * @property volume - Volume metrics for all supported time windows
 * @property growth - Growth metrics (currently only gVolume)
 * @property dailyExtremum - Daily extremum metric
 * @property currentSortScore - Cached sort score for current sort mode (optional)
 */
export interface SymbolMetrics {
    symbol: string;
    marketType: MarketType;
    lastPrice: number;
    lastUpdateTs: number;
    change24h: number;

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

/**
 * Ranked symbol entry for display in the grid.
 * 
 * Combines symbol information, metrics, and ranking metadata.
 * This is the structure used in the rankings arrays stored in Zustand.
 * 
 * @property info - Static symbol information
 * @property metrics - Complete calculated metrics
 * @property sortMode - The sort mode this entry was ranked with
 * @property sortScore - The score used for ranking (extracted from metrics)
 */
export interface SymbolTopEntry {
    info: SymbolInfo;
    metrics: SymbolMetrics;
    sortMode: SortMode;
    sortScore: number;
}
