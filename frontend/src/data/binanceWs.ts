/**
 * Binance Futures WebSocket Manager
 * 
 * Manages a single multiplexed WebSocket connection to Binance Futures.
 * Spec 4.2: Single active WebSocket instance with subscribe/unsubscribe by stream ID.
 * Spec 4.3: Reconnect logic and error handling.
 */

import type { Interval, Candle } from '../core/types';
import { useZeroLagStore } from '../state/useZeroLagStore';

/* =============================================
   TYPES
   ============================================= */

export type CandleCallback = (candle: Candle) => void;

interface BinanceKlineMessage {
    e: 'kline';
    E: number;
    s: string;
    k: {
        t: number;
        T: number;
        s: string;
        i: string;
        f: number;
        L: number;
        o: string;
        c: string;
        h: string;
        l: string;
        v: string;
        n: number;
        x: boolean;
        q: string;
        V: string;
        Q: string;
        B: string;
    };
}

/* =============================================
   BINANCE WEBSOCKET MANAGER
   ============================================= */

export class BinanceWebSocketManager {
    private static instance: BinanceWebSocketManager;
    private ws: WebSocket | null = null;
    private baseUrl = 'wss://fstream.binance.com/ws';

    // Track active subscriptions (stream names)
    private activeSubscriptions = new Set<string>();

    // Callbacks mapped by stream name
    private streamCallbacks = new Map<string, Set<CandleCallback>>();

    // Global listeners
    private globalListeners = new Set<(candle: Candle) => void>();

    // Reconnection control
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

    /**
     * Connect to Binance WebSocket
     * Spec 4.2: Maintain one active WebSocket instance
     */
    public async connect(): Promise<void> {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            console.log('[WS] Already connected or connecting');
            return;
        }

        if (this.isConnecting) return;
        this.isConnecting = true;
        this.shouldReconnect = true;

        console.log('[WS] Connecting to Binance Futures WebSocket...');

        try {
            this.ws = new WebSocket(this.baseUrl);

            this.ws.onopen = this.handleOpen.bind(this);
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onerror = this.handleError.bind(this);
            this.ws.onclose = this.handleClose.bind(this);
        } catch (error) {
            console.error('[WS] Connection creation failed:', error);
            this.isConnecting = false;
            this.handleClose({ code: 1006, reason: 'Connection failed', wasClean: false } as CloseEvent);
        }
    }

    private handleOpen(): void {
        console.log('[WS] Connected successfully');
        this.isConnecting = false;
        useZeroLagStore.getState().setWsConnected(true);

        // Spec 4.3: On reconnect, resubscribe to all active streams
        if (this.activeSubscriptions.size > 0) {
            const streams = Array.from(this.activeSubscriptions);
            console.log(`[WS] Resubscribing to ${streams.length} streams`);
            this.sendSubscribe(streams);
        }
    }

    private handleMessage(event: MessageEvent): void {
        try {
            const data = JSON.parse(event.data);

            // Handle kline events only (Spec 4.2: No other streams)
            if (data.e === 'kline') {
                const candle = this.parseKlineToCandle(data);
                if (candle) {
                    this.notifyListeners(candle);
                }
            }
        } catch (error) {
            console.error('[WS] Error parsing message:', error);
        }
    }

    private handleError(event: Event): void {
        console.error('[WS] WebSocket error:', event);
        // Error will usually trigger onClose, but we set state here just in case
        useZeroLagStore.getState().setWsConnected(false);
    }

    private handleClose(event: CloseEvent): void {
        console.log(`[WS] Connection closed: ${event.code} ${event.reason}`);
        this.ws = null;
        this.isConnecting = false;
        useZeroLagStore.getState().setWsConnected(false);

        // Spec 4.3: On close or error, try to reconnect after 5 seconds
        if (this.shouldReconnect) {
            console.log('[WS] Reconnecting in 5 seconds...');
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

            this.reconnectTimer = setTimeout(() => {
                this.connect();
            }, 5000); // Exactly 5 seconds as per spec
        }
    }

    /**
     * Subscribe to streams
     * Spec 4.2: Allow subscribe for streams by ID
     */
    public subscribe(streams: string[]): Promise<void> {
        // Add to active subscriptions
        streams.forEach(stream => this.activeSubscriptions.add(stream));

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendSubscribe(streams);
        } else if (!this.isConnecting && !this.ws) {
            this.connect();
        }
        return Promise.resolve();
    }

    /**
     * Helper to subscribe with callback (Adapter for existing code)
     */
    public subscribeWithCallback(symbol: string, interval: Interval, callback: CandleCallback): Promise<void> {
        const stream = this.buildStreamName(symbol, interval);

        if (!this.streamCallbacks.has(stream)) {
            this.streamCallbacks.set(stream, new Set());
        }
        this.streamCallbacks.get(stream)?.add(callback);

        return this.subscribe([stream]);
    }

    /**
     * Unsubscribe from streams
     * Spec 4.2: Allow unsubscribe for streams by ID
     */
    public unsubscribe(streams: string[]): Promise<void> {
        // Remove from active subscriptions
        streams.forEach(stream => {
            this.activeSubscriptions.delete(stream);
            this.streamCallbacks.delete(stream);
        });

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                method: 'UNSUBSCRIBE',
                params: streams,
                id: Date.now()
            };
            this.ws.send(JSON.stringify(message));
            console.log('[WS] Unsubscribed from:', streams);
        }
        return Promise.resolve();
    }

    /**
     * Helper to unsubscribe (Adapter for existing code)
     */
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
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || streams.length === 0) return;

        // Send in one go (No batching as per "minimal" spec, assuming < 1024 streams)
        const message = {
            method: 'SUBSCRIBE',
            params: streams,
            id: Date.now()
        };

        this.ws.send(JSON.stringify(message));
        console.log(`[WS] Subscribed to ${streams.length} streams`);
    }

    /**
     * Spec 4.2: Decode incoming kline events and forward as Candle objects
     */
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
            console.error('[WS] Error parsing kline:', error);
            return null;
        }
    }

    private notifyListeners(candle: Candle): void {
        // 1. Notify global listeners
        this.globalListeners.forEach(listener => listener(candle));

        // 2. Notify specific stream subscribers
        const stream = this.buildStreamName(candle.symbol, candle.interval);
        const callbacks = this.streamCallbacks.get(stream);
        if (callbacks) {
            callbacks.forEach(cb => cb(candle));
        }
    }

    /**
     * Register global listener
     */
    public onKline(callback: (candle: Candle) => void): () => void {
        this.globalListeners.add(callback);
        return () => {
            this.globalListeners.delete(callback);
        };
    }

    /**
     * Helper to add listener (Adapter)
     */
    public on(symbol: string, interval: Interval, callback: CandleCallback): void {
        this.subscribeWithCallback(symbol, interval, callback);
    }

    /**
     * Helper to remove listener (Adapter)
     */
    public off(symbol: string, interval: Interval, callback: CandleCallback): void {
        this.unsubscribeWithCallback(symbol, interval, callback);
    }

    public buildStreamName(symbol: string, interval: Interval): string {
        return `${symbol.toLowerCase()}@kline_${interval}`;
    }

    public disconnect(): void {
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        console.log('[WS] Disconnected');
    }
}

export const defaultWsManager = BinanceWebSocketManager.getInstance();
