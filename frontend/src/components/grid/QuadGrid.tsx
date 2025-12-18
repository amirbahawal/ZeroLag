/**
 * QuadGrid Component
 * 
 * Specialized 4x4 grid layout for 16 charts - fills entire screen.
 * Renders 4 main quadrants, each containing a 2x2 grid of charts.
 * Wrapped in React.memo for performance optimization.
 */

import React, { memo, useMemo } from 'react';
import type { SymbolTopEntry } from '../../core/types';
import { ChartCell } from './ChartCell';
import { ChartSkeleton } from './ChartSkeleton';

interface QuadGridProps {
    symbols: SymbolTopEntry[];
}

/* =============================================
   QUADRANT COMPONENT
   ============================================= */

interface QuadrantProps {
    items: (SymbolTopEntry | undefined)[];
    startIndex: number;
    isLoading: boolean;
}

const Quadrant: React.FC<QuadrantProps> = memo(({ items, startIndex, isLoading }) => {
    return (
        <div
            className="quadrant-container h-full"
            style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: '1fr 1fr',
                gap: '12px', /* Gap between cells in quadrant */
            }}
        >
            {items.map((item, idx) => {
                const globalIndex = startIndex + idx;

                if (isLoading || !item) {
                    return <ChartSkeleton key={`skeleton-${globalIndex}`} />;
                }

                return (
                    <ChartCell
                        key={item.info.symbol}
                        entry={item}
                    />
                );
            })}
        </div>
    );
});

Quadrant.displayName = 'Quadrant';

/* =============================================
   MAIN COMPONENT
   ============================================= */

const QuadGridInner: React.FC<QuadGridProps> = ({ symbols }) => {
    const isLoading = symbols.length === 0;
    const items = isLoading ? Array.from({ length: 16 }) : symbols;

    // Memoize quadrant data
    const quadrants = useMemo(() => [
        { items: items.slice(0, 4), startIndex: 0 },
        { items: items.slice(4, 8), startIndex: 4 },
        { items: items.slice(8, 12), startIndex: 8 },
        { items: items.slice(12, 16), startIndex: 12 },
    ], [items]);

    return (
        <div
            className="flex-1 h-full"
            style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: '1fr 1fr',
                gap: '12px', /* Gap between quadrants */
            }}
        >
            {quadrants.map((quadrant, idx) => (
                <Quadrant
                    key={idx}
                    items={quadrant.items as (SymbolTopEntry | undefined)[]}
                    startIndex={quadrant.startIndex}
                    isLoading={isLoading}
                />
            ))}
        </div>
    );
};

/* =============================================
   MEMOIZED EXPORT
   ============================================= */

export const QuadGrid = memo(QuadGridInner, (prevProps, nextProps) => {
    if (prevProps.symbols.length !== nextProps.symbols.length) {
        return false;
    }

    for (let i = 0; i < prevProps.symbols.length; i++) {
        if (prevProps.symbols[i]?.info.symbol !== nextProps.symbols[i]?.info.symbol) {
            return false;
        }
    }

    return true;
});
