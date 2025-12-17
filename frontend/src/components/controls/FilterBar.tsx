/**
 * FilterBar Component
 * 
 * Compact filter buttons for the top-right corner.
 */

import React from 'react';
import { useSortMode, useZeroLagStore } from '../../state/useZeroLagStore';
import { refreshRankings } from '../../core/ranking';
import type { SortMode } from '../../core/types';

const FILTERS: { mode: SortMode; label: string; group: 'volume' | 'range' | 'special' }[] = [
    // Volume filters
    { mode: 'volume_24h', label: 'Vol 24h', group: 'volume' },
    { mode: 'volume_15m', label: 'Vol 15m', group: 'volume' },
    { mode: 'gvolume', label: 'Growth', group: 'volume' },
    // Range/Volatility filters
    { mode: 'range_4h', label: 'Range 4h', group: 'range' },
    { mode: 'range_1h', label: 'Range 1h', group: 'range' },
    { mode: 'range_15m', label: 'Range 15m', group: 'range' },
    { mode: 'range_5m', label: 'Range 5m', group: 'range' },
    // Special filters  
    { mode: 'dext', label: 'Extremum', group: 'special' },
];

export const FilterBar: React.FC = () => {
    const sortMode = useSortMode();
    const setSortMode = useZeroLagStore((state) => state.setSortMode);

    const handleFilterClick = (mode: SortMode) => {
        setSortMode(mode);
        refreshRankings();
    };

    return (
        <div className="flex gap-1">
            {FILTERS.map((filter) => {
                const isActive = sortMode === filter.mode;
                return (
                    <button
                        key={filter.mode}
                        onClick={() => handleFilterClick(filter.mode)}
                        aria-label={`Sort by ${filter.label}`}
                        aria-pressed={isActive}
                        className="px-3 py-1 rounded text-xs font-bold transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                        style={{
                            backgroundColor: isActive ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                            color: isActive ? '#00f0ff' : 'rgba(255,255,255,0.6)',
                            border: isActive ? '1px solid #00f0ff' : '1px solid rgba(255,255,255,0.2)',
                            boxShadow: isActive ? '0 0 10px rgba(0,240,255,0.3)' : 'none',
                        }}
                    >
                        {filter.label}
                    </button>
                );
            })}
        </div>
    );
};
