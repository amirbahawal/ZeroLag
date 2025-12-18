/**
 * ChartCell Component
 * 
 * Individual chart card displaying symbol data and candlestick chart.
 * Features hover effects, metric labels, and background watermark.
 */

import React from 'react';
import { TimeSeriesCandleChart } from '../charts/TimeSeriesCandleChart';
import { ChartSkeleton } from './ChartSkeleton';
import type { SymbolTopEntry, SortMode, SymbolMetrics } from '../../core/types';
import { useZeroLagStore } from '../../state/useZeroLagStore';

interface ChartCellProps {
    entry: SymbolTopEntry;
}

const EMPTY_ARRAY: any[] = [];

export const ChartCell: React.FC<ChartCellProps> = ({ entry }) => {
    const { symbol, baseAsset } = entry.info;

    // Use reactive metrics from store if available, otherwise fallback to entry metrics
    const storeMetrics = useZeroLagStore(state => state.metricsBySymbol[symbol]);
    const metrics = storeMetrics || entry.metrics;
    const interval = useZeroLagStore(state => state.interval);

    // Fetch candles from store
    const candles = useZeroLagStore(state => state.candles[`${symbol}:${interval}`] || EMPTY_ARRAY);

    // Helper to format sort label
    const getSortLabel = (mode: SortMode, score: number, metrics: SymbolMetrics) => {
        switch (mode) {
            case 'volume_24h':
                return `24h Vol ${(score / 1000000).toFixed(1)}M`;
            case 'volume_15m':
                return `15m Vol ${(score / 1000000).toFixed(1)}M`;
            case 'range_5m':
            case 'range_15m':
            case 'range_1h':
            case 'range_4h':
                return `Range ${(score * 100).toFixed(2)}%`;
            case 'gvolume':
                return `Growth ${score.toFixed(1)}x`;
            case 'dext':
                const { nearestSide, distToHighPct, distToLowPct } = metrics.dailyExtremum;
                if (nearestSide === 'high') return `▲ ${(distToHighPct * 100).toFixed(2)}% from high`;
                if (nearestSide === 'low') return `▼ ${(distToLowPct * 100).toFixed(2)}% from low`;
                return '-';
            default:
                return '';
        }
    };

    // Determine color for price badge
    const lastPrice = metrics?.lastPrice || 0;
    const openPrice = candles.length > 0 ? candles[candles.length - 1].open : lastPrice;
    const isGreen = lastPrice >= openPrice;
    const priceColor = isGreen ? '#0ECB81' : '#F6465D';

    return (
        <div
            className="w-full h-full flex flex-col relative overflow-hidden rounded-[10px] transition-all group"
            style={{
                background: 'linear-gradient(135deg, var(--bg-panel, #1a1d21) 0%, var(--bg-panel-soft, #14161a) 100%)',
                border: '1px solid var(--border-subtle, #2a2d31)',
                padding: '12px 8px 6px 8px',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.15)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* Background Watermark */}
            <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
                style={{
                    fontSize: '32px',
                    fontWeight: 900,
                    color: 'rgba(255, 255, 255, 0.04)',
                    zIndex: 0,
                }}
            >
                {baseAsset}
            </div>

            {/* Header Row */}
            <div className="flex justify-between items-start mb-2 relative z-10">
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-white">{symbol}</span>
                        <span className="text-[9px] bg-blue-600 text-white px-1 py-0.5 rounded font-bold">F</span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono mt-0.5">
                        {getSortLabel(entry.sortMode, entry.sortScore, metrics)}
                    </span>
                </div>

                <div
                    className="flex items-center px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: priceColor }}
                >
                    <span className="text-xs font-bold text-white font-mono">
                        {lastPrice.toFixed(2)}
                    </span>
                </div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 w-full min-h-0 relative z-10">
                {candles.length > 0 ? (
                    <TimeSeriesCandleChart
                        symbol={symbol}
                        interval={interval}
                        candles={candles}
                    />
                ) : (
                    <ChartSkeleton />
                )}
            </div>
        </div>
    );
};
