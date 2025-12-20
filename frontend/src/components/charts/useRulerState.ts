import { useState, useEffect, useCallback } from 'react';
import type uPlot from 'uplot';
import type { Candle } from '../../core/types';
import { useZeroLagStore } from '../../state/useZeroLagStore';

export interface RulerState {
    isActive: boolean;
    anchorIndex: number | null;
    anchorPrice: number | null;
    currentIndex: number | null;
    currentPrice: number | null;
    isFixed: boolean;
}

export const useRulerState = (uPlotInstance: uPlot | null, _candles: Candle[]) => {
    const [rulerState, setRulerState] = useState<RulerState>({
        isActive: false,
        anchorIndex: null,
        anchorPrice: null,
        currentIndex: null,
        currentPrice: null,
        isFixed: false
    });

    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const setIsGlobalRulerActive = useZeroLagStore(state => state.setIsRulerActive);

    const clearRuler = useCallback(() => {
        setRulerState({
            isActive: false,
            anchorIndex: null,
            anchorPrice: null,
            currentIndex: null,
            currentPrice: null,
            isFixed: false
        });
        setIsGlobalRulerActive(false);
    }, [setIsGlobalRulerActive]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift') setIsShiftPressed(true);
            if (e.key === 'Escape') clearRuler();
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                setIsShiftPressed(false);
                setRulerState(prev => {
                    if (!prev.isFixed) {
                        setIsGlobalRulerActive(false);
                        return { ...prev, isActive: false };
                    }
                    return prev;
                });
            }
        };

        const handleBlur = () => setIsShiftPressed(false);

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, [clearRuler, setIsGlobalRulerActive]);

    const handleChartClick = useCallback((e: MouseEvent) => {
        if (!uPlotInstance) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const idx = uPlotInstance.posToIdx(x);
        const price = uPlotInstance.posToVal(y, 'y');

        if (idx == null || price == null) return;

        setRulerState(prev => {
            if (!prev.isActive) {
                setIsGlobalRulerActive(true);
                return {
                    isActive: true,
                    anchorIndex: idx,
                    anchorPrice: price,
                    currentIndex: idx,
                    currentPrice: price,
                    isFixed: false
                };
            } else if (!prev.isFixed) {
                return { ...prev, isFixed: true, currentIndex: idx, currentPrice: price };
            } else {
                return {
                    isActive: true,
                    anchorIndex: idx,
                    anchorPrice: price,
                    currentIndex: idx,
                    currentPrice: price,
                    isFixed: false
                };
            }
        });
    }, [uPlotInstance, setIsGlobalRulerActive]);

    const handleChartMouseMove = useCallback((e: MouseEvent) => {
        if (!rulerState.isActive || rulerState.isFixed || !uPlotInstance) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const idx = uPlotInstance.posToIdx(x);
        const price = uPlotInstance.posToVal(y, 'y');

        if (idx != null && price != null) {
            setRulerState(prev => ({
                ...prev,
                currentIndex: idx,
                currentPrice: price
            }));
        }
    }, [rulerState.isActive, rulerState.isFixed, uPlotInstance]);

    useEffect(() => {
        if (!uPlotInstance) return;
        const over = uPlotInstance.over;

        const onMouseDown = (e: MouseEvent) => {
            if (e.shiftKey || isShiftPressed) {
                e.preventDefault();
                e.stopPropagation();
                handleChartClick(e);
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (rulerState.isActive && !rulerState.isFixed) {
                handleChartMouseMove(e);
            }
        };

        over.addEventListener('mousedown', onMouseDown, true);
        over.addEventListener('mousemove', onMouseMove);

        return () => {
            over.removeEventListener('mousedown', onMouseDown, true);
            over.removeEventListener('mousemove', onMouseMove);
        };
    }, [uPlotInstance, isShiftPressed, rulerState.isActive, rulerState.isFixed, handleChartClick, handleChartMouseMove]);

    return {
        rulerState,
        isShiftPressed,
        clearRuler
    };
};
