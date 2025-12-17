/**
 * Binance Futures WebSocket Manager
 * 
 * Manages WebSocket connections to Binance Futures for real-time candle updates.
 * Handles subscriptions, auto-reconnection, and message parsing.
 */

import type { Interval, Candle } from '../core/types';

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

/** Binance WebSocket kline event structure */
interface BinanceKlineEvent {
    e: string; // Event type
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

/* =============================================
   BINANCE WEBSOCKET MANAGER
   ============================================= */

export class BinanceWsManager {
    private ws: WebSocket | null = null;
    private baseUrl = 'wss://fstream.binance.com/ws';
    private subscriptions = new Map<StreamKey, Subscription>();
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private baseReconnectDelay = 1000; // Start at 1 second
    private maxReconnectDelay = 30000; // Max 30 seconds
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

        try {
            // Connect to base endpoint
            // We will subscribe to actual streams via messages
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
     * Subscribe to a symbol's kline stream
     */
    public async subscribe(
        symbol: string,
        interval: Interval,
        callback: CandleCallback
    ): Promise<void> {
        const streamKey = this.getStreamKey(symbol, interval);
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
        this.subscribe(symbol, interval, callback).catch(console.error);
    }

    /**
     * Unsubscribe from a symbol's kline stream
     */
    public unsubscribe(symbol: string, interval: Interval, callback?: CandleCallback): void {
        const streamKey = this.getStreamKey(symbol, interval);
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
     * Disconnect WebSocket
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

    /* =============================================
       PRIVATE METHODS
       ============================================= */

    private getStreamKey(symbol: string, interval: Interval): StreamKey {
        return `${symbol.toLowerCase()}@kline_${interval}`;
    }

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
        this.startHeartbeat();

        // Subscribe to all pending streams
        const streams = Array.from(this.subscriptions.keys());
        if (streams.length > 0) {
            console.log(`[Binance WS] Batch subscribing to ${streams.length} streams...`);
            this.batchSubscribe(streams);
        }
    }

    private handleMessage(event: MessageEvent): void {
        try {
            const data = JSON.parse(event.data);

            // Update last pong time on any message (acts as heartbeat response)
            this.lastPongTime = Date.now();

            // Handle kline events
            if (data.e === 'kline' || data.k) {
                this.handleKlineEvent(data);
            }
        } catch (error) {
            console.error('[Binance WS] Failed to parse message:', error);
        }
    }

    private handleKlineEvent(event: BinanceKlineEvent): void {
        const kline = event.k;
        const streamKey = this.getStreamKey(kline.s, kline.i as Interval);
        const subscription = this.subscriptions.get(streamKey);

        if (!subscription) {
            return; // No subscription for this stream
        }

        // Convert to our Candle type
        const candle: Candle = {
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

        // Notify all callbacks
        subscription.callbacks.forEach(callback => callback(candle));
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

        // Auto-reconnect if enabled with exponential backoff
        if (this.shouldReconnect && this.subscriptions.size > 0) {
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
export const defaultWsManager = new BinanceWsManager();
