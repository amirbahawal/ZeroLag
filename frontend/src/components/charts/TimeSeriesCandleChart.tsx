import React, { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Interval, Candle } from '../../core/types';
import { validateCandles } from '../../utils/candleValidator';

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

    // ====== DIAGNOSTIC CODE (TEMPORARY) ======
    useEffect(() => {
        console.group(`[uPlot ${symbol}] Initialization`);
        console.log('Received props:', {
            candleCount: safeCandles.length,
            width: dimensions.width,
            height: dimensions.height,
            containerRef: chartRef.current ? 'exists' : 'null'
        });

        if (safeCandles.length === 0) {
            console.error('❌ No candles provided to uPlot');
            console.groupEnd();
            return;
        }

        // Validate candles
        const validation = validateCandles(safeCandles);
        if (!validation.valid) {
            console.error('❌ Invalid candle data:', validation.errors);
            console.groupEnd();
            return;
        }

        console.log('✅ Candles validated');
        console.groupEnd();
    }, [safeCandles.length, dimensions.width, dimensions.height, symbol]);
    // ====== END DIAGNOSTIC CODE ======

    // Resize observer to handle responsive layout
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

    // Early return if no data
    if (safeCandles.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                No data
            </div>
        );
    }

    // Initialize and update chart
    useEffect(() => {
        if (!chartRef.current) return;

        // Don't render if dimensions are invalid
        if (dimensions.width === 0 || dimensions.height === 0) return;

        // Prepare data for uPlot [time, open, high, low, close, volume]
        const data: [number[], number[], number[], number[], number[], number[]] = [
            [], [], [], [], [], []
        ];

        safeCandles.forEach(c => {
            data[0].push(c.openTime / 1000);
            data[1].push(c.open);
            data[2].push(c.high);
            data[3].push(c.low);
            data[4].push(c.close);
            data[5].push(c.volumeBase);
        });

        // Debug uPlot data
        console.log(`[uPlot ${symbol}] Data prepared:`, {
            seriesCount: data.length,
            pointsPerSeries: data[0].length,
            firstTimestamp: new Date(data[0][0] * 1000).toISOString(),
            lastTimestamp: new Date(data[0][data[0].length - 1] * 1000).toISOString(),
        });

        // If uPlot instance exists, check if we need to recreate it (e.g. interval changed)
        // We use a data attribute on the instance to track the interval it was created with
        // @ts-ignore - attaching custom property
        if (uPlotRef.current && uPlotRef.current._interval === interval) {
            uPlotRef.current.setData(data);
            uPlotRef.current.setSize(dimensions);
            return;
        }

        // If interval changed or instance doesn't exist, destroy old one if present
        if (uPlotRef.current) {
            uPlotRef.current.destroy();
            uPlotRef.current = null;
        }

        // Otherwise create new instance
        const drawCandles = (u: uPlot) => {
            u.ctx.save();

            const data = u.data;
            const time = data[0];
            const open = data[1];
            const high = data[2];
            const low = data[3];
            const close = data[4];

            if (!u.series[0].idxs) return;
            const [iMin, iMax] = u.series[0].idxs;

            for (let i = iMin; i <= iMax; i++) {
                const t = time[i];
                const o = open[i];
                const h = high[i];
                const l = low[i];
                const c = close[i];

                if (t === undefined || o === undefined || h === undefined || l === undefined || c === undefined ||
                    t === null || o === null || h === null || l === null || c === null) {
                    continue;
                }

                const xVal = Math.round(u.valToPos(t, 'x', true));
                const oVal = Math.round(u.valToPos(o, 'y', true));
                const hVal = Math.round(u.valToPos(h, 'y', true));
                const lVal = Math.round(u.valToPos(l, 'y', true));
                const cVal = Math.round(u.valToPos(c, 'y', true));

                // Determine color
                const isGreen = c >= o;
                const color = isGreen ? '#0ECB81' : '#F6465D'; // Binance Green / Red
                const bodyColor = color; // Solid fill

                u.ctx.fillStyle = bodyColor;
                u.ctx.strokeStyle = color;
                u.ctx.lineWidth = 1;

                // Draw wick
                u.ctx.beginPath();
                u.ctx.moveTo(xVal, hVal);
                u.ctx.lineTo(xVal, lVal);
                u.ctx.stroke();

                // Draw body
                const bodyHeight = Math.max(Math.abs(oVal - cVal), 1);
                const y = Math.min(oVal, cVal);

                // Fixed width with gap
                // 0.7 factor ensures distinct gap between candles
                const barWidth = Math.max((u.bbox.width / (iMax - iMin)) * 0.7, 1);

                u.ctx.fillRect(xVal - barWidth / 2, y, barWidth, bodyHeight);
                // Removed strokeRect to ensure solid flat look and avoid border artifacts
            }

            u.ctx.restore();
        };

        // Ruler drawing hook
        const drawRuler = (u: uPlot) => {
            const s = rulerState.current;
            if (!s.active || s.startIdx === null || s.endIdx === null || s.startVal === null || s.endVal === null) return;

            const ctx = u.ctx;
            ctx.save();

            // Get coordinates
            // Use u.data[0] for time. u.data[0] contains timestamps.
            // We need to ensure indices are within bounds
            const x1 = u.valToPos(u.data[0][s.startIdx], 'x', true);
            const y1 = u.valToPos(s.startVal, 'y', true);
            const x2 = u.valToPos(u.data[0][s.endIdx], 'x', true);
            const y2 = u.valToPos(s.endVal, 'y', true);

            // Draw Line
            ctx.strokeStyle = '#3c82ff';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Calculate Deltas
            const priceDelta = s.endVal - s.startVal;
            const pricePct = (priceDelta / s.startVal) * 100;
            const barsDelta = s.endIdx - s.startIdx;

            // Draw Label Box
            const labelText = `${priceDelta >= 0 ? '+' : ''}${priceDelta.toFixed(2)} (${pricePct.toFixed(2)}%) ${barsDelta} bars`;

            ctx.font = '10px Inter, sans-serif';
            const textMetrics = ctx.measureText(labelText);
            const padding = 4;
            const boxWidth = textMetrics.width + (padding * 2);
            const boxHeight = 20;

            // Position label near end point but keep inside bounds
            let boxX = x2 + 10;
            let boxY = y2 - 10;

            if (boxX + boxWidth > u.bbox.width) boxX = x2 - boxWidth - 10;
            if (boxY < 0) boxY = y2 + 10;

            ctx.fillStyle = 'rgba(12, 15, 24, 0.9)';
            ctx.strokeStyle = '#3c82ff';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

            ctx.fillStyle = '#e7edf7';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, boxX + padding, boxY + (boxHeight / 2));

            // Draw dots at start and end
            ctx.fillStyle = '#3c82ff';
            ctx.beginPath();
            ctx.arc(x1, y1, 3, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x2, y2, 3, 0, 2 * Math.PI);
            ctx.fill();

            ctx.restore();
        };

        // Current Price Line Hook
        const drawCurrentPrice = (u: uPlot) => {
            const data = u.data;
            const close = data[4];
            const len = close.length;
            if (len === 0) return;

            const lastPrice = close[len - 1];
            const lastTime = data[0][len - 1];

            if (lastPrice === undefined || lastPrice === null) return;

            const ctx = u.ctx;
            ctx.save();

            const y = Math.round(u.valToPos(lastPrice, 'y', true));
            const x = Math.round(u.valToPos(lastTime, 'x', true)); // End of the line (candle position)
            const xEnd = u.bbox.width; // Right edge of chart area

            // Determine color
            const open = data[1];
            const lastOpen = open[len - 1];
            const isGreen = lastPrice >= (lastOpen ?? 0);
            const color = isGreen ? '#0ECB81' : '#F6465D';

            // Draw Dotted Line
            ctx.globalAlpha = 0.7; // Make line less obtrusive
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.5; // Thinner line
            ctx.setLineDash([2, 4]); // Finer dash pattern
            ctx.beginPath();
            ctx.moveTo(x, y); // Start from the candle center (x) instead of 0
            ctx.lineTo(xEnd, y);
            ctx.stroke();

            // Draw Label on Y-Axis (Right Side)
            ctx.globalAlpha = 1.0; // Reset alpha for text
            const fontSize = 10;
            ctx.font = `bold ${fontSize}px Inter, sans-serif`;
            const text = lastPrice.toFixed(2);
            const textMetrics = ctx.measureText(text);
            const padding = 4;
            const boxHeight = fontSize + padding * 2;
            const boxWidth = textMetrics.width + padding * 2;

            // Position badge outside the chart area (in the gutter) if possible, 
            // but uPlot draws on canvas. We need to draw it on the right edge.
            // Since we set padding right, we can draw there.

            const badgeX = xEnd;
            const badgeY = y - boxHeight / 2;

            ctx.fillStyle = color;
            ctx.setLineDash([]);
            // Draw badge shape (rect with rounded corners looks nice, but simple rect for now)
            ctx.fillRect(badgeX, badgeY, boxWidth + 10, boxHeight); // +10 to extend off canvas if needed

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, badgeX + padding, y);

            ctx.restore();
        };

        // Mouse interaction for ruler
        const initRuler = (u: uPlot) => {
            const over = u.over;

            // Mouse move
            over.addEventListener('mousemove', (e) => {
                if (!e.shiftKey && !rulerState.current.fixed) return;

                const rect = over.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const idx = u.posToIdx(x);
                const val = u.posToVal(y, 'y');

                if (idx === null || val === null) return;

                const s = rulerState.current;

                if (s.active && !s.fixed) {
                    s.endIdx = idx;
                    s.endVal = val;
                    u.redraw();
                }
            });

            // Mouse down
            over.addEventListener('mousedown', (e) => {
                if (!e.shiftKey) return;

                const rect = over.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const idx = u.posToIdx(x);
                const val = u.posToVal(y, 'y');

                if (idx === null || val === null) return;

                const s = rulerState.current;

                if (!s.active) {
                    // Start ruler
                    s.active = true;
                    s.fixed = false;
                    s.startIdx = idx;
                    s.startVal = val;
                    s.endIdx = idx;
                    s.endVal = val;
                } else if (!s.fixed) {
                    // Fix ruler
                    s.fixed = true;
                    s.endIdx = idx;
                    s.endVal = val;
                } else {
                    // Reset if clicking again while fixed? 
                    // Spec says "Second click... fixes". 
                    // "Shift keyup or Esc... clear".
                    // Let's allow restarting if they click again with Shift
                    s.active = true;
                    s.fixed = false;
                    s.startIdx = idx;
                    s.startVal = val;
                    s.endIdx = idx;
                    s.endVal = val;
                }
                u.redraw();
            });
        };

        const getIntervalSeconds = (intvl: Interval) => {
            const map: Record<string, number> = {
                '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400
            };
            return map[intvl] || 3600;
        };

        const opts: uPlot.Options = {
            width: dimensions.width,
            height: dimensions.height,
            title: '',
            tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), 'Etc/UTC'),
            padding: [0, 50, 0, 0], // Right padding for Y-axis labels
            series: [
                { label: 'Time' },
                {
                    label: 'Open',
                    value: (_u, v) => v == null ? '-' : v.toFixed(2),
                    show: true,
                    paths: () => null,
                    points: { show: false }
                },
                {
                    label: 'High',
                    value: (_u, v) => v == null ? '-' : v.toFixed(2),
                    show: true,
                    paths: () => null,
                    points: { show: false }
                },
                {
                    label: 'Low',
                    value: (_u, v) => v == null ? '-' : v.toFixed(2),
                    show: true,
                    paths: () => null,
                    points: { show: false }
                },
                {
                    label: 'Close',
                    value: (_u, v) => v == null ? '-' : v.toFixed(2),
                    show: true,
                    paths: () => null,
                    points: { show: false }
                },
                {
                    label: 'Volume',
                    scale: 'vol',
                    value: (_u, v) => v == null ? '-' : v.toFixed(2),
                    show: true,
                    paths: () => null,
                    points: { show: false }
                }
            ],
            axes: [
                { show: false }, // X-axis hidden
                {
                    show: true,
                    side: 1, // Right side
                    scale: 'y',
                    grid: {
                        show: false, // Disable grid lines
                    },
                    ticks: {
                        show: false
                    },
                    stroke: '#888888', // Label color
                    font: '10px Inter, sans-serif',
                    gap: 5,
                    size: 50 // Width of the axis area
                }
            ],
            scales: {
                x: {
                    time: true,
                    range: (u, min, max) => {
                        const len = u.data[0].length;
                        const VISIBLE_CANDLES = 50;
                        if (len > VISIBLE_CANDLES) {
                            const intervalSec = getIntervalSeconds(interval);
                            return [
                                u.data[0][len - VISIBLE_CANDLES] - intervalSec * 0.5,
                                u.data[0][len - 1] + intervalSec * 5 // Add gap of 5 candles on the right
                            ];
                        }
                        return [min, max];
                    }
                },
                y: {
                    auto: true,
                    range: (_u, min, max) => {
                        const range = max - min;
                        if (range === 0) return [min - 1, max + 1];
                        const padding = range * 0.05;
                        return [min - padding, max + padding];
                    }
                },
                vol: {
                    auto: true,
                    range: (_u, _min, max) => [0, max * 5]
                }
            },
            hooks: {
                draw: [drawCandles, drawCurrentPrice, drawRuler],
                init: [initRuler]
            },
            cursor: {
                show: false
            },
            legend: {
                show: false
            }
        };

        console.log(`[uPlot ${symbol}] Creating uPlot instance...`);
        uPlotRef.current = new uPlot(opts, data, chartRef.current);
        // @ts-ignore - attaching custom property
        uPlotRef.current._interval = interval;
        console.log(`[uPlot ${symbol}] ✅ Chart created successfully`);

    }, [symbol, interval, dimensions, safeCandles]);

    // Global Key Listener for Ruler (Shift/Esc)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                rulerState.current = {
                    active: false,
                    fixed: false,
                    startIdx: null,
                    startVal: null,
                    endIdx: null,
                    endVal: null
                };
                if (uPlotRef.current) uPlotRef.current.redraw();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                if (!rulerState.current.fixed) {
                    rulerState.current.active = false;
                    if (uPlotRef.current) uPlotRef.current.redraw();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Cleanup on unmount
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
