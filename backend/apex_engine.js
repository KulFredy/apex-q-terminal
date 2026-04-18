const WebSocket = require('ws');
const { RSI, EMA, MACD } = require('technicalindicators');

// APEX-Q Terminal Core Terminal Engine (Data Ingestion & Scalper Engine)
// Bu modül: Binance'ten canlı (1s) kline verisi çeker, indikatörleri hesaplar ve Scalp/Swing analizine hazırlar.

class ApexEngine {
    constructor(symbol = 'btc', interval = '1m') {
        this.symbol = symbol.toLowerCase();
        this.interval = interval;
        this.wsUrl = `wss://stream.binance.com:9443/ws/${this.symbol}usdt@kline_${this.interval}`;
        this.ws = null;
        
        // Geçmiş veri (Mumlar)
        this.closes = [];
        this.highs = [];
        this.lows = [];
        this.volumes = [];
        
        this.maxHistory = 100; // 100 mumluk hafıza (RSI ve EMA için yeterli)
        
        // APEX Skor ve Sinyal Durumu
        this.currentSignal = "NEUTRAL";
        this.apexScore = 50; // 0-100 (0: Strong Sell, 100: Strong Buy)
    }

    start() {
        console.log(`[APEX-Q Terminal] ${this.symbol.toUpperCase()}USDT için ${this.interval} canlı akış başlatılıyor...`);
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            console.log(`[APEX-Q Terminal] Binance WebSocket Bağlantısı Başarılı 🟢`);
        });

        this.ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data);
                this.processKline(parsed.k);
            } catch (error) {
                console.error(`[APEX-Q Terminal] Veri işleme hatası:`, error);
            }
        });

        this.ws.on('error', (err) => {
            console.error(`[APEX-Q Terminal] WebSocket Hatası 🔴:`, err.message);
        });

        this.ws.on('close', () => {
            console.log(`[APEX-Q Terminal] WebSocket Kapandı 🟡. Yeniden bağlanılıyor...`);
            setTimeout(() => this.start(), 3000);
        });
    }

    processKline(kline) {
        const closePrice = parseFloat(kline.c);
        const highPrice = parseFloat(kline.h);
        const lowPrice = parseFloat(kline.l);
        const volume = parseFloat(kline.v);
        const isClosed = kline.x; // Mum kapandı mı?

        // Eğer mum kapandıysa, geçmiş hafızaya (array) kalıcı olarak ekle.
        // Kapanmadıysa bile anlık (Tick) hesaplama için son elemanı güncelle.
        if (isClosed) {
            this.closes.push(closePrice);
            this.highs.push(highPrice);
            this.lows.push(lowPrice);
            this.volumes.push(volume);

            if (this.closes.length > this.maxHistory) {
                this.closes.shift();
                this.highs.shift();
                this.lows.shift();
                this.volumes.shift();
            }

            // Mum kapandığında tam bir Terminal Analizi patlat!
            this.runTerminalAnalysis(closePrice);
        }
    }

    runTerminalAnalysis(currentPrice) {
        if (this.closes.length < 35) return; // Yeterli veri yoksa bekle

        // 1. Oscillators (RSI Hesaplaması - 14 Mum)
        const rsiInput = { values: this.closes, period: 14 };
        const rsiResult = RSI.calculate(rsiInput);
        const currentRsi = rsiResult[rsiResult.length - 1];

        // 2. Trend (EMA Hesaplaması - 9 ve 21 Mum)
        const ema9Input = { values: this.closes, period: 9 };
        const ema21Input = { values: this.closes, period: 21 };
        const ema9Result = EMA.calculate(ema9Input);
        const ema21Result = EMA.calculate(ema21Input);
        const currentEma9 = ema9Result[ema9Result.length - 1];
        const currentEma21 = ema21Result[ema21Result.length - 1];

        // --- APEX SCALP MOTORU KARAR AĞACI ---
        let scalpSignal = "NEUTRAL";
        let score = 50;

        // RSI Mantığı (Aşırı Alım/Satım)
        if (currentRsi < 30) { score += 20; } // Oversold (Dipte)
        else if (currentRsi > 70) { score -= 20; } // Overbought (Tepede)

        // EMA Kesişimi Mantığı (Momentum Yönü)
        if (currentEma9 > currentEma21) { score += 15; } // Boğa Eğilimi
        else if (currentEma9 < currentEma21) { score -= 15; } // Ayı Eğilimi

        // Nihai Karar
        if (score >= 75) scalpSignal = "STRONG BUY 🟢";
        else if (score >= 60) scalpSignal = "BUY 📈";
        else if (score <= 25) scalpSignal = "STRONG SELL 🔴";
        else if (score <= 40) scalpSignal = "SELL 📉";

        // Terminal Ekranına Canlı Çıktı Bas (SCALP REPORT)
        console.log(`\n================= APEX-Q Terminal SCALP REPORT =================`);
        console.log(`⚡ ANLIK MOMENTUM: ${scalpSignal} (Skor: ${score}/100)`);
        console.log(`📊 Fiyat: $${currentPrice.toFixed(2)} | RSI(14): ${currentRsi.toFixed(2)}`);
        console.log(`📈 EMA(9): $${currentEma9.toFixed(2)} | EMA(21): $${currentEma21.toFixed(2)}`);
        console.log(`========================================================\n`);
    }
}

// Sistemi Başlat (Örnek: BTC/USDT, 1 dakikalık scalp)
const apex = new ApexEngine('btc', '1m');
apex.start();
