import React from 'react';
import { TopBar } from './layout/TopBar';
import { ChartGrid } from './grid/ChartGrid';
import { RulerOverlay } from './tools/RulerOverlay';
import { useZeroLagStore } from '../state/useZeroLagStore';



export const AppShell: React.FC = () => {
    const apiStatus = useZeroLagStore(state => state.apiStatus);
    const wsConnected = useZeroLagStore(state => state.wsConnected);

    // Engine is initialized in App.tsx via useClientEngine hook
    // We don't need to start/stop it here to avoid double-initialization or premature stopping

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
            {/* Status Banner */}
            {apiStatus === 'rate_limited' && (
                <div className="bg-red-600 text-white text-xs py-1 px-2 text-center font-bold">
                    API RATE LIMITED - PAUSING REQUESTS
                </div>
            )}

            {/* Top Navigation Bar */}
            <TopBar />

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden relative">
                <RulerOverlay />
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
