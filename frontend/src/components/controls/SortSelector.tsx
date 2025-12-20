import React from 'react';
import { useZeroLagStore } from '../../state/useZeroLagStore';
import type { SortMode } from '../../core/types';

const SORT_MODE_LABELS: Record<SortMode, string> = {
    range_5m: '5m Range',
    range_15m: '15m Range',
    range_1h: '1h Range',
    range_4h: '4h Range',
    volume_15m: '15m Vol',
    volume_24h: '24h Vol',
    dext: 'dExt',
    gvolume: 'gVolume',
};

const SORT_MODES: SortMode[] = [
    'range_5m', 'range_15m', 'range_1h', 'range_4h', 'dext', 'volume_15m', 'volume_24h', 'gvolume',
];

export const SortSelector: React.FC = () => {
    const sortMode = useZeroLagStore((state) => state.sortMode);
    const setSortMode = useZeroLagStore((state) => state.setSortMode);

    return (
        <div className="flex items-center gap-2">
            {SORT_MODES.map((mode) => {
                const isActive = sortMode === mode;
                return (
                    <button
                        key={mode}
                        onClick={() => setSortMode(mode)}
                        className="px-3 py-1.5 rounded-full text-xs transition-all"
                        style={{
                            backgroundColor: isActive ? 'var(--accent-blue, #3b82f6)' : 'transparent',
                            color: isActive ? '#ffffff' : 'var(--text-muted, #9ca3af)',
                            fontWeight: isActive ? 600 : 500,
                            border: isActive ? 'none' : '1px solid var(--border-subtle, #374151)',
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) e.currentTarget.style.boxShadow = '0 0 8px rgba(59, 130, 246, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) e.currentTarget.style.boxShadow = 'none';
                        }}
                    >
                        {SORT_MODE_LABELS[mode]}
                    </button>
                );
            })}
        </div>
    );
};
