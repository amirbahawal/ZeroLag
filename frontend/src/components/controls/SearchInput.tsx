import React, { useEffect, useRef } from 'react';
import { useZeroLagStore } from '../../state/useZeroLagStore';

export const SearchInput: React.FC = () => {
    const searchQuery = useZeroLagStore((state) => state.searchQuery);
    const setSearchQuery = useZeroLagStore((state) => state.setSearchQuery);
    const inputRef = useRef<HTMLInputElement>(null);

    // Keyboard shortcut to focus search (/)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '/' && document.activeElement !== inputRef.current) {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === 'Escape' && document.activeElement === inputRef.current) {
                setSearchQuery('');
                inputRef.current?.blur();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setSearchQuery]);

    return (
        <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <svg
                    className={`h-4 w-4 transition-colors ${searchQuery ? 'text-cyan-400' : 'text-gray-500 group-hover:text-gray-400'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>
            <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="block w-28 sm:w-40 focus:w-48 pl-9 pr-8 py-1.5 text-sm bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
            />
            {searchQuery && (
                <button
                    onClick={() => {
                        setSearchQuery('');
                        inputRef.current?.focus();
                    }}
                    className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-500 hover:text-white"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
            {!searchQuery && (
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                    <span className="text-[10px] text-gray-600 border border-gray-700 rounded px-1.5 py-0.5">/</span>
                </div>
            )}
        </div>
    );
};
