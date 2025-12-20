import React, { useEffect, useRef } from 'react';
import type { Candle } from '../core/types';

export const ChartDiagnostics: React.FC<{
    symbol: string;
    interval: string;
    candles: Candle[];
}> = ({ symbol, interval, candles }) => {
    const renderCountRef = useRef(0);
    renderCountRef.current += 1;

    useEffect(() => {
        console.log(`%c[Chart ${symbol}]`, 'color: cyan', {
            render: renderCountRef.current,
            candles: candles?.length || 0,
            isArray: Array.isArray(candles),
            first: candles?.[0],
            last: candles?.[candles?.length - 1]
        });
    }, [symbol, interval, candles]);

    if (!import.meta.env.DEV) return null;

    return (
        <div style={{
            position: 'absolute',
            top: 2,
            left: 2,
            fontSize: '9px',
            fontFamily: 'monospace',
            background: 'rgba(0,0,0,0.7)',
            color: candles?.length > 0 ? '#0f0' : '#f00',
            padding: '2px 4px',
            borderRadius: '2px',
            zIndex: 1000,
            pointerEvents: 'none'
        }}>
            {symbol} | {candles?.length || 0} bars
        </div>
    );
};
