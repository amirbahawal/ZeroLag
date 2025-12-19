/**
 * ChartSkeleton Component
 * 
 * Loading placeholder that mimics the layout of ChartCell.
 * Features animated shimmer effects and matches the exact dimensions and padding.
 */

import React from 'react';

interface ChartSkeletonProps {
    index?: number;
    noContainer?: boolean;
}

export const ChartAreaSkeleton: React.FC = () => (
    <div className="flex-1 w-full min-h-0 relative z-10 flex flex-col justify-center gap-4 animate-pulse opacity-50">
        {/* Fake horizontal grid lines/chart bars */}
        <div className="w-full h-px bg-gray-800" />
        <div className="w-3/4 h-2 bg-gray-800/30 rounded self-end" />
        <div className="w-1/2 h-2 bg-gray-800/30 rounded self-end" />
        <div className="w-full h-px bg-gray-800" />
        <div className="w-2/3 h-2 bg-gray-800/30 rounded self-end" />
        <div className="w-full h-px bg-gray-800" />
    </div>
);

export const ChartSkeleton: React.FC<ChartSkeletonProps> = ({ index, noContainer }) => {
    const content = (
        <>
            {/* Header Row Skeleton */}
            <div className="flex justify-between items-start mb-2 relative z-10 animate-pulse">
                <div className="flex flex-col gap-1.5">
                    {/* Symbol Name & Badge Placeholder */}
                    <div className="flex items-center gap-1.5">
                        <div className="w-16 h-4 bg-gray-800 rounded" />
                        <div className="w-8 h-3 bg-gray-800 rounded" />
                    </div>
                    {/* Metric Label Placeholder */}
                    <div className="w-24 h-3 bg-gray-800/50 rounded" />
                </div>

                {/* Price Badge Placeholder */}
                <div className="w-16 h-5 bg-gray-800 rounded" />
            </div>

            {/* Chart Area Skeleton */}
            <ChartAreaSkeleton />

            {/* Optional Index Indicator (useful for debugging grid positions) */}
            {index !== undefined && (
                <span className="absolute bottom-2 right-2 text-gray-800/20 text-[10px] font-mono pointer-events-none">
                    #{index + 1}
                </span>
            )}
        </>
    );

    if (noContainer) {
        return content;
    }

    return (
        <div
            className="w-full h-full flex flex-col relative overflow-hidden rounded-[10px]"
            style={{
                background: 'linear-gradient(135deg, var(--bg-panel, #1a1d21) 0%, var(--bg-panel-soft, #14161a) 100%)',
                border: '1px solid var(--border-subtle, #2a2d31)',
                padding: '12px 8px 6px 8px',
            }}
        >
            {content}
        </div>
    );
};
