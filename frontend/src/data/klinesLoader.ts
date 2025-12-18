/**
 * Klines Loader Utility
 * 
 * High-level API for batch-loading historical klines data for multiple symbols.
 * Used primarily during engine initialization to fetch chart data.
 * 
 * Implements spec section 4.3 rate limiting requirements.
 * 
 * @module data/klinesLoader
 */

import type { ClientBinanceProvider } from './clientProvider';
import type { CandleCache } from './candleCache';
import { batchFetch, sleep } from './batchFetch';
import { setApiStatus } from './apiStatus';
import type { Interval } from '../core/types';
import type { BatchResult } from './batchFetch';

/**
 * Options for loading klines
 */
export interface LoadKlinesOptions {
    /** Maximum concurrent requests. Default: 4 */
    concurrency?: number;
    /** Delay between batches in milliseconds. Default: 0 */
    delayBetweenBatches?: number;
}

/**
 * Enhanced result of loadKlinesForSymbols operation
 */
export interface LoadKlinesResult {
    /** Number of symbols successfully loaded */
    loaded: number;
    /** Number of symbols that failed to load */
    failed: number;
    /** Whether rate limiting was detected */
    rateLimited: boolean;
    /** Array of successfully loaded symbol names */
    successSymbols: string[];
    /** Array of symbols that failed to load */
    failedSymbols: string[];
}

/**
 * Load historical klines for multiple symbols with concurrency limiting.
 * 
 * This is the primary function used by ClientEngine during bootstrap to
 * fetch initial chart data for all tracked symbols. It handles:
 * - Batch processing with configurable concurrency (default: 4)
 * - Automatic parsing and caching of results
 * - Progress logging for monitoring
 * - Graceful error handling (partial results on failure)
 * - Rate limit detection and automatic retry
 * - API status tracking per spec section 4.3
 * 
 * **Process:**
 * 1. Creates fetch tasks for each symbol
 * 2. Executes in batches using batchFetch utility
 * 3. Detects rate limiting (429 errors)
 * 4. Retries failed symbols with increased delay
 * 5. Parses raw klines to Candle objects
 * 6. Stores results in cache
 * 7. Returns detailed summary with success/failure/rate limit status
 * 
 * **Rate Limit Handling (Spec 4.3):**
 * - Automatically detects 429 errors
 * - Sets global apiStatus = 'rate_limited'
 * - Increases delay between batches to 500ms
 * - Retries failed symbols after 5-second cooldown
 * - Returns clear status for UI warnings
 * 
 * @param symbols - Array of trading symbols to load (e.g., ['BTCUSDT', 'ETHUSDT'])
 * @param interval - Candlestick interval (e.g., '1h')
 * @param limit - Number of candles to fetch per symbol
 * @param provider - Binance API provider instance
 * @param cache - Candle cache instance for storing results
 * @param options - Optional concurrency and delay settings
 * @returns Enhanced summary with success/failure/rate limit information
 * 
 * @example
 * ```typescript
 * // In ClientEngine.fetchHistoricalKlines()
 * const result = await loadKlinesForSymbols(
 *   this.activeSymbols,
 *   this.store.interval,
 *   50,
 *   this.provider,
 *   this.candleCache,
 *   { concurrency: 4, delayBetweenBatches: 100 }
 * );
 * 
 * if (result.rateLimited) {
 *   console.warn('API rate limit hit. Consider showing warning banner.');
 * }
 * 
 * console.log(`Loaded ${result.loaded}/${result.loaded + result.failed} symbols`);
 * ```
 */
export async function loadKlinesForSymbols(
    symbols: string[],
    interval: Interval,
    limit: number,
    provider: ClientBinanceProvider,
    cache: CandleCache,
    options: LoadKlinesOptions = {}
): Promise<LoadKlinesResult> {
    let { concurrency = 4, delayBetweenBatches = 0 } = options;
    const totalSymbols = symbols.length;
    const totalBatches = Math.ceil(totalSymbols / concurrency);

    console.log(
        `[klinesLoader] Loading klines for ${totalSymbols} symbols ` +
        `(${concurrency} concurrent, ${interval} interval, ${totalBatches} batches)...`
    );

    // Create tasks for each symbol
    const createTask = (symbol: string) => async (): Promise<string> => {
        // Fetch klines from API
        const rawKlines = await provider.getKlines(symbol, interval, limit);

        // Parse to Candle objects
        const candles = provider.parseKlinesToCandles(symbol, interval, rawKlines as any);

        // Store in cache
        cache.setCandlesForSymbol(symbol, interval, candles);

        // Return symbol name on success
        return symbol;
    };

    let tasks = symbols.map(createTask);

    // First attempt with provided settings
    let result: BatchResult<string> = await batchFetch(tasks, {
        concurrency,
        delayBetweenBatches,
        onBatchComplete: (num, total) => {
            console.log(`[klinesLoader] Batch ${num}/${total} complete`);
        }
    });

    // Handle rate limiting
    if (result.rateLimited) {
        console.warn(
            '[ZeroLag] ⚠ Binance API rate limit detected. Slowing down requests...'
        );

        // Set global API status flag (spec section 4.3)
        setApiStatus('rate_limited');

        // Increase delay for future requests
        delayBetweenBatches = 500;

        // Identify failed symbols
        const successSet = new Set(result.results);
        const failedSymbols = symbols.filter(s => !successSet.has(s));

        if (failedSymbols.length > 0) {
            console.log(
                `[klinesLoader] Retrying ${failedSymbols.length} failed symbols ` +
                `after 5-second cooldown...`
            );

            // Wait 5 seconds before retry
            await sleep(5000);

            // Retry failed symbols with increased delay
            const retryTasks = failedSymbols.map(createTask);
            const retryResult = await batchFetch(retryTasks, {
                concurrency,
                delayBetweenBatches: 500, // Slower on retry
                onBatchComplete: (num, total) => {
                    console.log(`[klinesLoader] Retry batch ${num}/${total} complete`);
                }
            });

            // Merge retry results
            result.results.push(...retryResult.results);

            // Only keep errors that failed on retry too
            const retrySuccessSet = new Set(retryResult.results);
            const stillFailed = failedSymbols.filter(s => !retrySuccessSet.has(s));

            if (retryResult.rateLimited && stillFailed.length > 0) {
                console.error(
                    `[klinesLoader] Still rate limited after retry. ` +
                    `${stillFailed.length} symbols permanently failed this session.`
                );
            } else if (retryResult.results.length > 0) {
                console.log(
                    `[klinesLoader] ✓ Retry succeeded for ${retryResult.results.length} symbols`
                );
                // Reset API status if retry worked
                setApiStatus('ok');
            }
        }
    }

    // Build final result
    const successSymbols = Array.from(new Set(result.results)); // dedupe
    const failedSymbols = symbols.filter(s => !successSymbols.includes(s));
    const loaded = successSymbols.length;
    const failed = failedSymbols.length;

    // Final summary
    if (result.rateLimited) {
        console.warn(
            `[klinesLoader] ⚠ Completed with rate limiting: ` +
            `${loaded}/${totalSymbols} loaded, ${failed} failed`
        );
    } else if (failed === 0) {
        console.log(
            `[klinesLoader] ✓ All ${loaded} symbols loaded successfully`
        );
    } else {
        console.log(
            `[klinesLoader] Loaded ${loaded}/${totalSymbols} symbols ` +
            `(${failed} failed)`
        );
    }

    return {
        loaded,
        failed,
        rateLimited: result.rateLimited,
        successSymbols,
        failedSymbols
    };
}
