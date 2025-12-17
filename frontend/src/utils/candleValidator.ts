

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validates candle data structure and values
 */
export function validateCandles(candles: any[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if array
    if (!Array.isArray(candles)) {
        errors.push('Data is not an array');
        return { valid: false, errors, warnings };
    }

    // Check if empty
    if (candles.length === 0) {
        warnings.push('Candles array is empty');
        return { valid: true, errors, warnings };
    }

    // Check structure of first candle
    const sample = candles[0];
    const requiredFields = [
        'symbol', 'interval', 'openTime', 'closeTime',
        'open', 'high', 'low', 'close'
    ];

    for (const field of requiredFields) {
        if (!(field in sample)) {
            errors.push(`Missing required field: ${field}`);
        }
    }

    // Check data types
    if (typeof sample.openTime !== 'number') {
        errors.push('openTime must be number');
    }
    if (typeof sample.open !== 'number') {
        errors.push('open must be number');
    }
    if (typeof sample.high !== 'number') {
        errors.push('high must be number');
    }
    if (typeof sample.low !== 'number') {
        errors.push('low must be number');
    }
    if (typeof sample.close !== 'number') {
        errors.push('close must be number');
    }

    // Check value validity
    for (const candle of candles) {
        if (candle.high < candle.low) {
            errors.push(`Invalid candle: high (${candle.high}) < low (${candle.low})`);
            break;
        }
        if (candle.open < 0 || candle.close < 0) {
            errors.push('Negative prices detected');
            break;
        }
        if (isNaN(candle.open) || isNaN(candle.close)) {
            errors.push('NaN values detected');
            break;
        }
    }

    // Check chronological order
    for (let i = 1; i < candles.length; i++) {
        if (candles[i].openTime <= candles[i - 1].openTime) {
            errors.push('Candles not in chronological order');
            break;
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validates and logs candle data
 */
export function validateAndLog(symbol: string, candles: any[]): boolean {
    const result = validateCandles(candles);

    if (!result.valid) {
        console.error(`[Validator] ❌ ${symbol} validation failed:`, result.errors);
    } else if (result.warnings.length > 0) {
        console.warn(`[Validator] ⚠️ ${symbol} warnings:`, result.warnings);
    } else {
        console.log(`[Validator] ✅ ${symbol} data valid (${candles.length} candles)`);
    }

    return result.valid;
}
