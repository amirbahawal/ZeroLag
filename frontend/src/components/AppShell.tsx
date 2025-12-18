import React from 'react';
import { TopBar } from './layout/TopBar';
import { ChartGrid } from './grid/ChartGrid';

import { useZeroLagStore } from '../state/useZeroLagStore';

/**
 * AppShell - Main application layout
 * 
 * Provides the overall structure with:
 * - Full viewport height
 * - CSS variable-based background
 * - 24px padding
 * - TopBar (fixed height ~52px)
 * - ChartGrid (flex-1, scrollable)
 */
export const AppShell: React.FC = () => {
    const apiStatus = useZeroLagStore(state => state.apiStatus);
    const wsConnected = useZeroLagStore(state => state.wsConnected);

    return (
        <div
            className="flex flex-col h-screen overflow-hidden p-6 text-[14px]"
            style={{
                backgroundColor: 'var(--bg-page, #0a0a0a)',
                fontFamily: 'Inter, "DM Sans", system-ui, -apple-system, sans-serif'
            }}
        >
            {/* Status Banner */}
            {apiStatus === 'rate_limited' && (
                <div className="absolute top-6 right-6 z-50 bg-red-600 text-white text-xs py-2 px-4 font-bold rounded shadow-lg">
                    Binance API is rate-limiting your IP. Data may update slowly.
                </div>
            )}

            {/* Top Navigation Bar - Fixed height ~52px */}
            <TopBar />

            {/* Main Content Area - flex-1, overflow-auto */}
            <main className="flex-1 overflow-auto relative mt-6">
                <ChartGrid />

                {/* Connection Status Indicator (Bottom Right) */}
                <div className="absolute bottom-2 right-2 flex items-center gap-2 pointer-events-none opacity-50">
                    <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-[10px] font-mono">
                        {wsConnected ? 'WS: CONNECTED' : 'WS: DISCONNECTED'}
                    </span>
                </div>
            </main>
        </div>
    );
};
