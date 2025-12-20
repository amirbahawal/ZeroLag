import React from 'react';
import type uPlot from 'uplot';

interface RulerOverlayProps {
    uPlotInstance: uPlot | null;
    anchorIndex: number | null;
    anchorPrice: number | null;
    currentIndex: number | null;
    currentPrice: number | null;
}

export const RulerOverlay: React.FC<RulerOverlayProps> = ({
    uPlotInstance,
    anchorIndex,
    anchorPrice,
    currentIndex,
    currentPrice
}) => {
    if (!uPlotInstance || anchorIndex === null || currentIndex === null || anchorPrice === null || currentPrice === null) {
        return null;
    }

    const u = uPlotInstance;
    const t1 = u.data[0][anchorIndex];
    const t2 = u.data[0][currentIndex];

    if (t1 === undefined || t2 === undefined) return null;

    const x1 = u.valToPos(t1, 'x', true);
    const x2 = u.valToPos(t2, 'x', true);
    const y1 = u.valToPos(anchorPrice, 'y', true);
    const y2 = u.valToPos(currentPrice, 'y', true);

    const deltaPrice = currentPrice - anchorPrice;
    const deltaPct = (deltaPrice / anchorPrice) * 100;
    const deltaBars = Math.abs(currentIndex - anchorIndex);

    const isPositive = deltaPrice >= 0;
    const colorPrice = isPositive ? '#1fd39a' : '#f45b6c';

    return (
        <svg
            className="absolute inset-0 pointer-events-none z-50"
            style={{ width: '100%', height: '100%' }}
        >
            <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
                    <feOffset dx="0" dy="1" result="offsetblur" />
                    <feComponentTransfer>
                        <feFuncA type="linear" slope="0.5" />
                    </feComponentTransfer>
                    <feMerge>
                        <feMergeNode />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#1cd0f9"
                strokeWidth={2}
                strokeDasharray="4 4"
                filter="url(#shadow)"
            />

            <circle cx={x1} cy={y1} r={4} fill="#1cd0f9" stroke="white" strokeWidth={1} />
            <circle cx={x2} cy={y2} r={4} fill="#f6b44d" stroke="white" strokeWidth={1} />

            <foreignObject x={8} y={8} width={140} height={70}>
                <div style={{
                    background: 'rgba(10, 15, 20, 0.95)',
                    border: '1px solid rgba(28, 208, 249, 0.3)',
                    borderRadius: '6px',
                    padding: '8px',
                    fontSize: '10px',
                    color: '#fff',
                    fontFamily: 'Inter, sans-serif',
                    backdropFilter: 'blur(4px)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>Δ Price</span>
                        <span style={{ fontWeight: 'bold' }}>{isPositive ? '+' : ''}{deltaPrice.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>Δ %</span>
                        <span style={{ fontWeight: 'bold', color: colorPrice }}>{isPositive ? '+' : ''}{deltaPct.toFixed(2)}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>Δ Bars</span>
                        <span style={{ fontWeight: 'bold' }}>{deltaBars}</span>
                    </div>
                </div>
            </foreignObject>
        </svg>
    );
};
