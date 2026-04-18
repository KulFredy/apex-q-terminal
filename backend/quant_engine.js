const WebSocket = require('ws');
const axios = require('axios');
const { RSI, EMA } = require('technicalindicators');

class QuantEngine {
    constructor(symbol = 'btc', interval = '1m') {
        this.symbol = symbol.toLowerCase();
        this.interval = interval;
        this.closes = []; this.highs = []; this.lows = [];
        this.cvd = 0;
        this.maxBid = { price: 0, volume: 0 };
        this.maxAsk = { price: 0, volume: 0 };
        this.firstReportDone = false;
        
        // Multi-Stream WS (Mum, Emir Defteri, Agresif Alış-Satış)
        this.wsUrl = `wss://stream.binance.com:9443/stream?streams=${this.symbol}usdt@kline_${this.interval}/${this.symbol}usdt@depth20@100ms/${this.symbol}usdt@aggTrade`;
    }

    async init() {
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
        // Sadece test için, emir defteri yüklenir yüklenmez ilk raporu patlat
        if (!this.firstReportDone && this.maxBid.volume > 0 && this.maxAsk.volume > 0) {
            this.firstReportDone = true;
            this.generateQuantReport(currentPrice);
            setTimeout(() => { this.ws.close(); process.exit(0); }, 500);
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
        const isBuyerMaker = trade.m;
        const volume = parseFloat(trade.q);
        if (isBuyerMaker) this.cvd -= volume; else this.cvd += volume;
    }

    generateQuantReport(currentPrice) {
        let score = 50; 
        
        // APEX Puanı (Örnek Basit Mantık)
        if (this.cvd > 10) score += 20; 
        else if (this.cvd < -10) score -= 20;
        
        let signal = "NEUTRAL ⚪";
        if (score >= 75) signal = "STRONG BUY 🟢"; else if (score >= 60) signal = "BUY 📈";
        else if (score <= 25) signal = "STRONG SELL 🔴"; else if (score <= 40) signal = "SELL 📉";
        
        console.log(`\n================== APEX-Q SCALP REPORT ==================`);
        console.log(`[KARAR] ⚡ ${signal} (APEX Skor: ${score}/100)`);
        console.log(`[FİYAT] 📊 $${currentPrice.toFixed(2)} | CVD (Delta): ${this.cvd.toFixed(2)} BTC`);
        console.log(`---------------------------------------------------------`);
        console.log(`[🐋 LİKİDİTE DUVARLARI (ORDER BOOK HEATMAP)]`);
        console.log(`🔴 Satış Duvarı: $${this.maxAsk.price} (${this.maxAsk.volume.toFixed(1)} BTC Blok)`);
        console.log(`🟢 Alış Duvarı : $${this.maxBid.price} (${this.maxBid.volume.toFixed(1)} BTC Blok)`);
        console.log(`---------------------------------------------------------`);
        console.log(`[🧠 APEX-Q INSIGHTS]`);
        if (this.cvd > 0) console.log(`👉 🟢 CVD Pozitif: Alıcılar Piyasa Emirleriyle saldırıyor.`);
        else console.log(`👉 🔴 CVD Negatif: Satıcılar Piyasa Emirleriyle baskılıyor.`);
        console.log(`👉 🧱 Anlık Likidite Duvarlarına göre destek/direnç test ediliyor.`);
        console.log(`=========================================================\n`);
    }
}

new QuantEngine('btc', '1m').init();