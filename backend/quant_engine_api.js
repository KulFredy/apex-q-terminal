/**
 * APEX-Q Quant Engine - Faz 4 (Risk Yönetimi, TP/SL, R:R ve MTF Simülasyonu)
 * Bu motor, Faz-1 ve Faz-2'deki canlı Binance verilerini alıp üzerine
 * akıllı Risk Yönetimi (TP1, TP2, SL) algoritmalarını ekler.
 */
const WebSocket = require('ws');
const redis = require('redis');
const axios = require('axios');

// Redis Bağlantısı (In-Memory Hızlı Veritabanı)
const redisClient = redis.createClient({
    url: 'redis://127.0.0.1:6379'
});

redisClient.on('error', (err) => console.log('Redis Hatası:', err));
redisClient.connect();

// Binance K-Line (Mum) Verileri İçin Değişkenler
const SYMBOL = 'btcusdt';
let currentPrice = 0;

// CVD (Smart Money) Hesaplaması
let cumulativeVolumeDelta = 0;
const CVD_RESET_THRESHOLD = 1000; // Her 1000 işlemde bir sıfırla (Scalp için)
let tradeCount = 0;

// Order Book (Emir Defteri)
let bestAsk = 0; // Satış Duvarı
let bestBid = 0; // Alış Duvarı
let askVolume = 0;
let bidVolume = 0;

// MTF (Çoklu Zaman Dilimi) ve Yön (Trend)
let mtfTrends = {
    "1m": "NEUTRAL",
    "15m": "NEUTRAL",
    "1h": "NEUTRAL",
    "4h": "NEUTRAL",
    "1d": "NEUTRAL"
};

// Risk Yönetimi (TP/SL) State
let tradeSetup = {
    active: false,
    direction: "NONE", // BULLISH veya BEARISH
    entryPrice: 0,
    tp1: 0,
    tp2: 0,
    sl: 0,
    rr: "0:0",
    riskPercentage: 2.0 // Portföyün %2'si
};

/**
 * 1. Binance Canlı İşlem (Trades) WebSocket - CVD Hesaplaması İçin
 */
const wsTrades = new WebSocket(`wss://stream.binance.com:9443/ws/${SYMBOL}@aggTrade`);
wsTrades.on('message', (data) => {
    const trade = JSON.parse(data);
    const price = parseFloat(trade.p);
    const qty = parseFloat(trade.q);
    const isBuyerMaker = trade.m; // Piyasa yapıcı alıcı mı? (Eğer evetse, piyasa satışı demektir)

    currentPrice = price;

    // Delta hesaplaması: Alış hacmi (+), Satış hacmi (-)
    if (isBuyerMaker) {
        cumulativeVolumeDelta -= qty; // Satış
    } else {
        cumulativeVolumeDelta += qty; // Alış
    }

    tradeCount++;
    if (tradeCount >= CVD_RESET_THRESHOLD) {
        cumulativeVolumeDelta = 0; // Mikro-trend için sıfırla
        tradeCount = 0;
    }
});

/**
 * 2. Binance Emir Defteri (Order Book Heatmap) WebSocket - Likidite Duvarları İçin
 */
const wsDepth = new WebSocket(`wss://stream.binance.com:9443/ws/${SYMBOL}@depth10@100ms`);
wsDepth.on('message', (data) => {
    const depth = JSON.parse(data);
    if (!depth.bids || !depth.asks) return;

    // En güçlü Alış Duvarı (Destek)
    let maxBidVol = 0;
    let bestBidPrice = 0;
    depth.bids.forEach(bid => {
        let vol = parseFloat(bid[1]);
        if (vol > maxBidVol) {
            maxBidVol = vol;
            bestBidPrice = parseFloat(bid[0]);
        }
    });

    // En güçlü Satış Duvarı (Direnç)
    let maxAskVol = 0;
    let bestAskPrice = 0;
    depth.asks.forEach(ask => {
        let vol = parseFloat(ask[1]);
        if (vol > maxAskVol) {
            maxAskVol = vol;
            bestAskPrice = parseFloat(ask[0]);
        }
    });

    bestBid = bestBidPrice;
    bidVolume = maxBidVol;
    bestAsk = bestAskPrice;
    askVolume = maxAskVol;
});

/**
 * 3. Çoklu Zaman Dilimi (MTF) Trend Analizi Simülasyonu
 * (Faz 5'te REST API ile gerçek 4h ve 1D Binance verileri bağlanacak)
 */
function updateMTFTrends() {
    // Şimdilik 1m (Scalp) trendini CVD'ye ve OrderBook'a göre belirliyoruz
    if (cumulativeVolumeDelta > 10 && bidVolume > askVolume * 1.5) {
        mtfTrends["1m"] = "STRONG BUY";
    } else if (cumulativeVolumeDelta < -10 && askVolume > bidVolume * 1.5) {
        mtfTrends["1m"] = "STRONG SELL";
    } else {
        mtfTrends["1m"] = "NEUTRAL";
    }
}

/**
 * 4. YAPAY ZEKA DESTEKLİ RİSK YÖNETİMİ & TP/SL HESAPLAMA MATEMATİĞİ
 * Bu fonksiyon, fiyatı, FVG'leri (boşlukları) ve Likidite Duvarlarını kullanarak
 * Otonom Trade Setup'ı hesaplar.
 */
function calculateRiskManagement(score) {
    if (currentPrice === 0 || bestAsk === 0 || bestBid === 0) return;

    // Sinyal oluşumu (Örnek: Skor 70 üstü veya CVD çok güçlüyse Long/Buy)
    if (score >= 70 && cumulativeVolumeDelta > 0) {
        tradeSetup.active = true;
        tradeSetup.direction = "BULLISH (LONG)";
        tradeSetup.entryPrice = currentPrice;
        
        // SL (Stop Loss): En güçlü alış duvarının hemen altı
        tradeSetup.sl = bestBid * 0.998; 
        
        // TP1: En güçlü satış duvarının hemen altı
        tradeSetup.tp1 = bestAsk * 0.999;
        
        // TP2: Satış duvarı kırılırsa +%1 likidite boşluğu hedefi
        tradeSetup.tp2 = bestAsk * 1.01;

        // Risk / Reward (R:R) Hesaplama
        let risk = tradeSetup.entryPrice - tradeSetup.sl;
        let reward = tradeSetup.tp1 - tradeSetup.entryPrice;
        let rrRatio = (reward / risk).toFixed(1);
        tradeSetup.rr = `1 : ${rrRatio}`;

    } else if (score <= 30 && cumulativeVolumeDelta < 0) {
        tradeSetup.active = true;
        tradeSetup.direction = "BEARISH (SHORT)";
        tradeSetup.entryPrice = currentPrice;
        
        // SL: Satış duvarının üstü
        tradeSetup.sl = bestAsk * 1.002;
        
        // TP1: Alış duvarının üstü
        tradeSetup.tp1 = bestBid * 1.001;
        
        // TP2: Destek kırılırsa -%1 aşağısı
        tradeSetup.tp2 = bestBid * 0.99;

        // R:R
        let risk = tradeSetup.sl - tradeSetup.entryPrice;
        let reward = tradeSetup.entryPrice - tradeSetup.tp1;
        let rrRatio = (reward / risk).toFixed(1);
        tradeSetup.rr = `1 : ${rrRatio}`;

    } else {
        // İşlem İptal (Konsolidasyon/Kararsızlık)
        // Eğer eski setup çok geride kaldıysa sıfırla
        if (tradeSetup.active && Math.abs(currentPrice - tradeSetup.entryPrice) / currentPrice > 0.02) {
             tradeSetup.active = false;
             tradeSetup.direction = "NONE";
             tradeSetup.rr = "0 : 0";
        }
    }
}

/**
 * 5. APEX-Q SCORING MOTORU (BEYİN)
 */
setInterval(async () => {
    if (currentPrice === 0) return;

    let score = 50; // Nötr başlangıç

    // Kural 1: CVD (Akıllı Para Akışı)
    if (cumulativeVolumeDelta > 15) score += 20;
    else if (cumulativeVolumeDelta > 5) score += 10;
    else if (cumulativeVolumeDelta < -15) score -= 20;
    else if (cumulativeVolumeDelta < -5) score -= 10;

    // Kural 2: Order Book Baskısı
    if (bidVolume > askVolume * 2) score += 15; // Devasa alım duvarı
    if (askVolume > bidVolume * 2) score -= 15; // Devasa satış duvarı

    // Kural 3: Fiyatın duvarlara olan mesafesi
    if (currentPrice > bestBid && (currentPrice - bestBid) < 10) score += 5; // Desteğe yapıştı (Sıçrama)
    if (currentPrice < bestAsk && (bestAsk - currentPrice) < 10) score -= 5; // Dirence çarptı (Red)

    // Sınırlandırma (0 - 100)
    score = Math.max(0, Math.min(100, score));

    // Karar Metni
    let signalText = "NEUTRAL ⚪";
    if (score >= 80) signalText = "STRONG BUY 🟢";
    else if (score >= 60) signalText = "BUY 📈";
    else if (score <= 20) signalText = "STRONG SELL 🔴";
    else if (score <= 40) signalText = "SELL 📉";

    // MTF ve Risk Parametrelerini Güncelle
    updateMTFTrends();
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

    // Redis'e (RAM'e) Kaydet (Anahtarı 2 saniye ömürlü yapıyoruz ki hep taze kalsın)
    await redisClient.setEx('apex_terminal_btc', 2, JSON.stringify(payload));

    process.stdout.write(`[FAZ-4] ${signalText} | Fiyat: $${payload.price} | Skor: ${score} | CVD: ${payload.cvd} | AI: ${payload.analysis.direction} (R:R ${payload.analysis.rr})\r`);

}, 1000);

console.log("🚀 APEX-Q Quant Motoru (FAZ 4 - MTF & Risk Yönetimi) Başlatıldı...");