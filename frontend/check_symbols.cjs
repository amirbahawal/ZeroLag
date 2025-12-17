
const https = require('https');

const symbols = ['COMROUSDT', 'IDEXUSDT', 'COMRUSDT', 'COMBOUSDT'];

symbols.forEach(symbol => {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=5`;
    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log(`${symbol}: ${res.statusCode} - ${data.substring(0, 100)}`);
        });
    }).on('error', (e) => {
        console.error(`${symbol}: Error - ${e.message}`);
    });
});
