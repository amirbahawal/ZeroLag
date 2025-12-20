export class WebSocketHealthMonitor {
    private lastMessageTime = Date.now();
    private reconnectAttempts = 0;
    private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
    private isMonitoring = false;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private readonly HEARTBEAT_INTERVAL = 30000;
    private readonly MAX_BACKOFF = 30000;

    startMonitoring(onReconnect: () => void): void {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.lastMessageTime = Date.now();
        this.reconnectAttempts = 0;
        this.healthCheckTimer = setInterval(() => this.checkHealth(onReconnect), this.HEARTBEAT_INTERVAL);
    }

    stopMonitoring(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        this.isMonitoring = false;
    }

    recordMessage(): void {
        this.lastMessageTime = Date.now();
        this.reconnectAttempts = 0;
    }

    private checkHealth(onReconnect: () => void): void {
        const timeSinceLastMessage = Date.now() - this.lastMessageTime;
        if (timeSinceLastMessage > this.HEARTBEAT_INTERVAL * 2) {
            console.warn(`[WSHealthMonitor] No messages for ${timeSinceLastMessage}ms, reconnecting...`);
            this.reconnect(onReconnect);
        }
    }

    private async reconnect(onReconnect: () => void): Promise<void> {
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            console.error('[WSHealthMonitor] Max reconnection attempts reached');
            this.stopMonitoring();
            return;
        }
        this.reconnectAttempts++;
        const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.MAX_BACKOFF);
        await new Promise(resolve => setTimeout(resolve, backoff));
        try {
            onReconnect();
            this.lastMessageTime = Date.now();
        } catch (error) {
            console.error('[WSHealthMonitor] Reconnection failed:', error);
        }
    }

    reset(): void {
        this.lastMessageTime = Date.now();
        this.reconnectAttempts = 0;
    }

    getStatus() {
        const timeSinceLastMessage = Date.now() - this.lastMessageTime;
        return {
            isMonitoring: this.isMonitoring,
            timeSinceLastMessage,
            reconnectAttempts: this.reconnectAttempts,
            isHealthy: timeSinceLastMessage < this.HEARTBEAT_INTERVAL * 2
        };
    }

    forceReconnect(onReconnect: () => void): void {
        this.reconnectAttempts = 0;
        this.reconnect(onReconnect);
    }
}
