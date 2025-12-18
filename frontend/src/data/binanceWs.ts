/**
 * Binance Futures WebSocket Manager
 * 
 * Manages WebSocket connections to Binance Futures for real-time candle updates.
 * Handles subscriptions, auto-reconnection, and message parsing.
 */

import type { Interval, Candle } from '../core/types';
import { useZeroLagStore } from '../state/useZeroLagStore';

/* =============================================
   TYPES
   ============================================= */

/** WebSocket callback for candle updates */
export type CandleCallback = (candle: Candle) => void;

/** Stream identifier */
type StreamKey = string; // Format: "symbol@interval"

/** Subscription info */
interface Subscription {
    symbol: string;
    interval: Interval;
    callbacks: Set<CandleCallback>;
}

/** Binance WebSocket kline message structure */
export interface BinanceKlineMessage {
    e: 'kline'; // Event type
    E: number; // Event time
    s: string; // Symbol
    k: {
        t: number; // Kline start time
        T: number; // Kline close time
        s: string; // Symbol
        i: string; // Interval
        f: number; // First trade ID
        L: number; // Last trade ID
        o: string; // Open price
        c: string; // Close price
        h: string; // High price
        l: string; // Low price
        v: string; // Base asset volume
        n: number; // Number of trades
        x: boolean; // Is this kline closed?
        q: string; // Quote asset volume
        V: string; // Taker buy base asset volume
        Q: string; // Taker buy quote asset volume
        B: string; // Ignore
    };
}

/**
 * Parse kline message into Candle object
 */
export function parseKlineMessage(msg: BinanceKlineMessage): Candle {
    if (!msg || !msg.k) {
        throw new Error('Invalid kline message');
    }

    const kline = msg.k;

    return {
        symbol: kline.s,
        interval: kline.i as Interval,
        openTime: kline.t,
        closeTime: kline.T,
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volumeBase: parseFloat(kline.v),
        volumeQuote: parseFloat(kline.q),
        trades: kline.n,
        isFinal: kline.x,
    };
}

/* =============================================
   BINANCE WEBSOCKET MANAGER
   ============================================= */

export class BinanceWebSocketManager {
    private ws: WebSocket | null = null;
    private baseUrl = 'wss://fstream.binance.com/ws';
    private subscriptions = new Map<StreamKey, Subscription>();
    private rawSubscriptions = new Set<string>(); // Track raw streams
    private globalListeners = new Set<(candle: Candle) => void>(); // Global listeners
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private baseReconnectDelay = 5000; // Start at 5 seconds
    private maxReconnectDelay = 60000; // Max 60 seconds
    private isConnecting = false;
    private shouldReconnect = true;
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private lastPongTime = 0;
    private heartbeatIntervalMs = 30000; // 30 seconds

    /**
     * Get reconnect delay with exponential backoff
     */
    private getReconnectDelay(): number {
        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        );
        return delay;
    }

    /**
     * Start heartbeat to detect stale connections
     */
    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.lastPongTime = Date.now();

        this.heartbeatInterval = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return;
            }

            // Check if we received a pong recently
            const timeSinceLastPong = Date.now() - this.lastPongTime;
            if (timeSinceLastPong > this.heartbeatIntervalMs * 2) {
                console.warn('[Binance WS] No response to heartbeat, reconnecting...');
                this.ws.close();
                return;
            }

            // Send ping
            try {
                this.ws.send(JSON.stringify({ method: 'PING' }));
            } catch {
                // Ignore send errors
            }
        }, this.heartbeatIntervalMs);
    }

    /**
     * Stop heartbeat
     */
    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Connect to Binance WebSocket
     */
    public async connect(): Promise<void> {
        if (this.ws?.readyState === WebSocket.OPEN) {
            return;
        }

        if (this.isConnecting) {
            // Wait for existing connection attempt
            return new Promise((resolve) => {
                const check = setInterval(() => {
                    if (!this.isConnecting) {
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
            });
        }

        this.isConnecting = true;
        this.shouldReconnect = true; // Reset flag

        try {
            // Connect to base endpoint
            const url = this.baseUrl;

            console.log('[Binance WS] Connecting to:', url);
            this.ws = new WebSocket(url);

            this.ws.onopen = this.handleOpen.bind(this);
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onerror = this.handleError.bind(this);
            this.ws.onclose = this.handleClose.bind(this);

            // Wait for connection to open
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('WebSocket connection timeout'));
                }, 10000);

                this.ws!.addEventListener('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.ws!.addEventListener('error', () => {
                    clearTimeout(timeout);
                    reject(new Error('WebSocket connection failed'));
                });
            });
        } catch (error) {
            console.error('[Binance WS] Connection failed:', error);
            this.isConnecting = false;
            throw error;
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * Helper to build stream name
     */
    public buildStreamName(symbol: string, interval: Interval): string {
        return `${symbol.toLowerCase()}@kline_${interval}`;
    }

    /**
     * Subscribe to streams
     * 
     * Overload 1: Raw stream strings
     * Overload 2: Symbol/Interval/Callback helper
     */
    public subscribe(streams: string[]): void;
    public subscribe(symbol: string, interval: Interval, callback: CandleCallback): Promise<void>;
    public subscribe(
        arg1: string[] | string,
        arg2?: Interval,
        arg3?: CandleCallback
    ): void | Promise<void> {
        // Overload 1: Raw streams
        if (Array.isArray(arg1)) {
            const streams = arg1;
            streams.forEach(s => this.rawSubscriptions.add(s));
            this.sendSubscribe(streams);
            return;
        }

        // Overload 2: Symbol/Interval/Callback
        const symbol = arg1;
        const interval = arg2!;
        const callback = arg3!;

        return this.subscribeToCandles(symbol, interval, callback);
    }

    /**
     * Internal implementation for candle subscription
     */
    private async subscribeToCandles(
        symbol: string,
        interval: Interval,
        callback: CandleCallback
    ): Promise<void> {
        const streamKey = this.buildStreamName(symbol, interval);
        const subscription = this.subscriptions.get(streamKey);

        if (subscription) {
            subscription.callbacks.add(callback);
            return;
        }

        // New subscription
        this.subscriptions.set(streamKey, {
            symbol,
            interval,
            callbacks: new Set([callback]),
        });

        // If connected, send subscribe message immediately
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendSubscribe([streamKey]);
        } else if (!this.isConnecting && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
            // If not connected and not connecting, start connection
            // The handleOpen will handle subscribing to all streams in the map
            await this.connect();
        }
        // If connecting, do nothing - handleOpen will pick it up
    }

    /**
     * Add a listener for a symbol's kline stream
     */
    public on(symbol: string, interval: Interval, callback: CandleCallback): void {
        this.subscribe(symbol, interval, callback);
    }

    /**
     * Register a global listener for all kline events
     * 
     * Useful for metrics engines or loggers that need to see all traffic.
     * 
     * @param callback - Function to call with every parsed candle
     * @returns Unsubscribe function
     */
    public onKline(callback: (candle: Candle) => void): () => void {
        this.globalListeners.add(callback);
        return () => {
            this.globalListeners.delete(callback);
        };
    }

    /**
     * Unsubscribe from streams
     * 
     * Overload 1: Raw stream strings
     * Overload 2: Symbol/Interval/Callback helper
     */
    public unsubscribe(streams: string[]): void;
    public unsubscribe(symbol: string, interval: Interval, callback?: CandleCallback): void;
    public unsubscribe(
        arg1: string[] | string,
        arg2?: Interval,
        arg3?: CandleCallback
    ): void {
        // Overload 1: Raw streams
        if (Array.isArray(arg1)) {
            const streams = arg1;
            streams.forEach(s => this.rawSubscriptions.delete(s));
            this.sendUnsubscribe(streams);
            return;
        }

        // Overload 2: Symbol/Interval/Callback
        const symbol = arg1;
        const interval = arg2!;
        const callback = arg3;

        this.unsubscribeFromCandles(symbol, interval, callback);
    }

    /**
     * Internal implementation for candle unsubscription
     */
    private unsubscribeFromCandles(symbol: string, interval: Interval, callback?: CandleCallback): void {
        const streamKey = this.buildStreamName(symbol, interval);
        const subscription = this.subscriptions.get(streamKey);

        if (!subscription) {
            return;
        }

        if (callback) {
            subscription.callbacks.delete(callback);
        }

        // If no more callbacks (or forced unsubscribe), remove subscription
        if (!callback || subscription.callbacks.size === 0) {
            this.subscriptions.delete(streamKey);
            console.log(`[Binance WS] Unsubscribed from ${streamKey}`);

            // Send unsubscribe message if connected
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.sendUnsubscribe([streamKey]);
            }
        }
    }

    /**
     * Remove a listener
     */
    public off(symbol: string, interval: Interval, callback: CandleCallback): void {
        this.unsubscribe(symbol, interval, callback);
    }

    /**
     * Disconnect WebSocket and prevent auto-reconnect
     */
    public disconnect(): void {
        this.shouldReconnect = false;

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        console.log('[Binance WS] Disconnected');
    }

    /**
     * Force reconnection
     */
    public reconnect(): void {
        console.log('[Binance WS] Forcing reconnection...');
        this.disconnect();
        this.shouldReconnect = true; // Re-enable reconnect
        this.connect().catch(console.error);
    }

    /**
     * Close WebSocket connection
     */
    public close(): void {
        this.disconnect();
    }

    /* =============================================
       PRIVATE METHODS
       ============================================= */

    private batchSubscribe(streams: string[]): void {
        const BATCH_SIZE = 50;
        for (let i = 0; i < streams.length; i += BATCH_SIZE) {
            const batch = streams.slice(i, i + BATCH_SIZE);
            this.sendSubscribe(batch);
        }
    }

    private sendSubscribe(streams: string[]): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const message = {
            method: 'SUBSCRIBE',
            params: streams,
            id: Date.now(),
        };

        this.ws.send(JSON.stringify(message));
        console.log(`[Binance WS] Sent SUBSCRIBE for ${streams.join(', ')}`);
    }

    private sendUnsubscribe(streams: string[]): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const message = {
            method: 'UNSUBSCRIBE',
            params: streams,
            id: Date.now(),
        };

        this.ws.send(JSON.stringify(message));
        console.log(`[Binance WS] Sent UNSUBSCRIBE for ${streams.join(', ')}`);
    }

    private handleOpen(): void {
        console.log('[Binance WS] Connection opened');
        this.isConnecting = false;
        this.reconnectAttempts = 0; // Reset on successful connection

        // Update store state
        useZeroLagStore.getState().setWsConnected(true);

        this.startHeartbeat();

        // Subscribe to all pending streams (both managed and raw)
        const managedStreams = Array.from(this.subscriptions.keys());
        const rawStreams = Array.from(this.rawSubscriptions);
        const allStreams = [...new Set([...managedStreams, ...rawStreams])];

        if (allStreams.length > 0) {
            console.log(`[Binance WS] Batch subscribing to ${allStreams.length} streams...`);
            this.batchSubscribe(allStreams);
        }
    }

    private handleMessage(event: MessageEvent): void {
        try {
            const data = JSON.parse(event.data);

            // Update last pong time on any message (acts as heartbeat response)
            this.lastPongTime = Date.now();

            // Handle kline events
            if (data.e === 'kline' && data.k) {
                this.handleKlineEvent(data as BinanceKlineMessage);
            }
        } catch (error) {
            console.error('[Binance WS] Failed to parse message:', error);
        }
    }

    private handleKlineEvent(event: BinanceKlineMessage): void {
        try {
            const candle = parseKlineMessage(event);

            // 1. Notify global listeners
            this.globalListeners.forEach(listener => {
                try {
                    listener(candle);
                } catch (e) {
                    console.error('[Binance WS] Global listener error:', e);
                }
            });

            // 2. Notify specific subscribers
            const streamKey = this.buildStreamName(candle.symbol, candle.interval);
            const subscription = this.subscriptions.get(streamKey);

            if (subscription) {
                subscription.callbacks.forEach(callback => callback(candle));
            }
        } catch (error) {
            console.error('[Binance WS] Error handling kline event:', error);
        }
    }

    private handleError(event: Event): void {
        console.error('[Binance WS] WebSocket error:', event);
    }

    private handleClose(event: CloseEvent): void {
        console.log(
            `[Binance WS] Connection closed (code: ${event.code}, reason: ${event.reason})`
        );

        this.ws = null;
        this.isConnecting = false;
        this.stopHeartbeat();

        // Update store state
        useZeroLagStore.getState().setWsConnected(false);

        // Auto-reconnect if enabled with exponential backoff
        if (this.shouldReconnect && (this.subscriptions.size > 0 || this.rawSubscriptions.size > 0)) {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('[Binance WS] Max reconnection attempts reached');
                return;
            }

            const delay = this.getReconnectDelay();
            this.reconnectAttempts++;
            console.log(
                `[Binance WS] Reconnecting in ${delay / 1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
            );

            this.reconnectTimeout = setTimeout(() => {
                this.connect().catch((error) => {
                    console.error('[Binance WS] Reconnection failed:', error);
                });
            }, delay);
        }
    }
}

/* =============================================
   SINGLETON INSTANCE
   ============================================= */

/** Default WebSocket manager instance */
export const defaultWsManager = new BinanceWebSocketManager();
