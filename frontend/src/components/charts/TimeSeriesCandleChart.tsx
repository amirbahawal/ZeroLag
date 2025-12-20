import { useEffect, useRef, useState, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Interval, Candle } from '../../core/types';
import { useZeroLagStore } from '../../state/useZeroLagStore';
import { useRulerState } from './useRulerState';
import { RulerOverlay } from './RulerOverlay';

interface TimeSeriesCandleChartProps {
    symbol: string;
    interval: Interval;
    candles: Candle[];
}

const intervalToSeconds = (interval: Interval): number => {
    const unit = interval.slice(-1);
    const value = parseInt(interval.slice(0, -1));
    switch (unit) {
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        default: return 60;
    }
};

export const TimeSeriesCandleChart: React.FC<TimeSeriesCandleChartProps> = ({ symbol, interval, candles = [] }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const uPlotRef = useRef<uPlot | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const gridCount = useZeroLagStore(state => state.count);
    const isGlobalRulerActive = useZeroLagStore(state => state.isRulerActive);

    const safeCandles = candles || [];
    const { rulerState, isShiftPressed } = useRulerState(uPlotRef.current, safeCandles);

    useEffect(() => {
        if (!chartRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setDimensions(prev => (prev.width === width && prev.height === height) ? prev : { width, height });
                }
            }
        });
        observer.observe(chartRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!chartRef.current || dimensions.width === 0 || dimensions.height === 0 || safeCandles.length < 5) return;

        let numVisible = 60;
        let bodyWidthPx = 7;
        let wickWidthPx = 2;
        let yPaddingPercent = 12;
        let gapRatio = 0.3;

        if (gridCount >= 25) { numVisible = 30; bodyWidthPx = 4; wickWidthPx = 1; yPaddingPercent = 15; gapRatio = 0.35; }
        else if (gridCount >= 16) { numVisible = 40; bodyWidthPx = 5; wickWidthPx = 1.5; yPaddingPercent = 14; gapRatio = 0.32; }
        else if (gridCount >= 9) { numVisible = 50; bodyWidthPx = 6; wickWidthPx = 2; yPaddingPercent = 12; gapRatio = 0.3; }

        const visibleCandlesData = safeCandles.slice(-numVisible);
        const data: [number[], number[], number[], number[], number[], number[]] = [[], [], [], [], [], []];
        visibleCandlesData.forEach(c => {
            data[0].push(c.openTime / 1000);
            data[1].push(c.open);
            data[2].push(c.high);
            data[3].push(c.low);
            data[4].push(c.close);
            data[5].push(c.volumeBase);
        });

        // @ts-ignore
        if (uPlotRef.current && uPlotRef.current._interval === interval && uPlotRef.current._gridCount === gridCount && uPlotRef.current._symbol === symbol) {
            if (isGlobalRulerActive || rulerState.isActive) return;
            uPlotRef.current.setData(data);
            uPlotRef.current.setSize(dimensions);
            return;
        }

        if ((isGlobalRulerActive || rulerState.isActive) && uPlotRef.current) return;

        if (uPlotRef.current) {
            uPlotRef.current.destroy();
            uPlotRef.current = null;
        }

        const bullColor = '#1fd39a';
        const bearColor = '#f45b6c';

        const drawCandles = (u: uPlot) => {
            const { ctx } = u;
            const { width } = u.bbox;
            if (!u.series[0].idxs) return;
            const [idx0, idx1] = u.series[0].idxs;
            const visibleCount = (idx1 - idx0) + 3;
            if (visibleCount === 0) return;
            const totalSpacePerCandle = width / visibleCount;
            const candleBodyWidth = Math.max(bodyWidthPx, Math.floor(totalSpacePerCandle * (1 - gapRatio)));

            ctx.save();
            for (let i = idx0; i <= idx1; i++) {
                const t = u.data[0][i];
                const open = u.data[1][i];
                const high = u.data[2][i];
                const low = u.data[3][i];
                const close = u.data[4][i];
                if (t == null || open == null || high == null || low == null || close == null) continue;
                const color = (close as number) >= (open as number) ? bullColor : bearColor;
                const xCenter = Math.round(u.valToPos(t, 'x', true));
                const yHigh = Math.round(u.valToPos(high, 'y', true));
                const yLow = Math.round(u.valToPos(low, 'y', true));
                const yOpen = Math.round(u.valToPos(open, 'y', true));
                const yClose = Math.round(u.valToPos(close, 'y', true));
                const bodyTop = Math.min(yOpen, yClose);
                const bodyBottom = Math.max(yOpen, yClose);
                const bodyHeight = Math.max(2, bodyBottom - bodyTop);
                ctx.strokeStyle = color;
                ctx.lineWidth = wickWidthPx;
                if (yHigh < bodyTop) { ctx.beginPath(); ctx.moveTo(xCenter, yHigh); ctx.lineTo(xCenter, bodyTop); ctx.stroke(); }
                if (yLow > bodyBottom) { ctx.beginPath(); ctx.moveTo(xCenter, bodyBottom); ctx.lineTo(xCenter, yLow); ctx.stroke(); }
                ctx.fillStyle = color;
                const halfWidth = Math.floor(candleBodyWidth / 2);
                ctx.fillRect(xCenter - halfWidth, bodyTop, candleBodyWidth, bodyHeight);
            }
            ctx.restore();
        };

        const drawVolume = (u: uPlot) => {
            const { ctx } = u;
            const { width } = u.bbox;
            if (!u.series[0].idxs) return;
            const [idx0, idx1] = u.series[0].idxs;
            const visibleCount = (idx1 - idx0) + 3;
            const totalSpacePerCandle = width / visibleCount;
            const barWidth = Math.max(bodyWidthPx, Math.floor(totalSpacePerCandle * (1 - gapRatio)));
            ctx.save();
            for (let i = idx0; i <= idx1; i++) {
                const t = u.data[0][i];
                const v = u.data[5][i];
                const o = u.data[1][i];
                const c = u.data[4][i];
                if (t == null || v == null || o == null || c == null) continue;
                const color = (c as number) >= (o as number) ? bullColor : bearColor;
                const xCenter = Math.round(u.valToPos(t, 'x', true));
                const volumeY = Math.round(u.valToPos(v, 'vol', true));
                const barHeight = (u.bbox.height + u.bbox.top) - volumeY;
                ctx.fillStyle = color + '40';
                ctx.fillRect(xCenter - Math.floor(barWidth / 2), volumeY, barWidth, barHeight);
            }
            ctx.restore();
        };

        const opts: uPlot.Options = {
            width: dimensions.width, height: dimensions.height, title: '',
            tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), 'Etc/UTC'),
            padding: [4, 0, 4, 0],
            series: [
                { label: 'Time' },
                { label: 'Open', show: true, paths: () => null, points: { show: false } },
                { label: 'High', show: true, paths: () => null, points: { show: false } },
                { label: 'Low', show: true, paths: () => null, points: { show: false } },
                { label: 'Close', show: true, paths: () => null, points: { show: false } },
                { label: 'Volume', scale: 'vol', show: true, paths: () => null, points: { show: false } }
            ],
            axes: [
                { show: false, grid: { show: false } },
                { show: false, scale: 'y', grid: { show: true, stroke: '#191d28', width: 1, dash: [] } }
            ],
            scales: {
                x: {
                    time: true,
                    range: (_u, min, max) => [min, max + (intervalToSeconds(interval) * 3)]
                },
                y: {
                    auto: true,
                    range: (_u, min, max) => {
                        const range = max - min;
                        const padding = range * (yPaddingPercent / 100);
                        return [min - padding, max + padding];
                    }
                },
                vol: { auto: true, range: (_u, _min, max) => [0, max * 5] }
            },
            hooks: { draw: [drawCandles, drawVolume] },
            cursor: { show: true, drag: { x: true, y: true }, points: { show: false }, lock: true, focus: { prox: 16 } },
            legend: { show: false }
        };

        uPlotRef.current = new uPlot(opts, data, chartRef.current!);
        // @ts-ignore
        uPlotRef.current._interval = interval;
        // @ts-ignore
        uPlotRef.current._gridCount = gridCount;
        // @ts-ignore
        uPlotRef.current._symbol = symbol;

    }, [symbol, interval, dimensions, safeCandles, gridCount, isGlobalRulerActive, rulerState.isActive]);

    useEffect(() => () => {
        if (uPlotRef.current) {
            uPlotRef.current.destroy();
            uPlotRef.current = null;
        }
    }, []);

    const cursorStyle = useMemo(() => (isShiftPressed || rulerState.isActive) ? 'crosshair' : 'default', [isShiftPressed, rulerState.isActive]);

    return (
        <div
            ref={chartRef}
            className={`w-full h-full relative overflow-hidden ${isShiftPressed ? 'ruler-active' : ''}`}
            style={{ cursor: cursorStyle }}
        >
            {rulerState.isActive && (
                <RulerOverlay
                    uPlotInstance={uPlotRef.current}
                    anchorIndex={rulerState.anchorIndex}
                    anchorPrice={rulerState.anchorPrice}
                    currentIndex={rulerState.currentIndex}
                    currentPrice={rulerState.currentPrice}
                />
            )}

            <style>{`
                .ruler-active .u-cursor-x, .ruler-active .u-cursor-y {
                    display: none !important;
                }
            `}</style>
        </div>
    );
};
