const WebSocket = require("ws");
const { RSI, EMA } = require("technicalindicators");
const axios = require("axios");

class QuickApexEngine {
    constructor(symbol = "btc", interval = "1m") {
        this.symbol = symbol.toLowerCase();
        this.interval = interval;
        this.wsUrl = `wss://stream.binance.com:9443/ws/${this.symbol}usdt@kline_${this.interval}`;
        this.ws = null;
        this.closes = [];
    }

    async start() {
        console.log(`[APEX-Q Terminal] ${this.symbol.toUpperCase()}USDT geçmiş verileri (REST) çekiliyor...`);
        try {
            const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${this.symbol.toUpperCase()}USDT&interval=${this.interval}&limit=40`);
            this.closes = res.data.map(d => parseFloat(d[4]));
            console.log(`[APEX-Q Terminal] Geçmiş 40 mum yüklendi.`);
            console.log(`[APEX-Q Terminal] Binance WebSocket (Canlı) Bağlantısı Açılıyor 🟢`);
            
            this.ws = new WebSocket(this.wsUrl);
            this.ws.on("message", (data) => {
                const kline = JSON.parse(data).k;
                const currentPrice = parseFloat(kline.c);
                
                // İlk gelen saniyelik veriyle analiz yapıp sistemi kapatalım (Test amaçlı)
                this.runTerminalAnalysis(currentPrice);
                this.ws.close();
                process.exit(0);
            });
        } catch (e) {
            console.error("Hata oluştu:", e.message);
            process.exit(1);
        }
    }

    runTerminalAnalysis(currentPrice) {
        const tempCloses = [...this.closes, currentPrice];

        const rsiResult = RSI.calculate({ values: tempCloses, period: 14 });
        const currentRsi = rsiResult[rsiResult.length - 1];

        const ema9Result = EMA.calculate({ values: tempCloses, period: 9 });
        const ema21Result = EMA.calculate({ values: tempCloses, period: 21 });
        const currentEma9 = ema9Result[ema9Result.length - 1];
        const currentEma21 = ema21Result[ema21Result.length - 1];

        let scalpSignal = "NEUTRAL ⚪";
        let score = 50;

        if (currentRsi < 35) score += 20;
        else if (currentRsi > 65) score -= 20;

        if (currentEma9 > currentEma21) score += 15;
        else if (currentEma9 < currentEma21) score -= 15;

        if (score >= 75) scalpSignal = "STRONG BUY 🟢";
        else if (score >= 60) scalpSignal = "BUY 📈";
        else if (score <= 25) scalpSignal = "STRONG SELL 🔴";
        else if (score <= 40) scalpSignal = "SELL 📉";

        console.log(`\n================= APEX-Q Terminal SCALP REPORT =================`);
        console.log(`⚡ ANLIK MOMENTUM: ${scalpSignal} (Skor: ${score}/100)`);
        console.log(`📊 Fiyat: $${currentPrice.toFixed(2)} | RSI(14): ${currentRsi.toFixed(2)}`);
        console.log(`📈 EMA(9): $${currentEma9.toFixed(2)} | EMA(21): $${currentEma21.toFixed(2)}`);
        console.log(`========================================================\n`);
    }
}

new QuickApexEngine("btc", "1m").start();