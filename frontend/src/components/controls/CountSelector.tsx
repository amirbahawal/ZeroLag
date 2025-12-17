/**
 * CountSelector Component
 * 
 * Grid size selector for controlling how many chart cells to display.
 * Options: 4 (2x2), 9 (3x3), 16 (4x4), 25 (5x5)
 */

import React from 'react';
import { useZeroLagStore } from '../../state/useZeroLagStore';

/** Available grid counts */
const GRID_COUNTS = [4, 9, 16, 25] as const;

/** Grid size labels */
const GRID_LABELS: Record<number, string> = {
    4: '2×2',
    9: '3×3',
    16: '4×4',
    25: '5×5',
};

export const CountSelector: React.FC = () => {
    const count = useZeroLagStore((state) => state.count);
    const setCount = useZeroLagStore((state) => state.setCount);

    return (
        <div className="flex items-center gap-1.5">
            {GRID_COUNTS.map((gridCount) => {
                const isActive = count === gridCount;

                return (
                    <button
                        key={gridCount}
                        onClick={() => setCount(gridCount)}
                        aria-label={`Show ${gridCount} charts (${GRID_LABELS[gridCount]} grid)`}
                        aria-pressed={isActive}
                        className="px-3 py-1.5 rounded-md font-semibold text-xs transition-smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                        style={{
                            backgroundColor: isActive
                                ? 'var(--accent-cyan)'
                                : 'var(--bg-panel)',
                            color: isActive ? '#000000' : 'var(--text-muted)',
                            border: `1px solid ${isActive ? 'var(--accent-cyan)' : 'var(--border-subtle)'
                                }`,
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = 'var(--bg-panel-soft)';
                                e.currentTarget.style.color = 'var(--text-main)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = 'var(--bg-panel)';
                                e.currentTarget.style.color = 'var(--text-muted)';
                            }
                        }}
                        title={`${GRID_LABELS[gridCount]} grid`}
                    >
                        {GRID_LABELS[gridCount]}
                    </button>
                );
            })}
        </div>
    );
};
