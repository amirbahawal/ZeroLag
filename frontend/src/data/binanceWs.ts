import type { Interval, Candle } from '../core/types';
import { useZeroLagStore } from '../state/useZeroLagStore';

export type CandleCallback = (candle: Candle) => void;

interface BinanceKlineMessage {
    e: 'kline';
    E: number;
    s: string;
    k: {
        t: number; T: number; s: string; i: string; f: number; L: number;
        o: string; c: string; h: string; l: string; v: string; n: number;
        x: boolean; q: string; V: string; Q: string; B: string;
    };
}

export class BinanceWebSocketManager {
    private static instance: BinanceWebSocketManager;
    private ws: WebSocket | null = null;
    private baseUrl = 'wss://fstream.binance.com/ws';
    private activeSubscriptions = new Set<string>();
    private streamCallbacks = new Map<string, Set<CandleCallback>>();
    private globalListeners = new Set<(candle: Candle) => void>();
    private shouldReconnect = true;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private isConnecting = false;

    private constructor() { }

    static getInstance(): BinanceWebSocketManager {
        if (!BinanceWebSocketManager.instance) {
            BinanceWebSocketManager.instance = new BinanceWebSocketManager();
        }
        return BinanceWebSocketManager.instance;
    }

    public async connect(): Promise<void> {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
        if (this.isConnecting) return;

        this.isConnecting = true;
        this.shouldReconnect = true;

        try {
            this.ws = new WebSocket(this.baseUrl);
            this.ws.onopen = this.handleOpen.bind(this);
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onerror = this.handleError.bind(this);
            this.ws.onclose = this.handleClose.bind(this);
        } catch (error) {
            console.error('[WS] Connection failed:', error);
            this.isConnecting = false;
            this.handleClose({ code: 1006 } as CloseEvent);
        }
    }

    private handleOpen(): void {
        this.isConnecting = false;
        useZeroLagStore.getState().setWsConnected(true);
        if (this.activeSubscriptions.size > 0) {
            this.sendSubscribe(Array.from(this.activeSubscriptions));
        }
    }

    private handleMessage(event: MessageEvent): void {
        try {
            const data = JSON.parse(event.data);
            if (data.e === 'kline') {
                const candle = this.parseKlineToCandle(data);
                if (candle) this.notifyListeners(candle);
            }
        } catch (error) {
            console.error('[WS] Parse error:', error);
        }
    }

    private handleError(event: Event): void {
        console.error('[WS] Error:', event);
        useZeroLagStore.getState().setWsConnected(false);
    }

    private handleClose(_event: CloseEvent): void {
        this.ws = null;
        this.isConnecting = false;
        useZeroLagStore.getState().setWsConnected(false);

        if (this.shouldReconnect) {
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        }
    }

    public subscribe(streams: string[]): Promise<void> {
        streams.forEach(s => this.activeSubscriptions.add(s));
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendSubscribe(streams);
        } else if (!this.isConnecting && !this.ws) {
            this.connect();
        }
        return Promise.resolve();
    }

    public subscribeWithCallback(symbol: string, interval: Interval, callback: CandleCallback): Promise<void> {
        const stream = this.buildStreamName(symbol, interval);
        if (!this.streamCallbacks.has(stream)) this.streamCallbacks.set(stream, new Set());
        this.streamCallbacks.get(stream)?.add(callback);
        return this.subscribe([stream]);
    }

    public unsubscribe(streams: string[]): Promise<void> {
        streams.forEach(s => {
            this.activeSubscriptions.delete(s);
            this.streamCallbacks.delete(s);
        });

        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: streams, id: Date.now() }));
        }
        return Promise.resolve();
    }

    public unsubscribeWithCallback(symbol: string, interval: Interval, callback?: CandleCallback): Promise<void> {
        const stream = this.buildStreamName(symbol, interval);
        if (callback) {
            const callbacks = this.streamCallbacks.get(stream);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    this.streamCallbacks.delete(stream);
                    return this.unsubscribe([stream]);
                }
            }
        } else {
            this.streamCallbacks.delete(stream);
            return this.unsubscribe([stream]);
        }
        return Promise.resolve();
    }

    private sendSubscribe(streams: string[]): void {
        if (this.ws?.readyState === WebSocket.OPEN && streams.length > 0) {
            this.ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: Date.now() }));
        }
    }

    private parseKlineToCandle(msg: BinanceKlineMessage): Candle | null {
        try {
            const k = msg.k;
            return {
                symbol: k.s,
                interval: k.i as Interval,
                openTime: k.t,
                closeTime: k.T,
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volumeBase: parseFloat(k.v),
                volumeQuote: parseFloat(k.q),
                trades: k.n,
                isFinal: k.x
            };
        } catch (error) {
            return null;
        }
    }

    private notifyListeners(candle: Candle): void {
        this.globalListeners.forEach(l => l(candle));
        const stream = this.buildStreamName(candle.symbol, candle.interval);
        this.streamCallbacks.get(stream)?.forEach(cb => cb(candle));
    }

    public onKline(callback: (candle: Candle) => void): () => void {
        this.globalListeners.add(callback);
        return () => { this.globalListeners.delete(callback); };
    }

    public on(symbol: string, interval: Interval, callback: CandleCallback): void {
        this.subscribeWithCallback(symbol, interval, callback);
    }

    public off(symbol: string, interval: Interval, callback: CandleCallback): void {
        this.unsubscribeWithCallback(symbol, interval, callback);
    }

    public buildStreamName(symbol: string, interval: Interval): string {
        return `${symbol.toLowerCase()}@kline_${interval}`;
    }

    public disconnect(): void {
        this.shouldReconnect = false;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

export const defaultWsManager = BinanceWebSocketManager.getInstance();
