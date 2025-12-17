import React from 'react';
import { useZeroLagStore } from '../../state/useZeroLagStore';
import type { Interval } from '../../core/types';
import { FilterBar } from '../controls/FilterBar';

export const TopBar: React.FC = () => {
    const {
        interval, setInterval,
        count, setCount
    } = useZeroLagStore();



    const intervalOptions: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
    const countOptions: number[] = [4, 9, 16, 25];

    return (
        <header className="h-14 bg-[#0b0e11] border-b border-gray-800 flex items-center px-6 justify-between shrink-0 select-none">
            {/* LEFT SIDE: Logo + Time + Grid */}
            <div className="flex items-center gap-8">
                {/* Logo */}
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center font-black text-sm shadow-lg shadow-blue-900/20">Z</div>
                    <span className="font-bold text-xl tracking-tight text-gray-100">ZeroLag</span>
                </div>

                <div className="h-6 w-px bg-gray-800" />

                {/* Interval Selector */}
                <div className="flex items-center gap-3">
                    <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
                        {intervalOptions.map(opt => (
                            <button
                                key={opt}
                                onClick={() => setInterval(opt)}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${interval === opt
                                    ? 'bg-gray-700 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                                    }`}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid Count Selector */}
                <div className="flex items-center gap-3">
                    <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
                        {countOptions.map(opt => (
                            <button
                                key={opt}
                                onClick={() => setCount(opt as any)}
                                className={`w-8 h-6 flex items-center justify-center text-xs font-bold rounded-md transition-all ${count === opt
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                                    }`}
                            >
                                {opt === 4 ? '2x2' : opt === 9 ? '3x3' : opt === 16 ? '4x4' : '5x5'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE: Sort Filters */}
            <div className="flex items-center gap-2">
                <FilterBar />

                {/* Live Status Badge */}
                <div className="ml-4 px-2 py-1 bg-green-900/30 border border-green-900 rounded flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#0ECB81] animate-pulse" />
                    <span className="text-[10px] font-bold text-[#0ECB81] tracking-wider">LIVE</span>
                </div>
            </div>
        </header>
    );
};
