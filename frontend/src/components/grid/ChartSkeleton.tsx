import React from 'react';

interface ChartSkeletonProps {
    index?: number;
}

export const ChartSkeleton: React.FC<ChartSkeletonProps> = ({ index }) => {
    return (
        <div className="w-full h-full border border-gray-800 bg-gray-900 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-800/20 to-transparent animate-pulse" />

            <div className="z-10 flex flex-col items-center gap-2 opacity-30">
                <div className="w-16 h-4 bg-gray-700 rounded" />
                <div className="w-24 h-8 bg-gray-700 rounded" />
            </div>

            {index !== undefined && (
                <span className="absolute bottom-2 right-2 text-gray-800 text-xs font-mono">
                    #{index + 1}
                </span>
            )}
        </div>
    );
};
