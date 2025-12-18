/**
 * Priority Fetch Queue
 * 
 * Manages symbol fetching with priority-based ordering.
 * Ensures visible and new symbols are fetched first.
 */

interface FetchTask {
    symbol: string;
    priority: number;
    timestamp: number;
}

export class PriorityFetchQueue {
    private queue: FetchTask[] = [];

    /**
     * Add symbol to fetch queue with priority
     * 
     * @param symbol - Trading symbol
     * @param isVisible - Whether symbol is currently visible in UI
     * @param isNew - Whether symbol just entered active set
     */
    add(symbol: string, isVisible: boolean = false, isNew: boolean = false): void {
        // Calculate priority
        let priority = 0;
        if (isVisible) priority += 100;  // Highest priority for visible symbols
        if (isNew) priority += 50;        // High priority for new symbols

        this.queue.push({
            symbol,
            priority,
            timestamp: Date.now()
        });

        // Sort by priority (descending), then by timestamp (ascending)
        this.queue.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            return a.timestamp - b.timestamp;
        });
    }

    /**
     * Add multiple symbols at once
     */
    addBatch(symbols: string[], isVisible: boolean = false, isNew: boolean = false): void {
        for (const symbol of symbols) {
            this.add(symbol, isVisible, isNew);
        }
    }

    /**
     * Get next N symbols to fetch
     * Removes them from the queue
     */
    getNext(count: number): string[] {
        const tasks = this.queue.splice(0, count);
        return tasks.map(t => t.symbol);
    }

    /**
     * Peek at next N symbols without removing
     */
    peekNext(count: number): string[] {
        return this.queue.slice(0, count).map(t => t.symbol);
    }

    /**
     * Get queue size
     */
    get size(): number {
        return this.queue.length;
    }

    /**
     * Check if queue is empty
     */
    get isEmpty(): boolean {
        return this.queue.length === 0;
    }

    /**
     * Clear the queue
     */
    clear(): void {
        this.queue = [];
    }

    /**
     * Remove specific symbol from queue
     */
    remove(symbol: string): boolean {
        const index = this.queue.findIndex(t => t.symbol === symbol);
        if (index !== -1) {
            this.queue.splice(index, 1);
            return true;
        }
        return false;
    }
}
