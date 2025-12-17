/**
 * IntervalSelector Component
 * 
 * Pill button group for selecting candlestick intervals.
 * Displays all 6 intervals with active state highlighting.
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
        <div className="flex items-center gap-2">
            {INTERVALS.map((int) => {
                const isActive = interval === int;

                return (
                    <button
                        key={int}
                        onClick={() => setInterval(int)}
                        aria-label={`Select ${int} interval`}
                        aria-pressed={isActive}
                        className="px-4 py-2 rounded-lg font-semibold text-sm transition-smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                        style={{
                            backgroundColor: isActive
                                ? 'var(--accent-blue)'
                                : 'var(--bg-panel)',
                            color: isActive ? '#ffffff' : 'var(--text-main)',
                            border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-subtle)'
                                }`,
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = 'var(--bg-panel-soft)';
                                e.currentTarget.style.borderColor = 'var(--accent-blue)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = 'var(--bg-panel)';
                                e.currentTarget.style.borderColor = 'var(--border-subtle)';
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
