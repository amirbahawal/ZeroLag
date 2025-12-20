import { useZeroLagStore } from '../state/useZeroLagStore';

class RateLimitHandler {
    private static instance: RateLimitHandler;
    private backoffMs = 15000; // Start at 15 seconds
    private isRateLimited = false;
    private nextRetryTime: number | null = null;

    private constructor() { }

    static getInstance(): RateLimitHandler {
        if (!RateLimitHandler.instance) {
            RateLimitHandler.instance = new RateLimitHandler();
        }
        return RateLimitHandler.instance;
    }

    async executeRequest<T>(requestFn: () => Promise<Response>): Promise<T> {
        // If rate limited, wait until backoff period is over
        if (this.isRateLimited && this.nextRetryTime) {
            const waitTime = this.nextRetryTime - Date.now();
            if (waitTime > 0) {
                console.log(`[RateLimit] Waiting ${Math.ceil(waitTime / 1000)}s before retry...`);
                await this.wait(waitTime);
            }
        }

        try {
            const response = await requestFn();

            // Check for rate limiting
            if (response.status === 429) {
                this.handleRateLimit();
                // Retry recursively after handling rate limit
                return this.executeRequest(requestFn);
            }

            // Check for other errors
            if (!response.ok) {
                // Only set error status for 5xx or network issues, not 4xx (client errors)
                if (response.status >= 500) {
                    useZeroLagStore.getState().setApiStatus('error');
                }
                const errorText = await response.text();
                throw new Error(`API Error: ${response.status} - ${errorText}`);
            }

            // Success - reset backoff and status
            this.resetBackoff();

            // Handle 204 No Content or empty responses if necessary, otherwise parse JSON
            const text = await response.text();
            return text ? JSON.parse(text) : {} as T;

        } catch (error) {
            // Handle network errors
            if (error instanceof TypeError && error.message.includes('fetch')) {
                useZeroLagStore.getState().setApiStatus('error');
            }
            throw error;
        }
    }

    private handleRateLimit(): void {
        this.isRateLimited = true;
        useZeroLagStore.getState().setApiStatus('rate_limited');

        // Set next retry time
        this.nextRetryTime = Date.now() + this.backoffMs;

        console.log(`[RateLimit] Rate limited. Next retry in ${this.backoffMs / 1000}s`);

        // SPEC: Exponential backoff 15s->120s to satisfy rate-limit handling
        this.backoffMs = Math.min(this.backoffMs * 2, 120000);
    }

    private resetBackoff(): void {
        if (this.isRateLimited) {
            console.log('[RateLimit] Rate limit cleared');
        }
        this.isRateLimited = false;
        this.backoffMs = 15000;
        this.nextRetryTime = null;

        // Only reset to 'ok' if we were in a non-ok state
        const currentStatus = useZeroLagStore.getState().apiStatus;
        if (currentStatus !== 'ok') {
            useZeroLagStore.getState().setApiStatus('ok');
        }
    }

    private wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Public method to check if currently rate limited
    isCurrentlyRateLimited(): boolean {
        return this.isRateLimited;
    }

    // Public method to get current backoff time
    getCurrentBackoffMs(): number {
        return this.backoffMs;
    }
}

export const rateLimitHandler = RateLimitHandler.getInstance();
