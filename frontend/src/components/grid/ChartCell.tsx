/**
 * ChartCell Component
 * 
 * Individual chart card displaying symbol data and candlestick chart.
 * Features hover effects, metric labels, and background watermark.
 */

import React from 'react';
import { TimeSeriesCandleChart } from '../charts/TimeSeriesCandleChart';
import { ChartAreaSkeleton } from './ChartSkeleton';
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
    const gridCount = useZeroLagStore(state => state.count);

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

    // Responsive font sizes
    const symbolSize = gridCount >= 25 ? 'text-[11px]' : gridCount >= 16 ? 'text-[12px]' : 'text-[13px]';
    const metricSize = gridCount >= 25 ? 'text-[9px]' : gridCount >= 16 ? 'text-[10px]' : 'text-[11px]';
    const badgeSize = gridCount >= 25 ? 'text-[8px]' : 'text-[9px]';

    return (
        <div
            className="w-full h-full flex flex-col relative overflow-hidden rounded-[10px] transition-all duration-200 group border border-[color:var(--border-subtle)] hover:border-[color:var(--accent-blue)] hover:-translate-y-[1px] hover:shadow-[0_0_18px_rgba(60,130,255,0.25)]"
            style={{
                background: 'linear-gradient(135deg, var(--bg-panel) 0%, #090b12 100%)',
                padding: gridCount >= 25 ? '8px 6px 4px 6px' : '12px 8px 6px 8px',
            }}
        >
            {/* Background Watermark */}
            <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0"
                style={{
                    fontSize: gridCount >= 25 ? '24px' : '32px',
                    fontWeight: 800,
                    color: 'rgba(255, 255, 255, 0.04)',
                    letterSpacing: '-0.02em'
                }}
            >
                {baseAsset}
            </div>

            {/* Header Row */}
            <div className={`flex justify-between items-center ${gridCount >= 25 ? 'mb-1' : 'mb-2'} relative z-10`}>
                {/* Left Side: Symbol + Badge */}
                <div className="flex items-center gap-1.5">
                    <span className={`${symbolSize} font-semibold text-[color:var(--text-main)] tracking-tight`}>{symbol}</span>
                    <span className={`${badgeSize} bg-[color:var(--accent-blue)] text-white px-1 py-0.5 rounded-[3px] font-bold leading-none`}>F</span>
                </div>

                {/* Right Side: Sort Metric Label */}
                <span className={`${metricSize} text-[color:var(--text-muted)] font-medium`}>
                    {getSortLabel(entry.sortMode, entry.sortScore, metrics)}
                </span>
            </div>

            {/* Chart Area */}
            <div className="flex-1 w-full min-h-0 relative z-10">
                {candles.length >= 5 ? (
                    <TimeSeriesCandleChart
                        symbol={symbol}
                        interval={interval}
                        candles={candles}
                    />
                ) : (
                    <ChartAreaSkeleton />
                )}
            </div>
        </div>
    );
};
