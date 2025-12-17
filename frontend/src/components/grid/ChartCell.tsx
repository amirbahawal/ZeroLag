import React, { useEffect, useState } from 'react';
import { TimeSeriesCandleChart } from '../charts/TimeSeriesCandleChart';
import { ChartSkeleton } from './ChartSkeleton';
import type { SymbolTopEntry, SortMode, SymbolMetrics } from '../../core/types';
import { useZeroLagStore } from '../../state/useZeroLagStore';

import { validateAndLog } from '../../utils/candleValidator';

interface ChartCellProps {
    entry: SymbolTopEntry;
}

const EMPTY_ARRAY: any[] = [];

export const ChartCell: React.FC<ChartCellProps> = ({ entry }) => {
    const { symbol } = entry.info;

    // Use reactive metrics from store if available, otherwise fallback to entry metrics
    const storeMetrics = useZeroLagStore(state => state.metricsBySymbol[symbol]);
    const metrics = storeMetrics || entry.metrics;
    const interval = useZeroLagStore(state => state.interval);

    // Fetch candles from store
    const candles = useZeroLagStore(state => state.candles[`${symbol}:${interval}`] || EMPTY_ARRAY);

    // ====== DIAGNOSTIC CODE (TEMPORARY) ======
    const [renderCount, setRenderCount] = useState(0);

    useEffect(() => {
        setRenderCount(prev => prev + 1);
    }, []);

    useEffect(() => {
        console.group(`[ChartCell ${symbol}] Render #${renderCount}`);
        console.log('Props:', { symbol, interval });
        console.log('Candles received:', {
            type: typeof candles,
            isArray: Array.isArray(candles),
            length: candles?.length || 0,
            first: candles?.[0],
            last: candles?.[candles?.length - 1]
        });

        if (candles && candles.length > 0) {
            validateAndLog(symbol, candles);
        } else {
            console.warn('⚠️ No candles available');
        }

        console.groupEnd();
    }, [symbol, interval, candles, renderCount]);
    // ====== END DIAGNOSTIC CODE ======

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
    const priceColor = isGreen ? 'bg-[#0ECB81]' : 'bg-[#F6465D]';

    return (
        <div className="w-full h-full border border-gray-800 bg-black flex flex-col relative overflow-hidden group">

            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-start p-2 pointer-events-none">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-100">{symbol}</span>
                        <span className="text-[10px] bg-gray-800 text-gray-400 px-1 rounded">PERP</span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono mt-0.5">
                        {getSortLabel(entry.sortMode, entry.sortScore, metrics)}
                    </span>
                </div>

                <div className={`flex items-center px-1.5 py-0.5 rounded ${priceColor}`}>
                    <span className="text-xs font-bold text-white font-mono">
                        {lastPrice.toFixed(2)}
                    </span>
                </div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 w-full min-h-0 relative">
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
