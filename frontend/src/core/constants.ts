import type { Interval } from './types';

export const MAX_CONCURRENT_REQUESTS = 4;
export const BATCH_DELAY_MS = 100;

export const KLINES_FETCH_LIMITS: Record<Interval, number> = {
   '1m': 500, '5m': 500, '15m': 500, '1h': 500, '4h': 500, '1d': 500,
};

export const BOOTSTRAP_KLINES_LIMIT = 120;

export const WS_HEARTBEAT_INTERVAL_MS = 30000;
export const WS_MAX_RECONNECT_ATTEMPTS = 10;
export const WS_BASE_RECONNECT_DELAY_MS = 1000;
export const WS_MAX_RECONNECT_DELAY_MS = 30000;

export const DEFAULT_SYMBOL_COUNT = 16;
export const DEFAULT_GRID_SIZE = 4;
export const DEFAULT_INTERVAL: Interval = '1h';
export const DEFAULT_SORT_MODE = 'volume_24h';

export const MAX_CACHED_CANDLES = 500;
export const NO_DATA_TIMEOUT_MS = 5000;

export const ENGINE_UPDATE_INTERVAL_MS = 30000;
