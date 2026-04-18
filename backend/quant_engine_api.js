/**
 * APEX-Q Quant Engine - Faz 5 (Premium Modüller)
 * - Risk Yönetimi, TP/SL, R:R
 * - Fibonacci Retracement & Confluence (Altın Oran %61.8)
 * - Elliott Wave (Dalga) Tespiti
 */
const WebSocket = require('ws');
const redis = require('redis');
const axios = require('axios');

// Redis Bağlantısı (In-Memory Hızlı Veritabanı)
const redisClient = redis.createClient({ url: 'redis://127.0.0.1:6379' });
redisClient.on('error', (err) => console.log('Redis Hatası:', err));
redisClient.connect();

// Binance K-Line (Mum) Verileri İçin Değişkenler
const SYMBOL = 'btcusdt';
let currentPrice = 0;

// CVD (Smart Money)
let cumulativeVolumeDelta = 0;
const CVD_RESET_THRESHOLD = 1000;
let tradeCount = 0;

// Order Book (Emir Defteri)
let bestAsk = 0; let bestBid = 0;
let askVolume = 0; let bidVolume = 0;

// Fiyat Geçmişi (Fibonacci ve Elliott Wave için son 100 mum - 1m)
let priceHistory = [];
let swingHigh = 0;
let swingLow = Infinity;

// MTF ve Risk State
let mtfTrends = { "1m": "NEUTRAL", "15m": "NEUTRAL", "1h": "NEUTRAL", "4h": "NEUTRAL", "1d": "NEUTRAL" };
let tradeSetup = {
    active: false, direction: "NONE", entryPrice: 0,
    tp1: 0, tp2: 0, sl: 0, rr: "0:0", riskPercentage: 2.0,
    fibonacci: { level: "None", value: 0 },
    elliott: { wave: "None", description: "Bekleniyor..." }
};

/**
 * 1. Binance Canlı İşlem (Trades) - CVD ve Fiyat Geçmişi
 */
const wsTrades = new WebSocket(`wss://stream.binance.com:9443/ws/${SYMBOL}@aggTrade`);
wsTrades.on('message', (data) => {
    const trade = JSON.parse(data);
    currentPrice = parseFloat(trade.p);
    const qty = parseFloat(trade.q);
    const isBuyerMaker = trade.m;

    if (isBuyerMaker) cumulativeVolumeDelta -= qty;
    else cumulativeVolumeDelta += qty;

    tradeCount++;
    if (tradeCount >= CVD_RESET_THRESHOLD) {
        cumulativeVolumeDelta = 0;
        tradeCount = 0;
    }
});

/**
 * 1.5 Binance K-Line (Mum) - Fibonacci & Elliott Geçmişi İçin
 */
const wsKline = new WebSocket(`wss://stream.binance.com:9443/ws/${SYMBOL}@kline_1m`);
wsKline.on('message', (data) => {
    const kline = JSON.parse(data).k;
    if (kline.x) { // Mum kapandığında
        const closePrice = parseFloat(kline.c);
        priceHistory.push(closePrice);
        if (priceHistory.length > 100) priceHistory.shift();

        // Swing Low / High Güncelle
        swingLow = Math.min(...priceHistory);
        swingHigh = Math.max(...priceHistory);
    }
});

/**
 * 2. Binance Emir Defteri (Order Book Heatmap)
 */
const wsDepth = new WebSocket(`wss://stream.binance.com:9443/ws/${SYMBOL}@depth10@100ms`);
wsDepth.on('message', (data) => {
    const depth = JSON.parse(data);
    if (!depth.bids || !depth.asks) return;

    let maxBidVol = 0; let bestBidPrice = 0;
    depth.bids.forEach(bid => {
        let vol = parseFloat(bid[1]);
        if (vol > maxBidVol) { maxBidVol = vol; bestBidPrice = parseFloat(bid[0]); }
    });

    let maxAskVol = 0; let bestAskPrice = 0;
    depth.asks.forEach(ask => {
        let vol = parseFloat(ask[1]);
        if (vol > maxAskVol) { maxAskVol = vol; bestAskPrice = parseFloat(ask[0]); }
    });

    bestBid = bestBidPrice; bidVolume = maxBidVol;
    bestAsk = bestAskPrice; askVolume = maxAskVol;
});

/**
 * 3. PREMIUM: Fibonacci Retracement & Confluence
 */
function calculateFibonacci() {
    if (swingHigh === 0 || swingLow === Infinity || priceHistory.length < 10) return;

    const diff = swingHigh - swingLow;
    // Yükseliş trendi varsayımıyla (Aşağıdan yukarı çekilen fib)
    const fib618 = swingHigh - (diff * 0.618); // Altın Oran (Golden Pocket)
    const fib382 = swingHigh - (diff * 0.382);
    const fib786 = swingHigh - (diff * 0.786);

    let activeLevel = "N/A";
    let activeValue = 0;

    // Fiyat hangi Fib seviyesine daha yakın? (Sadece otonom analiz için bilgi amaçlı)
    if (Math.abs(currentPrice - fib618) / currentPrice < 0.005) { activeLevel = "0.618 (Golden Pocket)"; activeValue = fib618; }
    else if (Math.abs(currentPrice - fib382) / currentPrice < 0.005) { activeLevel = "0.382"; activeValue = fib382; }
    else if (Math.abs(currentPrice - fib786) / currentPrice < 0.005) { activeLevel = "0.786"; activeValue = fib786; }

    tradeSetup.fibonacci = { level: activeLevel, value: activeValue.toFixed(2) };
}

/**
 * 4. PREMIUM: Elliott Wave Algoritması (Basitleştirilmiş)
 */
function calculateElliottWave() {
    if (priceHistory.length < 20) return;

    // Fiyatın hareket yönüne göre dalga tespiti (Mock/Heuristic Logic)
    // Gerçek bir Elliott Wave çok karmaşıktır, burada fiyatsal ivme ve CVD ile tespit yapıyoruz.
    if (currentPrice > priceHistory[priceHistory.length - 10] && cumulativeVolumeDelta > 20) {
        tradeSetup.elliott = { wave: "Wave 3 (Impulse)", description: "Güçlü yükseliş dalgası. Trend takip ediliyor." };
    } else if (currentPrice < priceHistory[priceHistory.length - 5] && tradeSetup.elliott.wave.includes("Wave 3")) {
        tradeSetup.elliott = { wave: "Wave 4 (Correction)", description: "Düzeltme dalgası. Golden Pocket aranıyor." };
    } else if (currentPrice > swingHigh) {
        tradeSetup.elliott = { wave: "Wave 5 (Final)", description: "Son yükseliş dalgası. Uyumsuzluk/Reddedilme riski yüksek." };
    } else {
        tradeSetup.elliott = { wave: "Konsolidasyon", description: "Net bir Elliott dalgası oluşmadı." };
    }
}

/**
 * 5. YAPAY ZEKA DESTEKLİ RİSK YÖNETİMİ (Fibonacci Destekli)
 */
function calculateRiskManagement(score) {
    if (currentPrice === 0 || bestAsk === 0 || bestBid === 0) return;

    calculateFibonacci();
    calculateElliottWave();

    let isGoldenPocket = tradeSetup.fibonacci.level.includes("0.618");

    if (score >= 70 && cumulativeVolumeDelta > 0) {
        tradeSetup.active = true;
        tradeSetup.direction = "BULLISH (LONG)";
        tradeSetup.entryPrice = currentPrice;
        
        // SL: Normalde Alış duvarının altıydı, şimdi Fib 0.786'nın da altı kontrol ediliyor
        let baseSL = bestBid * 0.998;
        tradeSetup.sl = isGoldenPocket ? Math.min(baseSL, tradeSetup.fibonacci.value * 0.995) : baseSL;
        
        tradeSetup.tp1 = bestAsk * 0.999;
        tradeSetup.tp2 = bestAsk * 1.01;

        let risk = tradeSetup.entryPrice - tradeSetup.sl;
        let reward = tradeSetup.tp1 - tradeSetup.entryPrice;
        let rrRatio = (reward / risk).toFixed(1);
        tradeSetup.rr = `1 : ${rrRatio}`;

    } else if (score <= 30 && cumulativeVolumeDelta < 0) {
        tradeSetup.active = true;
        tradeSetup.direction = "BEARISH (SHORT)";
        tradeSetup.entryPrice = currentPrice;
        
        tradeSetup.sl = bestAsk * 1.002;
        tradeSetup.tp1 = bestBid * 1.001;
        tradeSetup.tp2 = bestBid * 0.99;

        let risk = tradeSetup.sl - tradeSetup.entryPrice;
        let reward = tradeSetup.entryPrice - tradeSetup.tp1;
        let rrRatio = (reward / risk).toFixed(1);
        tradeSetup.rr = `1 : ${rrRatio}`;

    } else {
        if (tradeSetup.active && Math.abs(currentPrice - tradeSetup.entryPrice) / currentPrice > 0.02) {
             tradeSetup.active = false;
             tradeSetup.direction = "NONE";
             tradeSetup.rr = "0 : 0";
        }
    }
}

/**
 * 6. APEX-Q SCORING MOTORU (BEYİN)
 */
setInterval(async () => {
    if (currentPrice === 0) return;

    let score = 50;

    if (cumulativeVolumeDelta > 15) score += 20;
    else if (cumulativeVolumeDelta > 5) score += 10;
    else if (cumulativeVolumeDelta < -15) score -= 20;
    else if (cumulativeVolumeDelta < -5) score -= 10;

    if (bidVolume > askVolume * 2) score += 15;
    if (askVolume > bidVolume * 2) score -= 15;

    if (currentPrice > bestBid && (currentPrice - bestBid) < 10) score += 5;
    if (currentPrice < bestAsk && (bestAsk - currentPrice) < 10) score -= 5;

    // Fibonacci Confluence Bonusu (Fiyat Golden Pocket'a denk gelirse ek puan)
    if (tradeSetup.fibonacci && tradeSetup.fibonacci.level.includes("0.618")) {
        score += 10; 
    }

    score = Math.max(0, Math.min(100, score));

    let signalText = "NEUTRAL ⚪";
    if (score >= 80) signalText = "STRONG BUY 🟢";
    else if (score >= 60) signalText = "BUY 📈";
    else if (score <= 20) signalText = "STRONG SELL 🔴";
    else if (score <= 40) signalText = "SELL 📉";

    calculateRiskManagement(score);

    const payload = {
        symbol: "BTC",
        timestamp: Date.now(),
        price: currentPrice.toFixed(2),
        signal: signalText,
        apex_score: score,
        cvd: cumulativeVolumeDelta.toFixed(2),
        orderbook: {
            ask_wall: { price: bestAsk, volume: askVolume.toFixed(1) },
            bid_wall: { price: bestBid, volume: bidVolume.toFixed(1) }
        },
        mtf: mtfTrends,
        analysis: tradeSetup
    };

    await redisClient.setEx('apex_terminal_btc', 2, JSON.stringify(payload));
    
    // Log formatı
    process.stdout.write(`[FAZ-5 Premium] $${payload.price} | Score: ${score} | CVD: ${payload.cvd} | Fib: ${tradeSetup.fibonacci.level} | Wave: ${tradeSetup.elliott.wave.split(" ")[0]}\r`);

}, 1000);

console.log("🚀 APEX-Q Premium (FAZ 5 - Fibonacci & Elliott Wave Modülleri) Başlatıldı...");