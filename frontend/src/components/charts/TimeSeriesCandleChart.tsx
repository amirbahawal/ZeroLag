import React, { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Interval, Candle } from '../../core/types';
import { useZeroLagStore } from '../../state/useZeroLagStore';

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

    // Ruler State
    const rulerState = useRef<{
        active: boolean;
        fixed: boolean;
        startIdx: number | null;
        startVal: number | null;
        endIdx: number | null;
        endVal: number | null;
    }>({
        active: false,
        fixed: false,
        startIdx: null,
        startVal: null,
        endIdx: null,
        endVal: null
    });

    const safeCandles = candles || [];

    // Resize observer
    useEffect(() => {
        if (!chartRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setDimensions(prev => {
                        if (prev.width === width && prev.height === height) return prev;
                        return { width, height };
                    });
                }
            }
        });
        observer.observe(chartRef.current);
        return () => observer.disconnect();
    }, []);

    // Chart Initialization
    useEffect(() => {
        if (!chartRef.current || dimensions.width === 0 || dimensions.height === 0 || safeCandles.length < 5) return;

        // RESPONSIVE STYLING BASED ON GRID SIZE
        // As grid size increases, we show fewer candles to keep them thick and visible
        let numVisible = 60;
        let bodyWidthPx = 7;
        let wickWidthPx = 2;
        let yPaddingPercent = 12;
        let gapRatio = 0.3;

        if (gridCount >= 25) { // 5x5
            numVisible = 30;
            bodyWidthPx = 4;
            wickWidthPx = 1;
            yPaddingPercent = 15;
            gapRatio = 0.35;
        } else if (gridCount >= 16) { // 4x4
            numVisible = 40;
            bodyWidthPx = 5;
            wickWidthPx = 1.5;
            yPaddingPercent = 14;
            gapRatio = 0.32;
        } else if (gridCount >= 9) { // 3x3
            numVisible = 50;
            bodyWidthPx = 6;
            wickWidthPx = 2;
            yPaddingPercent = 12;
            gapRatio = 0.3;
        }

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
        if (uPlotRef.current && uPlotRef.current._interval === interval && uPlotRef.current._gridCount === gridCount) {
            uPlotRef.current.setData(data);
            uPlotRef.current.setSize(dimensions);
            return;
        }

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

            const visibleCount = (idx1 - idx0) + 3; // +3 for the gap
            if (visibleCount === 0) return;

            // Calculate candle width
            const totalSpacePerCandle = width / visibleCount;
            const candleBodyWidth = Math.max(
                bodyWidthPx,
                Math.floor(totalSpacePerCandle * (1 - gapRatio))
            );

            ctx.save();

            for (let i = idx0; i <= idx1; i++) {
                const t = u.data[0][i];
                const open = u.data[1][i];
                const high = u.data[2][i];
                const low = u.data[3][i];
                const close = u.data[4][i];

                if (t == null || open == null || high == null || low == null || close == null) continue;

                const isBullish = (close as number) >= (open as number);
                const color = isBullish ? bullColor : bearColor;

                const xCenter = Math.round(u.valToPos(t, 'x', true));
                const yHigh = Math.round(u.valToPos(high, 'y', true));
                const yLow = Math.round(u.valToPos(low, 'y', true));
                const yOpen = Math.round(u.valToPos(open, 'y', true));
                const yClose = Math.round(u.valToPos(close, 'y', true));

                // Body dimensions
                const bodyTop = Math.min(yOpen, yClose);
                const bodyBottom = Math.max(yOpen, yClose);
                const bodyHeight = Math.max(2, bodyBottom - bodyTop);

                // Draw wicks
                ctx.strokeStyle = color;
                ctx.lineWidth = wickWidthPx;

                // Upper wick
                if (yHigh < bodyTop) {
                    ctx.beginPath();
                    ctx.moveTo(xCenter, yHigh);
                    ctx.lineTo(xCenter, bodyTop);
                    ctx.stroke();
                }

                // Lower wick
                if (yLow > bodyBottom) {
                    ctx.beginPath();
                    ctx.moveTo(xCenter, bodyBottom);
                    ctx.lineTo(xCenter, yLow);
                    ctx.stroke();
                }

                // Draw body
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
            const barWidth = Math.max(
                bodyWidthPx,
                Math.floor(totalSpacePerCandle * (1 - gapRatio))
            );

            ctx.save();
            for (let i = idx0; i <= idx1; i++) {
                const t = u.data[0][i];
                const v = u.data[5][i];
                const o = u.data[1][i];
                const c = u.data[4][i];
                if (t == null || v == null || o == null || c == null) continue;

                const isBullish = (c as number) >= (o as number);
                const color = isBullish ? bullColor : bearColor;

                const xCenter = Math.round(u.valToPos(t, 'x', true));
                const volumeY = Math.round(u.valToPos(v, 'vol', true));
                const barHeight = (u.bbox.height + u.bbox.top) - volumeY;

                ctx.fillStyle = color + '40'; // 25% opacity
                ctx.fillRect(
                    xCenter - Math.floor(barWidth / 2),
                    volumeY,
                    barWidth,
                    barHeight
                );
            }
            ctx.restore();
        };

        const drawRuler = (u: uPlot) => {
            const s = rulerState.current;
            if (!s.active || s.startIdx === null || s.endIdx === null) return;
            const ctx = u.ctx;
            ctx.save();
            const t1 = u.data[0][s.startIdx];
            const t2 = u.data[0][s.endIdx];
            if (t1 === undefined || t2 === undefined) { ctx.restore(); return; }

            const x1 = u.valToPos(t1, 'x', true);
            const y1 = u.valToPos(s.startVal!, 'y', true);
            const x2 = u.valToPos(t2, 'x', true);
            const y2 = u.valToPos(s.endVal!, 'y', true);

            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.setLineDash([]);

            const priceDelta = s.endVal! - s.startVal!;
            const pricePct = (priceDelta / s.startVal!) * 100;
            const barsDelta = s.endIdx - s.startIdx;
            const text = `Δ ${priceDelta.toFixed(2)} (${pricePct.toFixed(2)}%)  ${barsDelta} bars`;

            ctx.font = '11px Inter, sans-serif';
            const tm = ctx.measureText(text);
            const boxW = tm.width + 16;
            const boxH = 24;
            const boxX = u.bbox.width - boxW - 8;
            const boxY = 8;

            ctx.fillStyle = 'rgba(20, 24, 30, 0.95)';
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 1;
            ctx.fillRect(boxX, boxY, boxW, boxH);
            ctx.strokeRect(boxX, boxY, boxW, boxH);
            ctx.fillStyle = '#00f0ff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, boxX + boxW / 2, boxY + boxH / 2);

            ctx.beginPath();
            ctx.arc(x1, y1, 3, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x2, y2, 3, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
        };

        const initRuler = (u: uPlot) => {
            const over = u.over;
            over.addEventListener('mousedown', (e) => {
                if (!e.shiftKey) return;
                const rect = over.getBoundingClientRect();
                const idx = u.posToIdx(e.clientX - rect.left);
                const val = u.posToVal(e.clientY - rect.top, 'y');
                if (idx === null || val === null) return;

                const s = rulerState.current;
                if (!s.active) {
                    s.active = true;
                    s.fixed = false;
                    s.startIdx = idx;
                    s.startVal = val;
                    s.endIdx = idx;
                    s.endVal = val;
                } else if (!s.fixed) {
                    s.fixed = true;
                    s.endIdx = idx;
                    s.endVal = val;
                } else {
                    // Third click restarts measurement
                    s.fixed = false;
                    s.startIdx = idx;
                    s.startVal = val;
                    s.endIdx = idx;
                    s.endVal = val;
                }
                u.redraw();
            });
            over.addEventListener('mousemove', (e) => {
                const s = rulerState.current;
                if (!s.active || s.fixed) return;
                const rect = over.getBoundingClientRect();
                const idx = u.posToIdx(e.clientX - rect.left);
                const val = u.posToVal(e.clientY - rect.top, 'y');
                if (idx !== null && val !== null) {
                    s.endIdx = idx;
                    s.endVal = val;
                    u.redraw();
                }
            });
        };

        const opts: uPlot.Options = {
            width: dimensions.width,
            height: dimensions.height,
            title: '',
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
                {
                    show: false,
                    grid: { show: false }
                },
                {
                    show: false,
                    scale: 'y',
                    grid: {
                        show: true,
                        stroke: '#191d28',
                        width: 1,
                        dash: []
                    }
                }
            ],
            scales: {
                x: {
                    time: true,
                    range: (_u, min, max) => {
                        const secondsPerCandle = intervalToSeconds(interval);
                        return [min, max + (secondsPerCandle * 3)];
                    }
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
            hooks: { draw: [drawCandles, drawVolume, drawRuler], init: [initRuler] },
            cursor: {
                show: true,
                drag: { x: true, y: true },
                points: { show: false },
                lock: true,
                focus: { prox: 16 }
            },
            legend: { show: false }
        };

        uPlotRef.current = new uPlot(opts, data, chartRef.current!);
        // @ts-ignore
        uPlotRef.current._interval = interval;
        // @ts-ignore
        uPlotRef.current._gridCount = gridCount;
    }, [symbol, interval, dimensions, safeCandles, gridCount]);

    // Global Key Listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                rulerState.current = { active: false, fixed: false, startIdx: null, startVal: null, endIdx: null, endVal: null };
                if (uPlotRef.current) uPlotRef.current.redraw();
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift' && rulerState.current.active) {
                rulerState.current.active = false;
                rulerState.current.fixed = false;
                if (uPlotRef.current) uPlotRef.current.redraw();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            if (uPlotRef.current) {
                uPlotRef.current.destroy();
                uPlotRef.current = null;
            }
        };
    }, []);

    return (
        <div ref={chartRef} className="w-full h-full relative overflow-hidden">
            {/* Symbol Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                <span className="text-[120px] font-bold text-white/[0.04] uppercase tracking-tighter">
                    {symbol.replace('USDT', '')}
                </span>
            </div>
        </div>
    );
};
