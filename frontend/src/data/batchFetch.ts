/**
 * Batch Fetch Utility
 * 
 * Executes async tasks in controlled batches to respect API rate limits.
 * Designed for Binance API calls which have strict rate limiting.
 * 
 * @module data/batchFetch
 */

import { RateLimitError } from './binanceRest';

/**
 * Result of a batch operation
 */
export interface BatchResult<T> {
    /** Successfully completed results */
    results: T[];
    /** Errors encountered during execution */
    errors: Error[];
    /** Whether a rate limit error (429) was detected */
    rateLimited: boolean;
}

/**
 * Options for batch execution
 */
export interface BatchFetchOptions {
    /** Maximum number of concurrent requests per batch. Default: 4 */
    concurrency?: number;
    /** Delay in milliseconds between batches. Default: 0 */
    delayBetweenBatches?: number;
    /** Callback when each batch completes */
    onBatchComplete?: (batchNum: number, totalBatches: number, batchResults: any[]) => void;
    /** Callback when an individual task errors */
    onError?: (error: Error, taskIndex: number) => void;
}

/**
 * Execute async tasks in controlled batches with concurrency limiting.
 * 
 * This function is critical for working with rate-limited APIs like Binance.
 * By processing requests in small batches with controlled concurrency, we:
 * - Avoid hitting API rate limits (429 errors)
 * - Prevent browser connection pool exhaustion
 * - Maintain stable performance across many requests
 * 
 * **Why Concurrency Matters for Binance:**
 * - Binance has IP-based rate limits (e.g., 1200 requests per minute)
 * - Browsers limit concurrent connections per domain (typically 6-8)
 * - Large batches can cause network congestion and timeouts
 * - Controlled batching ensures reliable, predictable behavior
 * 
 * **Enhanced Error Handling:**
 * - Detects RateLimitError (429) and sets flag
 * - Tracks all errors for detailed reporting
 * - Invokes callbacks for monitoring and UI updates
 * 
 * @template T - Type of data returned by each task
 * @param tasks - Array of async functions to execute
 * @param options - Batch execution options
 * @returns Promise resolving to batch result with success/errors/rate limit status
 * 
 * @example
 * ```typescript
 * // Fetch klines for 100 symbols with callbacks
 * const result = await batchFetch(tasks, { 
 *   concurrency: 4,
 *   delayBetweenBatches: 100,
 *   onBatchComplete: (num, total) => {
 *     console.log(`Batch ${num}/${total} complete`);
 *   },
 *   onError: (error, index) => {
 *     console.error(`Task ${index} failed:`, error.message);
 *   }
 * });
 * 
 * if (result.rateLimited) {
 *   console.warn('Rate limit detected! Slowing down...');
 * }
 * ```
 */
export async function batchFetch<T>(
    tasks: Array<() => Promise<T>>,
    options: BatchFetchOptions = {}
): Promise<BatchResult<T>> {
    const {
        concurrency = 4,
        delayBetweenBatches = 0,
        onBatchComplete,
        onError
    } = options;

    const results: T[] = [];
    const errors: Error[] = [];
    let rateLimited = false;
    const totalTasks = tasks.length;
    const totalBatches = Math.ceil(totalTasks / concurrency);

    console.log(
        `[batchFetch] Processing ${totalTasks} tasks in ${totalBatches} batches ` +
        `(${concurrency} concurrent)`
    );

    // Process tasks in batches
    for (let i = 0; i < totalTasks; i += concurrency) {
        const batchStart = i;
        const batchEnd = Math.min(i + concurrency, totalTasks);
        const batch = tasks.slice(batchStart, batchEnd);
        const batchNum = Math.floor(i / concurrency) + 1;

        console.log(
            `[batchFetch] Batch ${batchNum}/${totalBatches} ` +
            `(tasks ${batchStart + 1}-${batchEnd}/${totalTasks})`
        );

        // Execute batch concurrently
        const batchPromises = batch.map(async (task, index) => {
            const taskIndex = batchStart + index;
            try {
                const result = await task();
                return { success: true as const, result, index: taskIndex };
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));

                // Detect rate limit errors (429)
                if (error instanceof RateLimitError || err.message.includes('429')) {
                    rateLimited = true;
                    console.error(
                        `[batchFetch] ⚠ Rate limit detected at task ${taskIndex + 1}`
                    );
                }

                // Invoke error callback if provided
                if (onError) {
                    onError(err, taskIndex);
                }

                errors.push(err);
                console.error(`[batchFetch] Task ${taskIndex + 1} failed:`, err.message);

                return { success: false as const, error: err, index: taskIndex };
            }
        });

        // Wait for entire batch to complete
        const batchResults = await Promise.all(batchPromises);

        // Collect successful results
        for (const item of batchResults) {
            if (item.success) {
                results.push(item.result);
            }
        }

        // Invoke batch complete callback if provided
        if (onBatchComplete) {
            onBatchComplete(batchNum, totalBatches, batchResults);
        }

        // Delay between batches if configured
        if (delayBetweenBatches > 0 && batchEnd < totalTasks) {
            await sleep(delayBetweenBatches);
        }
    }

    const successCount = results.length;
    const failCount = errors.length;

    // Summary logging
    if (rateLimited) {
        console.warn(
            `[batchFetch] ⚠ RATE LIMITED - Completed with ${successCount} succeeded, ` +
            `${failCount} failed`
        );
    } else if (failCount > 0) {
        console.warn(
            `[batchFetch] Completed: ${successCount} succeeded, ${failCount} failed`
        );
    } else {
        console.log(
            `[batchFetch] ✓ All ${successCount} tasks completed successfully`
        );
    }

    return {
        results,
        errors,
        rateLimited
    };
}

/**
 * Sleep utility for adding delays
 * 
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 * 
 * @example
 * ```typescript
 * await sleep(1000); // Wait 1 second
 * ```
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
