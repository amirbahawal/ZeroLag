/**
 * Ring Buffer Implementation
 * 
 * Fixed-capacity circular buffer with O(1) push operations.
 * Eliminates memory churn from array resizing and shifting.
 */
export class RingBuffer<T> {
    private buffer: T[];
    private capacity: number;
    private head: number = 0;
    private tail: number = 0;
    private size: number = 0;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.buffer = new Array<T>(capacity);
    }

    push(item: T): void {
        this.buffer[this.tail] = item;
        this.tail = (this.tail + 1) % this.capacity;

        if (this.size < this.capacity) {
            this.size++;
        } else {
            this.head = (this.head + 1) % this.capacity;
        }
    }

    /**
     * Convert buffer to array
     * Returns items in chronological order
     */
    toArray(): T[] {
        const result: T[] = [];
        for (let i = 0; i < this.size; i++) {
            result.push(this.buffer[(this.head + i) % this.capacity]);
        }
        return result;
    }

    /**
     * Get item at index (0 = oldest)
     */
    get(index: number): T | undefined {
        if (index < 0 || index >= this.size) return undefined;
        return this.buffer[(this.head + index) % this.capacity];
    }

    /**
     * Get last item (most recent)
     */
    getLast(): T | undefined {
        if (this.size === 0) return undefined;
        const lastIndex = (this.tail - 1 + this.capacity) % this.capacity;
        return this.buffer[lastIndex];
    }

    /**
     * Clear all items
     */
    clear(): void {
        this.head = 0;
        this.tail = 0;
        this.size = 0;
    }

    /**
     * Current number of items
     */
    get length(): number {
        return this.size;
    }

    /**
     * Check if buffer is full
     */
    get isFull(): boolean {
        return this.size === this.capacity;
    }

    /**
     * Check if buffer is empty
     */
    get isEmpty(): boolean {
        return this.size === 0;
    }
}
