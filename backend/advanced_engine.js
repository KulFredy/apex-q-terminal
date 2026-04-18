const axios = require("axios");
const { RSI, EMA } = require("technicalindicators");

class ApexQuantEngine {
    constructor(symbol = "btc", interval = "1m") {
        this.symbol = symbol.toLowerCase();
        this.interval = interval;
        this.highs = [];
        this.lows = [];
        this.closes = [];
        this.opens = [];
        this.volumes = [];
    }

    async start() {
        console.log(`[APEX-Q Terminal] ${this.symbol.toUpperCase()}USDT verileri yükleniyor...`);
        try {
            // Canlı analiz için Binance'ten son 100 mumu çekiyoruz
            const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${this.symbol.toUpperCase()}USDT&interval=${this.interval}&limit=100`);
            res.data.forEach(d => {
                this.opens.push(parseFloat(d[1]));
                this.highs.push(parseFloat(d[2]));
                this.lows.push(parseFloat(d[3]));
                this.closes.push(parseFloat(d[4]));
                this.volumes.push(parseFloat(d[5]));
            });
            
            console.log(`[APEX-Q Terminal] 100 Mum Yüklendi. Kuantum Analizi (Fibonacci & PA) Başlıyor...\n`);
            this.runQuantAnalysis();
        } catch (e) {
            console.error("Hata:", e.message);
        }
    }

    runQuantAnalysis() {
        const currentPrice = this.closes[this.closes.length - 1];

        // 1. Klasik İndikatörler (RSI, EMA)
        const rsiResult = RSI.calculate({ values: this.closes, period: 14 });
        const currentRsi = rsiResult[rsiResult.length - 1];

        const ema9Result = EMA.calculate({ values: this.closes, period: 9 });
        const ema21Result = EMA.calculate({ values: this.closes, period: 21 });
        const currentEma9 = ema9Result[ema9Result.length - 1];
        const currentEma21 = ema21Result[ema21Result.length - 1];

        // 2. Otonom Fibonacci (Son 60 mum içindeki Swing High ve Swing Low)
        const recentHighs = this.highs.slice(-60);
        const recentLows = this.lows.slice(-60);
        const swingHigh = Math.max(...recentHighs);
        const swingLow = Math.min(...recentLows);
        const diff = swingHigh - swingLow;

        // Geri çekilme seviyeleri (Yukarı trend varsayımıyla Golden Pocket)
        const fib618 = swingHigh - (diff * 0.618);
        const fib650 = swingHigh - (diff * 0.650);
        const fib382 = swingHigh - (diff * 0.382);

        // 3. FVG (Fair Value Gap / Likidite Boşluğu) - Son 15 mumda taranır
        let bullishFVG = null;
        let bearishFVG = null;
        for (let i = this.closes.length - 15; i < this.closes.length - 2; i++) {
            const high1 = this.highs[i];
            const low3 = this.lows[i+2];
            
            const low1 = this.lows[i];
            const high3 = this.highs[i+2];

            // Bullish FVG: 3. mumun en düşüğü > 1. mumun en yükseği
            if (low3 > high1) {
                bullishFVG = { bottom: high1, top: low3 };
            }
            // Bearish FVG: 3. mumun en yükseği < 1. mumun en düşüğü
            if (high3 < low1) {
                bearishFVG = { bottom: high3, top: low1 };
            }
        }

        // --- APEX SCALP PUANLAMA MOTORU ---
        let score = 50;
        let pActionLog = [];

        // Momentum & Trend Skoru
        if (currentEma9 > currentEma21) score += 10;
        else score -= 10;

        if (currentRsi < 35) { score += 15; pActionLog.push("🟢 RSI Aşırı Satım (Ucuz Bölge)"); }
        else if (currentRsi > 65) { score -= 15; pActionLog.push("🔴 RSI Aşırı Alım (Pahalı Bölge)"); }

        // Fibonacci Golden Pocket Etkisi (Fiyat 0.618'e %0.3'ten daha yakınsa)
        const distToGoldenPocket = Math.abs(currentPrice - fib618) / currentPrice;
        if (distToGoldenPocket < 0.003) {
            score += 25; 
            pActionLog.push(`🧱 FIB 0.618 Koruması Aktif (Golden Pocket): $${fib618.toFixed(2)}`);
        }

        // FVG (Likidite Boşluğu) Mıknatıs Etkisi
        if (bullishFVG && currentPrice > bullishFVG.top) {
            pActionLog.push(`🧲 Aşağıda Bullish FVG var ($${bullishFVG.bottom.toFixed(2)} - $${bullishFVG.top.toFixed(2)}) - Fiyatı destekler.`);
            score += 10;
        }
        if (bearishFVG && currentPrice < bearishFVG.bottom) {
             pActionLog.push(`🧲 Yukarıda Bearish FVG var ($${bearishFVG.bottom.toFixed(2)} - $${bearishFVG.top.toFixed(2)}) - Mıknatıs gibi çeker.`);
             score += 15; // Hedef yukarıda olduğu için long lehine puan
        }

        // Skor Sınırları ve Nihai Karar
        if (score > 100) score = 100;
        if (score < 0) score = 0;

        let scalpSignal = "NEUTRAL ⚪";
        if (score >= 75) scalpSignal = "STRONG BUY 🟢";
        else if (score >= 60) scalpSignal = "BUY 📈";
        else if (score <= 25) scalpSignal = "STRONG SELL 🔴";
        else if (score <= 40) scalpSignal = "SELL 📉";

        // EKRAN ÇIKTISI (Terminal Dashboard Formatı)
        console.log(`================ APEX-Q TERMINAL (SCALP MODE) ================`);
        console.log(`[KARAR] ⚡ ${scalpSignal} (APEX Skor: ${score}/100)`);
        console.log(`[FİYAT] 📊 $${currentPrice.toFixed(2)} | RSI(14): ${currentRsi.toFixed(2)}`);
        console.log(`[TREND] 📈 EMA(9): $${currentEma9.toFixed(2)} | EMA(21): $${currentEma21.toFixed(2)}`);
        console.log(`--------------------------------------------------------------`);
        console.log(`[QUANT VERİLERİ & PRICE ACTION]`);
        console.log(`📐 Son 1 Saatlik Pivot -> Tepe: $${swingHigh.toFixed(2)} | Dip: $${swingLow.toFixed(2)}`);
        console.log(`🎯 Golden Pocket (Fib 0.618): $${fib618.toFixed(2)}`);
        if (pActionLog.length > 0) {
            pActionLog.forEach(log => console.log(`👉 ${log}`));
        } else {
            console.log(`👉 Anlık FVG (Boşluk) veya kritik Fibonacci teması tespit edilmedi.`);
        }
        console.log(`==============================================================\n`);
    }
}

new ApexQuantEngine("btc", "1m").start();