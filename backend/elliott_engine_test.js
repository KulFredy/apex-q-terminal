const ccxt = require('ccxt');

// Dinamik Pivot High/Low tarayıcısı
function getPivots(candles, leftLength, rightLength) {
    const pivots = [];
    for (let i = leftLength; i < candles.length - rightLength; i++) {
        let isHigh = true;
        let isLow = true;
        for (let j = i - leftLength; j <= i + rightLength; j++) {
            if (i === j) continue;
            if (candles[j][2] > candles[i][2]) isHigh = false;
            if (candles[j][3] < candles[i][3]) isLow = false;
        }
        if (isHigh) pivots.push({ index: i, time: candles[i][0] / 1000, price: candles[i][2], type: 'high' });
        if (isLow) pivots.push({ index: i, time: candles[i][0] / 1000, price: candles[i][3], type: 'low' });
    }
    return pivots;
}

// Elliott Wave (Motive Wave 1-2-3-4-5) Arayıcı
function findElliottWaves(pivots) {
    const waves = [];
    for (let i = 0; i < pivots.length - 5; i++) {
        const p0 = pivots[i];   
        const p1 = pivots[i+1]; 
        const p2 = pivots[i+2]; 
        const p3 = pivots[i+3]; 
        const p4 = pivots[i+4]; 
        const p5 = pivots[i+5]; 
        
        // Sadece DİP ile başlayan yükseliş dalgaları (Bullish Motive) arıyoruz
        if (p0.type !== 'low' || p1.type !== 'high' || p2.type !== 'low' || p3.type !== 'high' || p4.type !== 'low' || p5.type !== 'high') {
            continue;
        }

        // KURAL 1: Wave 2, Wave 1'in %100'ünü geri alamaz.
        if (p2.price <= p0.price) continue;
        
        // KURAL 2: Wave 3, Wave 1'in tepesinden yüksek olmalı.
        if (p3.price <= p1.price) continue;

        // KURAL 3: Wave 4, Wave 1'in tepesiyle (fiyat bölgesinde) kesişemez.
        if (p4.price <= p1.price) continue;

        // KURAL 4: Wave 3, en kısa itki dalgası (1,3,5 arasında) Olamaz.
        const wave1Len = p1.price - p0.price;
        const wave3Len = p3.price - p2.price;
        const wave5Len = p5.price - p4.price;
        if (wave3Len < wave1Len && wave3Len < wave5Len) continue;

        // FİBONACCİ HESAPLAMALARI
        const wave2Retracement = (p1.price - p2.price) / wave1Len;
        const wave3Extension = wave3Len / wave1Len;
        const wave4Retracement = (p3.price - p4.price) / wave3Len;
        
        // ZAMAN HESAPLAMALARI (Zaman Döngüsü - Dalga Süreleri)
        const timeW1 = p1.time - p0.time;
        const timeW2 = p2.time - p1.time;
        const timeW3 = p3.time - p2.time;
        const timeW4 = p4.time - p3.time;
        const timeW5 = p5.time - p4.time;

        waves.push({
            points: [
                { label: '0', time: p0.time, price: p0.price },
                { label: '1', time: p1.time, price: p1.price },
                { label: '2', time: p2.time, price: p2.price },
                { label: '3', time: p3.time, price: p3.price },
                { label: '4', time: p4.time, price: p4.price },
                { label: '5', time: p5.time, price: p5.price }
            ],
            fibonacci: {
                wave2Retracement: wave2Retracement.toFixed(3),
                wave3Extension: wave3Extension.toFixed(3),
                wave4Retracement: wave4Retracement.toFixed(3)
            },
            timeRatios: {
                w2_vs_w1: (timeW2 / timeW1).toFixed(2),
                w4_vs_w3: (timeW4 / timeW3).toFixed(2),
                w5_vs_w1: (timeW5 / timeW1).toFixed(2)
            }
        });
    }
    return waves;
}

// CCXT üzerinden ana fonskiyon. Multi-Timeframe destekliyor.
async function analyzeElliott(symbol = 'BTC/USDT', timeframe = '1h', limit = 500) {
    const exchange = new ccxt.binance();
    try {
        const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
        
        // Zaman dilimine göre (MTF) dinamik pivot derinliği ataması (Daha büyük zaman dilimi, daha dar tarama)
        let pivotLength = 5;
        if (timeframe === '5m' || timeframe === '15m') pivotLength = 8;
        if (timeframe === '1d' || timeframe === '1w') pivotLength = 3;

        const pivots = getPivots(ohlcv, pivotLength, pivotLength);
        const waves = findElliottWaves(pivots);
        
        const candles = ohlcv.map(c => ({
            time: c[0] / 1000, 
            open: c[1], 
            high: c[2], 
            low: c[3], 
            close: c[4] 
        }));

        return {
            success: true,
            symbol,
            timeframe,
            pivotLength,
            totalWavesFound: waves.length,
            latestWave: waves.length > 0 ? waves[waves.length - 1] : null,
            candles: candles
        };

    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = { analyzeElliott };
