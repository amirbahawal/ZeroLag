import React, { useMemo } from 'react';
import { useZeroLagStore, useVisibleSymbols } from '../../state/useZeroLagStore';
import { ChartCell } from './ChartCell';
import { ChartSkeleton } from './ChartSkeleton';

export const ChartGrid: React.FC = () => {
    const count = useZeroLagStore(state => state.count);
    const visibleSymbols = useVisibleSymbols();

    // Calculate grid columns based on count
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
        <div className={`grid ${gridClass} w-full h-full bg-gray-900`}>
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
