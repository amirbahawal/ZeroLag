import React, { useEffect, useState, useCallback } from 'react';

interface Point {
    x: number;
    y: number;
}

export const RulerOverlay: React.FC = () => {
    const [isActive, setIsActive] = useState(false);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const [currentPoint, setCurrentPoint] = useState<Point | null>(null);

    // Handle Shift key toggle
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift') setIsActive(true);
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                setIsActive(false);
                setStartPoint(null);
                setCurrentPoint(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Mouse handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!isActive) return;
        setStartPoint({ x: e.clientX, y: e.clientY });
        setCurrentPoint({ x: e.clientX, y: e.clientY });
    }, [isActive]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isActive || !startPoint) return;
        setCurrentPoint({ x: e.clientX, y: e.clientY });
    }, [isActive, startPoint]);

    const handleMouseUp = useCallback(() => {
        if (!isActive) return;
        setStartPoint(null);
        setCurrentPoint(null);
    }, [isActive]);

    if (!isActive) return null;

    return (
        <div
            className="fixed inset-0 z-50 cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* Ruler Line and Info Box */}
            {startPoint && currentPoint && (
                <>
                    <svg className="absolute inset-0 pointer-events-none">
                        <line
                            x1={startPoint.x}
                            y1={startPoint.y}
                            x2={currentPoint.x}
                            y2={currentPoint.y}
                            stroke="#3b82f6"
                            strokeWidth="2"
                            strokeDasharray="4"
                        />
                    </svg>

                    <div
                        className="absolute bg-blue-900/90 text-white text-xs p-2 rounded border border-blue-500 pointer-events-none whitespace-nowrap"
                        style={{
                            left: Math.min(startPoint.x, currentPoint.x) + Math.abs(currentPoint.x - startPoint.x) / 2,
                            top: Math.min(startPoint.y, currentPoint.y) - 40,
                            transform: 'translateX(-50%)'
                        }}
                    >
                        <div className="font-bold">Measurement</div>
                        <div>ΔX: {Math.abs(currentPoint.x - startPoint.x)}px</div>
                        <div>ΔY: {Math.abs(currentPoint.y - startPoint.y)}px</div>
                    </div>
                </>
            )}
        </div>
    );
};
