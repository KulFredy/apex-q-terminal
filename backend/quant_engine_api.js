const WebSocket = require('ws');
const axios = require('axios');
const { RSI, EMA } = require('technicalindicators');
const { createClient } = require('redis');

class QuantEngineAPI {
    constructor(symbol = 'btc', interval = '1m') {
        this.symbol = symbol.toLowerCase();
        this.interval = interval;
        this.closes = []; this.highs = []; this.lows = [];
        this.cvd = 0;
        this.maxBid = { price: 0, volume: 0 };
        this.maxAsk = { price: 0, volume: 0 };
        this.redis = createClient();
        this.wsUrl = `wss://stream.binance.com:9443/stream?streams=${this.symbol}usdt@kline_${this.interval}/${this.symbol}usdt@depth20@100ms/${this.symbol}usdt@aggTrade`;
    }

    async init() {
        await this.redis.connect();
        console.log(`[APEX-Q] Redis Önbelleğine Bağlanıldı.`);
        
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${this.symbol.toUpperCase()}USDT&interval=${this.interval}&limit=100`);
        res.data.forEach(d => {
            this.highs.push(parseFloat(d[2]));
            this.lows.push(parseFloat(d[3]));
            this.closes.push(parseFloat(d[4]));
        });
        this.startWebSockets();
    }

    startWebSockets() {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.on('message', (data) => {
            const payload = JSON.parse(data);
            const stream = payload.stream;
            const msg = payload.data;

            if (stream.includes('@kline')) {
                this.handleKline(msg.k);
            } else if (stream.includes('@depth')) {
                this.handleOrderBook(msg);
            } else if (stream.includes('@aggTrade')) {
                this.handleAggTrade(msg);
            }
        });
    }

    handleKline(kline) {
        const currentPrice = parseFloat(kline.c);
        if (kline.x) {
            this.closes.push(currentPrice); this.highs.push(parseFloat(kline.h)); this.lows.push(parseFloat(kline.l));
            if (this.closes.length > 150) { this.closes.shift(); this.highs.shift(); this.lows.shift(); }
        }
        
        // Saniyede 1 kez Redis'e güncel veriyi kaydet (Büyük bir UI'dan çekilecek veriler)
        if (this.maxBid.volume > 0 && this.maxAsk.volume > 0) {
            this.updateRedis(currentPrice);
        }
    }

    handleOrderBook(depth) {
        depth.bids.forEach(b => {
            let price = parseFloat(b[0]); let vol = parseFloat(b[1]);
            if (vol > this.maxBid.volume) { this.maxBid = {price, volume: vol}; }
        });
        depth.asks.forEach(a => {
            let price = parseFloat(a[0]); let vol = parseFloat(a[1]);
            if (vol > this.maxAsk.volume) { this.maxAsk = {price, volume: vol}; }
        });
    }

    handleAggTrade(trade) {
        if (trade.m) this.cvd -= parseFloat(trade.q); else this.cvd += parseFloat(trade.q);
    }

    async updateRedis(currentPrice) {
        let score = 50; 
        if (this.cvd > 10) score += 20; else if (this.cvd < -10) score -= 20;
        
        let signal = "NEUTRAL ⚪";
        if (score >= 75) signal = "STRONG BUY 🟢"; else if (score >= 60) signal = "BUY 📈";
        else if (score <= 25) signal = "STRONG SELL 🔴"; else if (score <= 40) signal = "SELL 📉";

        const snapshot = {
            symbol: this.symbol.toUpperCase(),
            timestamp: Date.now(),
            price: currentPrice.toFixed(2),
            signal: signal,
            apex_score: score,
            cvd: this.cvd.toFixed(2),
            orderbook: { 
                ask_wall: { price: this.maxAsk.price, volume: this.maxAsk.volume.toFixed(1) },
                bid_wall: { price: this.maxBid.price, volume: this.maxBid.volume.toFixed(1) }
            }
        };

        // Bu veri saniyede bir Frontend tarafından okunmak üzere Redis'e basılır
        await this.redis.set('apex:btc:snapshot', JSON.stringify(snapshot));
    }
}

module.exports = QuantEngineAPI;