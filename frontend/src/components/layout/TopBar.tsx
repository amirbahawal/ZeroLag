import React from 'react';
import { useZeroLagStore } from '../../state/useZeroLagStore';
import { SortSelector } from '../controls/SortSelector';
import { IntervalSelector } from '../controls/IntervalSelector';
import { CountSelector } from '../controls/CountSelector';

export const TopBar: React.FC = () => {
    const { wsConnected, apiStatus } = useZeroLagStore();

    return (
        <header
            className="h-[52px] flex items-center px-4 shrink-0 select-none rounded-lg bg-[color:var(--bg-panel-soft)] border-b border-[color:var(--border-subtle)]"
        >
            <div className="flex-1 flex items-center">
                <SortSelector />
            </div>

            <div className="flex items-center justify-center">
                <IntervalSelector />
            </div>

            <div className="flex-1 flex items-center justify-end gap-6">
                {apiStatus === 'rate_limited' && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-[color:var(--accent-amber)]/10 border border-[color:var(--accent-amber)]/20 animate-pulse">
                        <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent-amber)]" />
                        <span className="text-[11px] font-medium text-[color:var(--accent-amber)]">
                            Binance API is rate-limiting your IP. Data may update slowly.
                        </span>
                    </div>
                )}

                {apiStatus === 'error' && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-[color:var(--accent-red)]/10 border border-[color:var(--accent-red)]/20 animate-pulse">
                        <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent-red)]" />
                        <span className="text-[11px] font-medium text-[color:var(--accent-red)]">
                            Binance API error. Check your connection.
                        </span>
                    </div>
                )}

                <CountSelector />

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-[color:var(--text-muted)]">REST</span>
                        <div
                            className={`w-2 h-2 rounded-full transition-colors duration-300 ${apiStatus === 'ok' ? 'bg-[color:var(--candle-up)] shadow-[0_0_8px_rgba(31,211,154,0.4)]' : 'bg-[color:var(--accent-red)]'
                                }`}
                        />
                    </div>

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
