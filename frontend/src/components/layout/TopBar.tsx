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

                {/* Status Indicators */}
                <div className="flex items-center gap-3 ml-2">
                    {/* REST Status */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-gray-500">REST</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${apiStatus === 'ok' ? 'bg-[#0ECB81]' :
                            apiStatus === 'loading' ? 'bg-yellow-500' : 'bg-red-500'
                            }`} />
                    </div>

                    {/* WS Status */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-gray-500">WS</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-[#0ECB81]' : 'bg-red-500'
                            }`} />
                    </div>
                </div>
            </div>
        </header>
    );
};
