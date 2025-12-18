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
    const { wsConnected } = useZeroLagStore();

    return (
        <header
            className="h-[52px] flex items-center px-4 shrink-0 select-none"
            style={{
                backgroundColor: 'var(--bg-panel-soft, #1a1d21)',
                borderBottom: '1px solid var(--border-subtle, #2a2d31)'
            }}
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
            <div className="flex-1 flex items-center justify-end gap-4">
                <CountSelector />

                {/* Live Status Badge */}
                <div className="px-2 py-1 bg-green-900/30 border border-green-900 rounded flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-[#0ECB81] animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: wsConnected ? '#0ECB81' : '#ff4444' }}>
                        {wsConnected ? 'LIVE' : 'OFFLINE'}
                    </span>
                </div>
            </div>
        </header>
    );
};
