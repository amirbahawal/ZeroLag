import { useZeroLagStore } from '../state/useZeroLagStore';

export function RateLimitBanner() {
    const apiStatus = useZeroLagStore(state => state.apiStatus);
    if (apiStatus === 'ok') return null;

    const message = apiStatus === 'rate_limited'
        ? 'Binance API is rate-limiting your IP. Data may update slowly.'
        : '⚠️ API connection error. Retrying...';

    const style = apiStatus === 'rate_limited'
        ? { backgroundColor: 'rgba(246, 180, 77, 0.9)', borderColor: 'rgba(255,255,255,0.2)' }
        : { backgroundColor: 'rgba(242, 94, 114, 0.9)', borderColor: 'rgba(255,255,255,0.2)' };

    return (
        <div className="fixed top-16 right-4 z-50 max-w-sm animate-slide-in-right">
            <div
                className="backdrop-blur-sm text-white px-4 py-2.5 rounded-lg shadow-lg text-sm flex items-center gap-2 border"
                style={style}
            >
                <span>{message}</span>
            </div>
        </div>
    );
}
