import React, { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Interval, Candle } from '../../core/types';

interface TimeSeriesCandleChartProps {
    symbol: string;
    interval: Interval;
    candles: Candle[];
}

export const TimeSeriesCandleChart: React.FC<TimeSeriesCandleChartProps> = ({ symbol, interval, candles = [] }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const uPlotRef = useRef<uPlot | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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

    if (safeCandles.length === 0) {
        return <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">No data</div>;
    }

    // Chart Initialization
    useEffect(() => {
        if (!chartRef.current || dimensions.width === 0 || dimensions.height === 0) return;

        const data: [number[], number[], number[], number[], number[], number[]] = [[], [], [], [], [], []];
        safeCandles.forEach(c => {
            data[0].push(c.openTime / 1000);
            data[1].push(c.open);
            data[2].push(c.high);
            data[3].push(c.low);
            data[4].push(c.close);
            data[5].push(c.volumeBase);
        });

        // @ts-ignore
        if (uPlotRef.current && uPlotRef.current._interval === interval) {
            uPlotRef.current.setData(data);
            uPlotRef.current.setSize(dimensions);
            return;
        }

        if (uPlotRef.current) {
            uPlotRef.current.destroy();
            uPlotRef.current = null;
        }

        const drawCandles = (u: uPlot) => {
            u.ctx.save();
            if (!u.series[0].idxs) { u.ctx.restore(); return; }
            const [iMin, iMax] = u.series[0].idxs;
            const style = getComputedStyle(document.documentElement);
            const upColor = style.getPropertyValue('--candle-up').trim() || '#0ECB81';
            const downColor = style.getPropertyValue('--candle-down').trim() || '#F6465D';

            for (let i = iMin; i <= iMax; i++) {
                const t = u.data[0][i];
                const o = u.data[1][i];
                const h = u.data[2][i];
                const l = u.data[3][i];
                const c = u.data[4][i];
                if (t == null || o == null || h == null || l == null || c == null) continue;

                const xVal = Math.round(u.valToPos(t, 'x', true));
                const oVal = Math.round(u.valToPos(o, 'y', true));
                const hVal = Math.round(u.valToPos(h, 'y', true));
                const lVal = Math.round(u.valToPos(l, 'y', true));
                const cVal = Math.round(u.valToPos(c, 'y', true));
                const isGreen = (c as number) >= (o as number);
                const color = isGreen ? upColor : downColor;

                u.ctx.fillStyle = color;
                u.ctx.strokeStyle = color;
                u.ctx.lineWidth = 1;
                u.ctx.beginPath();
                u.ctx.moveTo(xVal, hVal);
                u.ctx.lineTo(xVal, lVal);
                u.ctx.stroke();
                const bodyHeight = Math.max(Math.abs(oVal - cVal), 1);
                const barWidth = Math.max((u.bbox.width / (iMax - iMin)) * 0.7, 1);
                u.ctx.fillRect(xVal - barWidth / 2, Math.min(oVal, cVal), barWidth, bodyHeight);
            }
            u.ctx.restore();
        };

        const drawVolume = (u: uPlot) => {
            u.ctx.save();
            if (!u.series[0].idxs) { u.ctx.restore(); return; }
            const [iMin, iMax] = u.series[0].idxs;
            const style = getComputedStyle(document.documentElement);
            const upColor = style.getPropertyValue('--candle-up').trim() || '#0ECB81';
            const downColor = style.getPropertyValue('--candle-down').trim() || '#F6465D';

            for (let i = iMin; i <= iMax; i++) {
                const t = u.data[0][i];
                const v = u.data[5][i];
                const o = u.data[1][i];
                const c = u.data[4][i];
                if (t == null || v == null || o == null || c == null) continue;

                const xVal = Math.round(u.valToPos(t, 'x', true));
                const yVal = Math.round(u.valToPos(v, 'vol', true));
                const height = (u.bbox.height + u.bbox.top) - yVal;
                const barWidth = Math.max((u.bbox.width / (iMax - iMin)) * 0.7, 1);
                const isGreen = (c as number) >= (o as number);
                u.ctx.fillStyle = isGreen ? upColor : downColor;
                u.ctx.globalAlpha = 0.3;
                u.ctx.fillRect(xVal - barWidth / 2, yVal, barWidth, height);
            }
            u.ctx.restore();
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
            padding: [10, 0, 0, 0],
            series: [
                { label: 'Time' },
                { label: 'Open', show: true, paths: () => null, points: { show: false } },
                { label: 'High', show: true, paths: () => null, points: { show: false } },
                { label: 'Low', show: true, paths: () => null, points: { show: false } },
                { label: 'Close', show: true, paths: () => null, points: { show: false } },
                { label: 'Volume', scale: 'vol', show: true, paths: () => null, points: { show: false } }
            ],
            axes: [
                { show: false },
                { show: false, scale: 'y', grid: { show: true, stroke: 'var(--grid-lines, #2a2d31)', width: 1, dash: [] } }
            ],
            scales: {
                x: { time: true },
                y: { auto: true },
                vol: { auto: true, range: (_u, _min, max) => [0, max * 6.66] }
            },
            hooks: { draw: [drawCandles, drawVolume, drawRuler], init: [initRuler] },
            cursor: { show: true, drag: { x: true, y: true }, points: { show: false } },
            legend: { show: false }
        };

        uPlotRef.current = new uPlot(opts, data, chartRef.current);
        // @ts-ignore
        uPlotRef.current._interval = interval;
    }, [symbol, interval, dimensions, safeCandles]);

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

    return <div ref={chartRef} className="w-full h-full" />;
};
