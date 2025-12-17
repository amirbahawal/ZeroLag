/**
 * Application-Wide Constants
 * 
 * Central configuration file for all magic numbers and fixed values.
 * Organized by category for easy management and tuning.
 * 
 * @module core/constants
 */

import type { Interval } from './types';

/* =============================================
   NETWORK & API CONFIGURATION
   ============================================= */

/**
 * Maximum parallel API requests to Binance
 * 
 * **Spec Reference:** Section 5.3
 * 
 * **Why 4?**
 * - Binance rate limits are IP-based (1200 req/min typical)
 * - Browser connection pools are limited (6-8 per domain)
 * - Small concurrent count prevents:
 *   * API rate limit errors (429)
 *   * Browser connection exhaustion
 *   * Network congestion and timeouts
 * 
 * **Performance Impact:**
 * - 16 symbols = 4 batches of 4 (total ~2-3 seconds)
 * - Higher values risk rate limits and unstable behavior
 * - Lower values increase load time unnecessarily
 * 
 * @constant
 */
export const MAX_CONCURRENT_REQUESTS = 4;

/**
 * Delay between batches in milliseconds
 * 
 * Adds a small pause between batches to be gentle on the API and
 * reduce risk of rate limiting. Also gives browser time to process
 * incoming data between batches.
 * 
 * **Recommended values:**
 * - 0ms: Maximum speed, slight rate limit risk
 * - 100ms: Good balance (current)
 * - 500ms: Very conservative, slower bootstrap
 * 
 * @constant
 */
export const BATCH_DELAY_MS = 100;

/**
 * Number of historical candles to fetch per interval
 * 
 * These limits ensure we have enough data for metric calculations
 * while staying within Binance's maximum of 1500 candles per request.
 * 
 * **Interval Coverage Examples:**
 * - 1m × 500 = ~8 hours of data
 * - 15m × 500 = ~5 days of data
 * - 1h × 500 = ~21 days of data
 * - 4h × 500 = ~83 days of data
 * 
 * @constant
 */
export const KLINES_FETCH_LIMITS: Record<Interval, number> = {
    '1m': 500,
    '5m': 500,
    '15m': 500,
    '1h': 500,
    '4h': 500,
    '1d': 500,
};

/**
 * Initial klines to fetch during bootstrap
 * 
 * **Spec Reference:** Section 5.3
 * Quote: "Call /fapi/v1/klines with limit = 120"
 * 
 * Uses a smaller limit during initialization for faster startup.
 * After bootstrap, individual chart components may fetch more data
 * as needed using KLINES_FETCH_LIMITS.
 * 
 * **Why 120?**
 * - For 1h interval: 120 candles = 5 days of data
 * - Sufficient for initial metrics calculation
 * - Faster initial load (120 vs 500 candles per symbol)
 * - Reduces bootstrap time for 16+ symbols
 * 
 * @constant
 */
export const BOOTSTRAP_KLINES_LIMIT = 120;

/* =============================================
   WEBSOCKET CONFIGURATION
   ============================================= */

/**
 * WebSocket heartbeat interval in milliseconds
 * 
 * How often to send ping messages to detect stale connections.
 * 
 * @constant
 */
export const WS_HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

/**
 * Maximum WebSocket reconnection attempts
 * 
 * After this many failed reconnection attempts, stop trying.
 * 
 * @constant
 */
export const WS_MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Base WebSocket reconnection delay in milliseconds
 * 
 * Initial delay before first reconnection attempt.
 * Uses exponential backoff: delay = base * 2^attempt
 * 
 * @constant
 */
export const WS_BASE_RECONNECT_DELAY_MS = 1000; // 1 second

/**
 * Maximum WebSocket reconnection delay in milliseconds
 * 
 * Cap on exponential backoff to prevent excessive wait times.
 * 
 * @constant
 */
export const WS_MAX_RECONNECT_DELAY_MS = 30000; // 30 seconds

/* =============================================
   UI CONFIGURATION
   ============================================= */

/**
 * Default number of symbols to display in grid
 * 
 * @constant
 */
export const DEFAULT_SYMBOL_COUNT = 16;

/**
 * Default grid layout (4x4)
 * 
 * @constant
 */
export const DEFAULT_GRID_SIZE = 4;

/**
 * Default candlestick interval
 * 
 * @constant
 */
export const DEFAULT_INTERVAL: Interval = '1h';

/**
 * Default sort mode
 * 
 * @constant
 */
export const DEFAULT_SORT_MODE = 'volume_24h';

/* =============================================
   CACHE CONFIGURATION
   ============================================= */

/**
 * Maximum number of candles to store per symbol/interval
 * 
 * Limits memory usage while keeping enough data for calculations.
 * 
 * @constant
 */
export const MAX_CACHED_CANDLES = 500;

/**
 * Timeout for "no data" warning in milliseconds
 * 
 * How long to wait before showing a warning that data hasn't arrived.
 * 
 * @constant
 */
export const NO_DATA_TIMEOUT_MS = 5000; // 5 seconds

/* =============================================
   ENGINE CONFIGURATION
   ============================================= */

/**
 * Engine periodic update interval in milliseconds
 * 
 * How often the engine refreshes tickers and recomputes rankings.
 * 
 * @constant
 */
export const ENGINE_UPDATE_INTERVAL_MS = 30000; // 30 seconds
