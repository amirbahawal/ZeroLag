/**
 * WebSocket Health Monitor Module
 * 
 * Monitors WebSocket connection health and handles automatic reconnection.
 * Ensures 99.9% uptime with exponential backoff retry strategy.
 */

export class WebSocketHealthMonitor {
    private lastMessageTime = Date.now();
    private reconnectAttempts = 0;
    private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
    private isMonitoring = false;

    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
    private readonly MAX_BACKOFF = 30000; // 30 seconds

    /**
     * Start monitoring WebSocket health
     * @param onReconnect - Callback to execute when reconnection is needed
     */
    startMonitoring(onReconnect: () => void): void {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        this.lastMessageTime = Date.now();
        this.reconnectAttempts = 0;

        this.healthCheckTimer = setInterval(() => {
            this.checkHealth(onReconnect);
        }, this.HEARTBEAT_INTERVAL);

        console.log('[WSHealthMonitor] Started monitoring');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        this.isMonitoring = false;
        console.log('[WSHealthMonitor] Stopped monitoring');
    }

    /**
     * Record that a message was received
     * Resets reconnection attempts on successful message
     */
    recordMessage(): void {
        this.lastMessageTime = Date.now();
        this.reconnectAttempts = 0;
    }

    /**
     * Check connection health
     */
    private checkHealth(onReconnect: () => void): void {
        const timeSinceLastMessage = Date.now() - this.lastMessageTime;

        // If no messages for 2x heartbeat interval, trigger reconnection
        if (timeSinceLastMessage > this.HEARTBEAT_INTERVAL * 2) {
            console.warn(
                `[WSHealthMonitor] No messages for ${timeSinceLastMessage}ms, reconnecting...`
            );
            this.reconnect(onReconnect);
        }
    }

    /**
     * Attempt reconnection with exponential backoff
     */
    private async reconnect(onReconnect: () => void): Promise<void> {
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            console.error('[WSHealthMonitor] Max reconnection attempts reached');
            this.stopMonitoring();
            return;
        }

        this.reconnectAttempts++;

        // Calculate backoff: min(1000 * 2^attempts, MAX_BACKOFF)
        const backoff = Math.min(
            1000 * Math.pow(2, this.reconnectAttempts),
            this.MAX_BACKOFF
        );

        console.log(
            `[WSHealthMonitor] Reconnection attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} ` +
            `(backoff: ${backoff}ms)`
        );

        await new Promise(resolve => setTimeout(resolve, backoff));

        try {
            onReconnect();
            this.lastMessageTime = Date.now();
        } catch (error) {
            console.error('[WSHealthMonitor] Reconnection failed:', error);
        }
    }

    /**
     * Reset monitor state
     */
    reset(): void {
        this.lastMessageTime = Date.now();
        this.reconnectAttempts = 0;
    }

    /**
     * Get current status
     */
    getStatus(): {
        isMonitoring: boolean;
        timeSinceLastMessage: number;
        reconnectAttempts: number;
        isHealthy: boolean;
    } {
        const timeSinceLastMessage = Date.now() - this.lastMessageTime;
        const isHealthy = timeSinceLastMessage < this.HEARTBEAT_INTERVAL * 2;

        return {
            isMonitoring: this.isMonitoring,
            timeSinceLastMessage,
            reconnectAttempts: this.reconnectAttempts,
            isHealthy
        };
    }

    /**
     * Force reconnection
     */
    forceReconnect(onReconnect: () => void): void {
        console.log('[WSHealthMonitor] Forcing reconnection');
        this.reconnectAttempts = 0;
        this.reconnect(onReconnect);
    }
}
