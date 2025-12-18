/**
 * Circuit Breaker
 * 
 * Prevents cascading failures by temporarily blocking operations
 * that are repeatedly failing.
 */

export class CircuitBreaker {
    private failureCount = 0;
    private lastFailureTime = 0;
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private successCount = 0;
    private threshold: number;
    private timeout: number;
    private halfOpenSuccessThreshold: number;

    constructor(
        threshold: number = 5,
        timeout: number = 60000, // 1 minute
        halfOpenSuccessThreshold: number = 2
    ) {
        this.threshold = threshold;
        this.timeout = timeout;
        this.halfOpenSuccessThreshold = halfOpenSuccessThreshold;
    }

    /**
     * Execute operation with circuit breaker protection
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        // Check if circuit should transition from OPEN to HALF_OPEN
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
            } else {
                throw new Error(`Circuit breaker is OPEN (${this.failureCount} failures)`);
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.halfOpenSuccessThreshold) {
                this.reset();
            }
        } else {
            this.failureCount = 0;
        }
    }

    private onFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF_OPEN') {
            // Immediately reopen circuit on failure in half-open state
            this.state = 'OPEN';
        } else if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
        }
    }

    /**
     * Reset circuit breaker to initial state
     */
    reset(): void {
        this.failureCount = 0;
        this.successCount = 0;
        this.state = 'CLOSED';
    }

    /**
     * Get current state
     */
    getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
        return this.state;
    }

    /**
     * Get failure count
     */
    getFailureCount(): number {
        return this.failureCount;
    }

    /**
     * Check if circuit is open
     */
    isOpen(): boolean {
        return this.state === 'OPEN';
    }
}
