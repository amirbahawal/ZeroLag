import React from 'react';
import { useZeroLagStore } from '../../state/useZeroLagStore';
import { SortSelector } from '../controls/SortSelector';
import { IntervalSelector } from '../controls/IntervalSelector';
import { CountSelector } from '../controls/CountSelector';

/**
 * TopBar - Main control bar
 * 
 * Three-section layout:
 * - Left: Sort mode selector
 * - Center: Interval selector
 * - Right: Grid count selector + status indicators
 */
export const TopBar: React.FC = () => {
    const { wsConnected, apiStatus } = useZeroLagStore();

    return (
        <header
            className="h-[52px] flex items-center px-4 shrink-0 select-none rounded-lg bg-[color:var(--bg-panel-soft)] border-b border-[color:var(--border-subtle)]"
        >
            {/* LEFT SECTION: Sort Selector */}
            <div className="flex-1 flex items-center">
                <SortSelector />
            </div>

            {/* CENTER SECTION: Interval Selector */}
            <div className="flex items-center justify-center">
                <IntervalSelector />
            </div>

            {/* RIGHT SECTION: Count Selector + Status */}
            <div className="flex-1 flex items-center justify-end gap-6">
                <CountSelector />

                {/* Status Indicators */}
                <div className="flex items-center gap-4">
                    {/* REST Status */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-[color:var(--text-muted)]">REST</span>
                        <div
                            className={`w-2 h-2 rounded-full transition-colors duration-300 ${apiStatus === 'ok' ? 'bg-[color:var(--candle-up)] shadow-[0_0_8px_rgba(31,211,154,0.4)]' : 'bg-[color:var(--accent-red)]'
                                }`}
                        />
                    </div>

                    {/* WS Status */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-[color:var(--text-muted)]">WS</span>
                        <div
                            className={`w-2 h-2 rounded-full transition-colors duration-300 ${wsConnected ? 'bg-[color:var(--candle-up)] shadow-[0_0_8px_rgba(31,211,154,0.4)]' : 'bg-[color:var(--accent-red)]'
                                }`}
                        />
                    </div>
                </div>
            </div>
        </header>
    );
};
