/**
 * Performance Monitor
 * 
 * Tracks operation durations and provides statistical analysis.
 * Essential for identifying bottlenecks and monitoring performance.
 */

interface PerformanceStats {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
    count: number;
}

export class PerformanceMonitor {
    private metrics = new Map<string, number[]>();
    private readonly MAX_SAMPLES = 100;

    /**
     * Measure synchronous operation
     */
    measure<T>(name: string, fn: () => T): T {
        const start = performance.now();
        try {
            return fn();
        } finally {
            const duration = performance.now() - start;
            this.record(name, duration);
        }
    }

    /**
     * Measure asynchronous operation
     */
    async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const start = performance.now();
        try {
            return await fn();
        } finally {
            const duration = performance.now() - start;
            this.record(name, duration);
        }
    }

    /**
     * Manually record a duration
     */
    record(name: string, duration: number): void {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }

        const values = this.metrics.get(name)!;
        values.push(duration);

        // Keep only last N measurements
        if (values.length > this.MAX_SAMPLES) {
            values.shift();
        }
    }

    /**
     * Get statistics for a specific metric
     */
    getStats(name: string): PerformanceStats | null {
        const values = this.metrics.get(name);
        if (!values || values.length === 0) return null;

        const sorted = [...values].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((a, b) => a + b, 0);

        return {
            avg: sum / count,
            min: sorted[0],
            max: sorted[count - 1],
            p50: sorted[Math.floor(count * 0.50)],
            p95: sorted[Math.floor(count * 0.95)],
            p99: sorted[Math.floor(count * 0.99)],
            count
        };
    }

    /**
     * Get all statistics
     */
    getAllStats(): Record<string, PerformanceStats | null> {
        const result: Record<string, PerformanceStats | null> = {};
        for (const [name, _] of this.metrics) {
            result[name] = this.getStats(name);
        }
        return result;
    }

    /**
     * Clear all metrics
     */
    clear(): void {
        this.metrics.clear();
    }

    /**
     * Clear specific metric
     */
    clearMetric(name: string): void {
        this.metrics.delete(name);
    }

    /**
     * Get metric names
     */
    getMetricNames(): string[] {
        return Array.from(this.metrics.keys());
    }

    /**
     * Export as JSON
     */
    export(): string {
        return JSON.stringify(this.getAllStats(), null, 2);
    }
}
