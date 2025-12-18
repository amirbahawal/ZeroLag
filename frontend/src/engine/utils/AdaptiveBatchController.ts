/**
 * Adaptive Batch Controller
 * 
 * Dynamically adjusts batch size based on success rate.
 * Optimizes API throughput while avoiding rate limits.
 */

export class AdaptiveBatchController {
    private currentBatchSize: number;
    private successRate = 1.0;
    private readonly SMOOTHING_FACTOR = 0.9;

    private readonly MIN_BATCH: number;
    private readonly MAX_BATCH: number;

    constructor(
        minBatch: number = 2,
        maxBatch: number = 8,
        initialBatchSize: number = 4
    ) {
        this.MIN_BATCH = minBatch;
        this.MAX_BATCH = maxBatch;
        this.currentBatchSize = initialBatchSize;
    }

    /**
     * Adjust batch size based on operation success
     * @param success - Whether the last batch succeeded
     */
    adjustBatchSize(success: boolean): void {
        // Exponential moving average of success rate
        if (success) {
            this.successRate = this.successRate * this.SMOOTHING_FACTOR + (1 - this.SMOOTHING_FACTOR);
        } else {
            this.successRate = this.successRate * this.SMOOTHING_FACTOR;
        }

        // Increase batch size if success rate is high
        if (this.successRate > 0.95 && this.currentBatchSize < this.MAX_BATCH) {
            this.currentBatchSize++;
        }

        // Decrease batch size if success rate is low
        if (this.successRate < 0.8 && this.currentBatchSize > this.MIN_BATCH) {
            this.currentBatchSize--;
        }
    }

    /**
     * Get current batch size
     */
    getBatchSize(): number {
        return this.currentBatchSize;
    }

    /**
     * Get current success rate
     */
    getSuccessRate(): number {
        return this.successRate;
    }

    /**
     * Reset to initial state
     */
    reset(): void {
        this.currentBatchSize = 4;
        this.successRate = 1.0;
    }
}
