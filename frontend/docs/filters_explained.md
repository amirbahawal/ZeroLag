# ZeroLag Filter & Ranking Algorithms

This document explains how ZeroLag calculates metrics, filters symbols, and ranks them in real-time.

## 1. Data Sources

ZeroLag uses a hybrid approach to fetch data from Binance:

1. **24h Ticker Data (REST API)**:
    - Fetched initially to populate the list of all active USDT Perpetual Futures.
    - Provides baseline 24h stats: `High Price`, `Low Price`, `Volume (24h)`, `Price Change %`.
    - **Update Frequency**: On page load and periodic refresh.

2. **Historical Klines (REST API)**:
    - Fetches historical candlestick data (Open, High, Low, Close, Volume) for granular calculations.
    - **Intervals**: Fetches data required for 5m, 15m, 1h, and 4h windows.
    - **Optimization**: Fetched in parallel batches to minimize load time.

3. **Real-time Stream (WebSocket)**:
    - Subscribes to live updates for all visible symbols.
    - Updates the latest candle in real-time.
    - **Trigger**: Every tick updates the metrics and potentially changes the ranking.

---

## 2. Metric Calculations

All metrics are calculated in `src/core/metrics.ts` using pure functions to ensure accuracy and testability.

### A. Range Filters (Volatility)

**Goal**: Identify symbols with the highest volatility within a specific timeframe.

- **Windows**: 5m, 15m, 1h, 4h.
- **Formula**:

    ```typescript
    Range % = ((Highest Price - Lowest Price) / Lowest Price) * 100
    ```

- **Logic**:
    1. Collect all candles within the time window (e.g., last 1 hour).
    2. Find the absolute `Max High` and `Min Low` among them.
    3. Calculate the percentage difference relative to the low.
- **Ranking**: Descending (Higher % = Higher Rank).

### B. Volume Filters (Liquidity)

**Goal**: Identify symbols with the most trading activity.

- **Windows**: 15m, 24h.
- **Formula**:

    ```typescript
    Total Volume = Sum(Quote Volume of all candles in window)
    ```

- **Logic**:
    1. Sum the `quoteVolume` (USDT value) of all candles in the window.
    2. If `quoteVolume` is missing (rare), estimate as `Close Price * Base Volume`.
- **Ranking**: Descending (Higher Volume = Higher Rank).

### C. Growth (Volume Surge)

**Goal**: Detect sudden spikes in trading activity compared to the recent average.

- **Formula**:

    ```typescript
    Baseline = (Volume Last 4 Hours) / 16  // Average volume per 15m block
    Ratio = (Volume Last 15 Minutes) / Baseline
    ```

- **Logic**:
    1. Calculate the average 15-minute volume over the last 4 hours (Baseline).
    2. Compare the *current* 15-minute volume to this baseline.
    3. A ratio > 1.0 means volume is higher than average. A ratio of 3.0 means 3x normal volume.
- **Ranking**: Descending (Higher Ratio = Higher Rank).

### D. Daily Extremum (Dext)

**Goal**: Identify symbols trading closest to their 24h High or Low (potential breakouts or reversals).

- **Formula**:

    ```typescript
    DistToHigh = ((High24h - CurrentPrice) / High24h) * 100
    DistToLow  = ((CurrentPrice - Low24h) / Low24h) * 100
    Score      = Min(DistToHigh, DistToLow)
    ```

- **Logic**:
    1. Calculate how far the price is from the 24h High (in %).
    2. Calculate how far the price is from the 24h Low (in %).
    3. Take the *smaller* of the two distances.
- **Ranking**: **Ascending** (Lower Score = Closer to Extremum = Higher Rank).
  - Rank #1 is the symbol closest to breaking its 24h High or Low.

---

## 3. Ranking & Pagination

1. **Scoring**: Every symbol is assigned a `sortScore` based on the selected filter (e.g., if "Range 1h" is selected, score = Range 1h %).
2. **Sorting**: The entire list of 200+ symbols is sorted based on this score.
    - Most filters sort **Descending** (High to Low).
    - Dext sorts **Ascending** (Low to High).
3. **Filtering**:
    - **Search**: If a search query exists (e.g., "BTC"), only matching symbols are kept.
    - **USDT Only**: Only symbols ending in `USDT` are processed.
4. **Pagination**:
    - The sorted list is sliced based on the current page and count (e.g., Page 1, Count 16 = Indices 0-15).
    - Only the visible symbols subscribe to high-frequency WebSocket updates to optimize performance.

## 4. Code References

- **Calculations**: `src/core/metrics.ts`
- **Ranking Logic**: `src/core/ranking.ts`
- **Data Engine**: `src/engine/ClientEngine.ts`
