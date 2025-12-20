import { useZeroLagStore } from '../state/useZeroLagStore';

class RateLimitHandler {
    private static instance: RateLimitHandler;
    private backoffMs = 15000;
    private isRateLimited = false;
    private nextRetryTime: number | null = null;

    private constructor() { }

    static getInstance(): RateLimitHandler {
        if (!RateLimitHandler.instance) RateLimitHandler.instance = new RateLimitHandler();
        return RateLimitHandler.instance;
    }

    async executeRequest<T>(requestFn: () => Promise<Response>): Promise<T> {
        if (this.isRateLimited && this.nextRetryTime) {
            const waitTime = this.nextRetryTime - Date.now();
            if (waitTime > 0) await this.wait(waitTime);
        }

        try {
            const response = await requestFn();

            if (response.status === 429) {
                this.handleRateLimit();
                return this.executeRequest(requestFn);
            }

            if (!response.ok) {
                if (response.status >= 500) useZeroLagStore.getState().setApiStatus('error');
                throw new Error(`API Error: ${response.status} - ${await response.text()}`);
            }

            this.resetBackoff();
            const text = await response.text();
            return text ? JSON.parse(text) : {} as T;

        } catch (error) {
            if (error instanceof TypeError && error.message.includes('fetch')) {
                useZeroLagStore.getState().setApiStatus('error');
            }
            throw error;
        }
    }

    private handleRateLimit(): void {
        this.isRateLimited = true;
        useZeroLagStore.getState().setApiStatus('rate_limited');
        this.nextRetryTime = Date.now() + this.backoffMs;
        // Exponential backoff: 15s -> 30s -> 60s -> 120s (cap)
        this.backoffMs = Math.min(this.backoffMs * 2, 120000);
    }

    private resetBackoff(): void {
        this.isRateLimited = false;
        this.backoffMs = 15000;
        this.nextRetryTime = null;

        if (useZeroLagStore.getState().apiStatus !== 'ok') {
            useZeroLagStore.getState().setApiStatus('ok');
        }
    }

    private wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    isCurrentlyRateLimited(): boolean {
        return this.isRateLimited;
    }

    getCurrentBackoffMs(): number {
        return this.backoffMs;
    }
}

export const rateLimitHandler = RateLimitHandler.getInstance();
