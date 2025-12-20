import React from 'react';
import { useZeroLagStore } from '../../state/useZeroLagStore';

const GRID_COUNTS = [4, 9, 16, 25] as const;
const GRID_LABELS: Record<number, string> = { 4: '2×2', 9: '3×3', 16: '4×4', 25: '5×5' };

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
                        className="w-8 h-8 flex items-center justify-center text-xs font-semibold transition-all rounded"
                        style={{
                            backgroundColor: isActive ? 'var(--bg-panel-soft, #1a1d21)' : 'transparent',
                            color: isActive ? '#ffffff' : 'var(--text-muted, #9ca3af)',
                            border: isActive
                                ? '2px solid var(--accent-blue, #3b82f6)'
                                : '1px solid var(--border-subtle, #374151)',
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.borderColor = 'var(--accent-blue, #3b82f6)';
                                e.currentTarget.style.color = '#ffffff';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) {
                                e.currentTarget.style.borderColor = 'var(--border-subtle, #374151)';
                                e.currentTarget.style.color = 'var(--text-muted, #9ca3af)';
                            }
                        }}
                    >
                        {GRID_LABELS[gridCount]}
                    </button>
                );
            })}
        </div>
    );
};
