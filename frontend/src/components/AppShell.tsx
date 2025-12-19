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

    return (
        <div
            className="flex flex-col h-screen overflow-hidden p-6 text-[14px] bg-[color:var(--bg-page)]"
            style={{
                fontFamily: 'Inter, "DM Sans", system-ui, -apple-system, sans-serif'
            }}
        >
            {/* Status Banner */}
            {apiStatus === 'rate_limited' && (
                <div className="absolute top-6 right-6 z-50 bg-[color:var(--accent-red)] text-white text-xs py-2 px-4 font-bold rounded shadow-lg">
                    Binance API is rate-limiting your IP. Data may update slowly.
                </div>
            )}

            {/* Top Navigation Bar - Fixed height ~52px */}
            <TopBar />

            {/* Main Content Area - flex-1 */}
            <main className="flex-1 relative mt-6 min-h-0">
                <ChartGrid />
            </main>
        </div>
    );
};
