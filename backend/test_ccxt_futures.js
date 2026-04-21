const ccxt = require('ccxt');
const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
exchange.fetchOHLCV('BTC/USDT', '1h', undefined, 2).then(console.log).catch(console.error);
