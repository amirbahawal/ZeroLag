/**
 * Formatting Utilities
 * 
 * Helper functions for formatting numbers, volumes, percentages, prices, and timestamps.
 * All functions are pure and side-effect free.
 */

/* =============================================
   NUMBER FORMATTING
   ============================================= */

/**
 * Format a number with thousands separators
 * 
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with thousand separators
 * 
 * @example
 * formatNumber(1234567.89) // "1,234,567.89"
 * formatNumber(1234.5, 1) // "1,234.5"
 * formatNumber(1000, 0) // "1,000"
 */
export function formatNumber(value: number, decimals: number = 2): string {
    return value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/**
 * Format volume to K/M/B notation
 * 
 * @param volume - Volume value to format
 * @returns Formatted volume string
 * 
 * @example
 * formatVolume(1500) // "$1.5K"
 * formatVolume(1500000) // "$1.5M"
 * formatVolume(2400000000) // "$2.4B"
 * formatVolume(150) // "$150"
 */
export function formatVolume(volume: number): string {
    const absVolume = Math.abs(volume);

    if (absVolume >= 1e9) {
        return `$${(volume / 1e9).toFixed(2)}B`;
    }
    if (absVolume >= 1e6) {
        return `$${(volume / 1e6).toFixed(1)}M`;
    }
    if (absVolume >= 1e3) {
        return `$${(volume / 1e3).toFixed(1)}K`;
    }

    return `$${volume.toFixed(0)}`;
}

/**
 * Format percentage with sign
 * 
 * @param value - Percentage value (e.g., 2.45 for 2.45%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string with sign
 * 
 * @example
 * formatPercentage(2.45) // "+2.45%"
 * formatPercentage(-1.34) // "-1.34%"
 * formatPercentage(0.5, 1) // "+0.5%"
 */
export function formatPercentage(value: number, decimals: number = 2): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format price with smart decimal places
 * 
 * Automatically adjusts decimal places based on price magnitude:
 * - < $0.01: 6 decimals
 * - < $1: 4 decimals  
 * - < $100: 2 decimals
 * - >= $100: 2 decimals
 * - >= $1M: K/M notation
 * 
 * @param price - Price value to format
 * @returns Formatted price string
 * 
 * @example
 * formatPrice(0.000123) // "$0.000123"
 * formatPrice(0.5) // "$0.5000"
 * formatPrice(5.99) // "$5.99"
 * formatPrice(1500.50) // "$1,500.50"
 * formatPrice(1500000) // "$1.50M"
 */
export function formatPrice(price: number): string {
    const absPrice = Math.abs(price);

    // Very large prices - use K/M notation
    if (absPrice >= 1e6) {
        return `$${(price / 1e6).toFixed(2)}M`;
    }
    if (absPrice >= 1e5) {
        return `$${(price / 1e3).toFixed(1)}K`;
    }

    // Standard prices with appropriate decimals
    if (absPrice < 0.01) {
        return `$${price.toFixed(6)}`;
    }
    if (absPrice < 1) {
        return `$${price.toFixed(4)}`;
    }

    // Normal prices with thousands separator
    return `$${price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

/* =============================================
   TIME FORMATTING
   ============================================= */

/**
 * Format Unix timestamp to readable time
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param format - Format type: 'time' | 'relative' (default: 'time')
 * @returns Formatted time string
 * 
 * @example
 * formatTimestamp(1699876543000) // "14:35:43"
 * formatTimestamp(Date.now() - 120000, 'relative') // "2m ago"
 * formatTimestamp(Date.now() - 3600000, 'relative') // "1h ago"
 */
export function formatTimestamp(
    timestamp: number,
    format: 'time' | 'relative' = 'time'
): string {
    if (format === 'relative') {
        return formatRelativeTime(timestamp);
    }

    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format timestamp as relative time
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Relative time string
 * 
 * @example
 * formatRelativeTime(Date.now() - 30000) // "30s ago"
 * formatRelativeTime(Date.now() - 300000) // "5m ago"
 * formatRelativeTime(Date.now() - 7200000) // "2h ago"
 */
function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ago`;
    }
    if (hours > 0) {
        return `${hours}h ago`;
    }
    if (minutes > 0) {
        return `${minutes}m ago`;
    }
    if (seconds > 0) {
        return `${seconds}s ago`;
    }

    return 'just now';
}

/* =============================================
   COLOR UTILITIES
   ============================================= */

/**
 * Get CSS color variable for a value
 * 
 * Returns appropriate color based on value and type:
 * - Positive: green (candle-up)
 * - Negative: red (candle-down)
 * - Neutral/Zero: muted
 * 
 * @param value - Numeric value to evaluate
 * @param type - Type hint for special cases
 * @returns CSS custom property string
 * 
 * @example
 * getColorForValue(5.2, 'percentage') // "var(--candle-up)"
 * getColorForValue(-2.1, 'percentage') // "var(--candle-down)"
 * getColorForValue(0, 'dext') // "var(--text-muted)"
 */
export function getColorForValue(
    value: number,
    type: 'percentage' | 'volume' | 'dext' = 'percentage'
): string {
    // Special handling for dext (daily extremum)
    if (type === 'dext') {
        // Lower score is better (closer to high/low)
        if (value < 2) return 'var(--candle-up)'; // Very close
        if (value < 5) return 'var(--accent-cyan)'; // Close
        return 'var(--text-muted)'; // Neutral/far
    }

    // Volume is always positive, use cyan
    if (type === 'volume') {
        return 'var(--accent-cyan)';
    }

    // Percentage: positive = green, negative = red
    if (value > 0) {
        return 'var(--candle-up)';
    }
    if (value < 0) {
        return 'var(--candle-down)';
    }

    // Zero or neutral
    return 'var(--text-muted)';
}

/* =============================================
   ADDITIONAL UTILITIES
   ============================================= */

/**
 * Format a compact number (for tight spaces)
 * 
 * @param value - Number to format
 * @returns Compact string representation
 * 
 * @example
 * formatCompactNumber(1234) // "1.2K"
 * formatCompactNumber(1234567) // "1.2M"
 * formatCompactNumber(50) // "50"
 */
export function formatCompactNumber(value: number): string {
    const absValue = Math.abs(value);

    if (absValue >= 1e9) {
        return `${(value / 1e9).toFixed(1)}B`;
    }
    if (absValue >= 1e6) {
        return `${(value / 1e6).toFixed(1)}M`;
    }
    if (absValue >= 1e3) {
        return `${(value / 1e3).toFixed(1)}K`;
    }

    return value.toFixed(0);
}

/**
 * Format percentage from decimal (0-1 range)
 * 
 * @param decimal - Decimal value (e.g., 0.0245 for 2.45%)
 * @param decimals - Number of decimal places
 * @returns Formatted percentage string
 * 
 * @example
 * formatPercentageFromDecimal(0.0245) // "+2.45%"
 * formatPercentageFromDecimal(-0.0134, 1) // "-1.3%"
 */
export function formatPercentageFromDecimal(
    decimal: number,
    decimals: number = 2
): string {
    return formatPercentage(decimal * 100, decimals);
}

/**
 * Truncate number to specified decimal places without rounding
 * 
 * @param value - Number to truncate
 * @param decimals - Number of decimal places
 * @returns Truncated number
 * 
 * @example
 * truncateDecimals(1.23456, 2) // 1.23
 * truncateDecimals(9.999, 2) // 9.99
 */
export function truncateDecimals(value: number, decimals: number): number {
    const multiplier = Math.pow(10, decimals);
    return Math.floor(value * multiplier) / multiplier;
}
