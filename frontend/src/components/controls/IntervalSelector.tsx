/**
 * IntervalSelector Component
 * 
 * Compact pill button group for selecting candlestick intervals.
 * Displays all 6 intervals with active state highlighting.
 * Slightly smaller than SortSelector for a more compact appearance.
 */

import React from 'react';
import { useZeroLagStore } from '../../state/useZeroLagStore';
import type { Interval } from '../../core/types';

/** All available intervals in display order */
const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export const IntervalSelector: React.FC = () => {
    const interval = useZeroLagStore((state) => state.interval);
    const setInterval = useZeroLagStore((state) => state.setInterval);

    return (
        <div className="flex items-center gap-1.5">
            {INTERVALS.map((int) => {
                const isActive = interval === int;

                return (
                    <button
                        key={int}
                        onClick={() => setInterval(int)}
                        className="px-2.5 py-1 rounded-full text-xs transition-all"
                        style={{
                            backgroundColor: isActive ? 'var(--accent-blue, #3b82f6)' : 'transparent',
                            color: isActive ? '#ffffff' : 'var(--text-muted, #9ca3af)',
                            fontWeight: isActive ? 600 : 500,
                            border: isActive ? 'none' : '1px solid var(--border-subtle, #374151)',
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.boxShadow = '0 0 8px rgba(59, 130, 246, 0.3)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.boxShadow = 'none';
                            }
                        }}
                    >
                        {int}
                    </button>
                );
            })}
        </div>
    );
};
