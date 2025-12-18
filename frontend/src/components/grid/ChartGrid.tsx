/**
 * ChartGrid Component
 * 
 * Responsive grid layout for displaying chart cells.
 * Automatically adjusts grid template based on count (4, 9, 16, or 25).
 * Shows ChartCell for loaded data, ChartSkeleton while loading.
 */

import React, { useMemo } from 'react';
import { useZeroLagStore, useVisibleSymbols } from '../../state/useZeroLagStore';
import { ChartCell } from './ChartCell';
import { ChartSkeleton } from './ChartSkeleton';

export const ChartGrid: React.FC = () => {
    const count = useZeroLagStore(state => state.count);
    const visibleSymbols = useVisibleSymbols();

    // Calculate grid columns/rows based on count
    const gridClass = useMemo(() => {
        switch (count) {
            case 4: return 'grid-cols-2 grid-rows-2';
            case 9: return 'grid-cols-3 grid-rows-3';
            case 16: return 'grid-cols-4 grid-rows-4';
            case 25: return 'grid-cols-5 grid-rows-5';
            default: return 'grid-cols-4 grid-rows-4';
        }
    }, [count]);

    // Generate array of slots to render
    const slots = useMemo(() => {
        return Array.from({ length: count }, (_, i) => i);
    }, [count]);

    return (
        <div
            className={`grid ${gridClass} gap-[12px] w-full h-full overflow-auto`}
            style={{ backgroundColor: 'var(--bg-page, #0a0a0a)' }}
        >
            {slots.map((index) => {
                const entry = visibleSymbols[index];

                // If we have data for this slot, render the chart
                if (entry) {
                    return (
                        <ChartCell
                            key={`${entry.info.symbol}-${index}`}
                            entry={entry}
                        />
                    );
                }

                // Otherwise render a skeleton/placeholder
                return (
                    <ChartSkeleton
                        key={`skeleton-${index}`}
                        index={index}
                    />
                );
            })}
        </div>
    );
};
