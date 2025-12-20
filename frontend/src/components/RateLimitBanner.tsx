import React from 'react';
import { useZeroLagStore } from '../state/useZeroLagStore';

export function RateLimitBanner() {
    const apiStatus = useZeroLagStore(state => state.apiStatus);
    if (apiStatus === 'ok') return null;

    const getMessage = () => {
        switch (apiStatus) {
            case 'rate_limited':
                return 'Binance API is rate-limiting your IP. Data may update slowly.';
            case 'error':
                return '⚠️ API connection error. Retrying...';
            default:
                return '';
        }
    };

    const getStyle = () => {
        switch (apiStatus) {
            case 'rate_limited':
                // var(--accent-amber) #f6b44d with opacity
                return { backgroundColor: 'rgba(246, 180, 77, 0.9)', borderColor: 'rgba(255,255,255,0.2)' };
            case 'error':
                // var(--accent-red) #f25e72 with opacity
                return { backgroundColor: 'rgba(242, 94, 114, 0.9)', borderColor: 'rgba(255,255,255,0.2)' };
            default:
                return { backgroundColor: 'rgba(118, 124, 143, 0.9)', borderColor: 'rgba(255,255,255,0.2)' };
        }
    };

    return (
        <div className="fixed top-16 right-4 z-50 max-w-sm animate-slide-in-right">
            <div
                className="backdrop-blur-sm text-white px-4 py-2.5 rounded-lg shadow-lg text-sm flex items-center gap-2 border"
                style={getStyle()}
            >
                <span>{getMessage()}</span>
            </div>
        </div>
    );
}
