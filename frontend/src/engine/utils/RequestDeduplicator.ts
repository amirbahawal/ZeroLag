/**
 * Request Deduplicator
 * 
 * Prevents duplicate concurrent requests for the same resource.
 * Essential for avoiding redundant API calls during parallel operations.
 */

export class RequestDeduplicator {
    private pendingRequests = new Map<string, Promise<any>>();

    /**
     * Execute a request with deduplication
     * If the same request is already pending, return the existing promise
     * 
     * @param key - Unique identifier for the request
     * @param fetcher - Function that performs the actual fetch
     * @returns Promise with the result
     */
    async fetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
        // Return existing promise if request is already pending
        if (this.pendingRequests.has(key)) {
            return this.pendingRequests.get(key) as Promise<T>;
        }

        // Create new request
        const promise = fetcher().finally(() => {
            // Clean up after completion
            this.pendingRequests.delete(key);
        });

        this.pendingRequests.set(key, promise);
        return promise;
    }

    /**
     * Check if a request is currently pending
     */
    isPending(key: string): boolean {
        return this.pendingRequests.has(key);
    }

    /**
     * Get number of pending requests
     */
    getPendingCount(): number {
        return this.pendingRequests.size;
    }

    /**
     * Clear all pending requests
     */
    clear(): void {
        this.pendingRequests.clear();
    }
}
