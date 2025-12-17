/**
 * SortSelector Component
 * 
 * Dropdown for selecting the active sort mode.
 * Displays all 8 sort modes with human-readable labels.
 */

import React from 'react';
import { useZeroLagStore } from '../../state/useZeroLagStore';
import type { SortMode } from '../../core/types';

/** Human-readable labels for sort modes */
const SORT_MODE_LABELS: Record<SortMode, string> = {
    range_5m: '5m Range',
    range_15m: '15m Range',
    range_1h: '1h Range',
    range_4h: '4h Range',
    volume_15m: '15m Volume',
    volume_24h: '24h Volume',
    dext: 'Daily Extremum',
    gvolume: 'Growth Volume',
};

/** All available sort modes in display order */
const SORT_MODES: SortMode[] = [
    'volume_24h',
    'volume_15m',
    'gvolume',
    'range_4h',
    'range_1h',
    'range_15m',
    'range_5m',
    'dext',
];

export const SortSelector: React.FC = () => {
    const sortMode = useZeroLagStore((state) => state.sortMode);
    const setSortMode = useZeroLagStore((state) => state.setSortMode);

    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSortMode(event.target.value as SortMode);
    };

    return (
        <div className="relative">
            <select
                value={sortMode}
                onChange={handleChange}
                className="px-4 py-2 pr-10 rounded-lg font-medium text-sm cursor-pointer transition-smooth appearance-none"
                style={{
                    backgroundColor: 'var(--bg-panel)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-subtle)',
                    outline: 'none',
                }}
                onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                }}
                onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                }}
            >
                {SORT_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                        {SORT_MODE_LABELS[mode]}
                    </option>
                ))}
            </select>

            {/* Custom dropdown arrow */}
            <div
                className="absolute right-3 top-1/2 pointer-events-none"
                style={{
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                }}
            >
                <svg
                    width="12"
                    height="8"
                    viewBox="0 0 12 8"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M1 1.5L6 6.5L11 1.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
        </div>
    );
};
