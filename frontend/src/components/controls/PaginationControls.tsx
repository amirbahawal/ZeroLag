import React from 'react';
import { useZeroLagStore, usePage, useTotalPages } from '../../state/useZeroLagStore';

export const PaginationControls: React.FC = () => {
    const page = usePage();
    const totalPages = useTotalPages();
    const setPage = useZeroLagStore((state) => state.setPage);

    if (totalPages <= 1) return null;

    return (
        <div className="flex items-center gap-1 bg-white/5 px-1 py-0.5 rounded-lg border border-white/5">
            <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                aria-label="Previous page"
            >
                <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
            </button>

            <span className="text-[10px] font-mono text-gray-400 px-1 min-w-[3rem] text-center select-none">
                <span className="text-white font-bold">{page}</span> / {totalPages}
            </span>

            <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                aria-label="Next page"
            >
                <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </button>
        </div>
    );
};
