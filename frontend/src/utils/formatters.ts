export function formatNumber(value: number, decimals: number = 2): string {
    return value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

export function formatVolume(volume: number): string {
    const absVolume = Math.abs(volume);
    if (absVolume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
    if (absVolume >= 1e6) return `$${(volume / 1e6).toFixed(1)}M`;
    if (absVolume >= 1e3) return `$${(volume / 1e3).toFixed(1)}K`;
    return `$${volume.toFixed(0)}`;
}

export function formatPercentage(value: number, decimals: number = 2): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(decimals)}%`;
}

export function formatPrice(price: number): string {
    const absPrice = Math.abs(price);
    if (absPrice >= 1e6) return `$${(price / 1e6).toFixed(2)}M`;
    if (absPrice >= 1e5) return `$${(price / 1e3).toFixed(1)}K`;
    if (absPrice < 0.01) return `$${price.toFixed(6)}`;
    if (absPrice < 1) return `$${price.toFixed(4)}`;
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatTimestamp(timestamp: number, format: 'time' | 'relative' = 'time'): string {
    if (format === 'relative') return formatRelativeTime(timestamp);
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 0) return `${seconds}s ago`;
    return 'just now';
}

export function getColorForValue(value: number, type: 'percentage' | 'volume' | 'dext' = 'percentage'): string {
    if (type === 'dext') {
        if (value < 2) return 'var(--candle-up)';
        if (value < 5) return 'var(--accent-cyan)';
        return 'var(--text-muted)';
    }
    if (type === 'volume') return 'var(--accent-cyan)';
    if (value > 0) return 'var(--candle-up)';
    if (value < 0) return 'var(--candle-down)';
    return 'var(--text-muted)';
}

export function formatCompactNumber(value: number): string {
    const absValue = Math.abs(value);
    if (absValue >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (absValue >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (absValue >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(0);
}

export function formatPercentageFromDecimal(decimal: number, decimals: number = 2): string {
    return formatPercentage(decimal * 100, decimals);
}

export function truncateDecimals(value: number, decimals: number): number {
    const multiplier = Math.pow(10, decimals);
    return Math.floor(value * multiplier) / multiplier;
}
