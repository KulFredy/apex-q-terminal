
const ccxt = require('ccxt');
const { RSI, MACD, OBV } = require('technicalindicators');


function validateImpulse(p0, p1, p2, p3, p4, p5, isBullish) {
    if (isBullish) {
        // Rule 1: W2 cannot retrace > 100% of W1
        if (p2.price <= p0.price) return false;
        
        // Rule 3: W4 cannot overlap W1 price territory (unless diagonal, but we strictly check impulse)
        if (p4.price <= p1.price) return false;
        
        // Rule 2: W3 cannot be shortest of W1, W3, W5
        const w1Len = p1.price - p0.price;
        const w3Len = p3.price - p2.price;
        const w5Len = p5.price - p4.price;
        if (w3Len < w1Len && w3Len < w5Len) return false;
        
    } else {
        // Rule 1: W2 cannot retrace > 100% of W1
        if (p2.price >= p0.price) return false;
        
        // Rule 3: W4 cannot overlap W1 price territory
        if (p4.price >= p1.price) return false;
        
        // Rule 2: W3 cannot be shortest of W1, W3, W5
        const w1Len = Math.abs(p1.price - p0.price);
        const w3Len = Math.abs(p3.price - p2.price);
        const w5Len = Math.abs(p5.price - p4.price);
        if (w3Len < w1Len && w3Len < w5Len) return false;
    }
    return true;
}

function getPivots(candles, leftLength = 8, rightLength = 5) {
    const pivots = [];
    for (let i = leftLength; i < candles.length - rightLength; i++) {
        let isHigh = true;
        let isLow = true;
        for (let j = i - leftLength; j <= i + rightLength; j++) {
            if (i === j) continue;
            if (candles[j].high > candles[i].high) isHigh = false;
            if (candles[j].low < candles[i].low) isLow = false;
        }
        if (isHigh) pivots.push({ index: i, time: candles[i].time, price: candles[i].high, type: 'high' });
        if (isLow)  pivots.push({ index: i, time: candles[i].time, price: candles[i].low, type: 'low' });
    }
    return pivots;
}

function filterAlternating(pivotsRaw) {
    if (pivotsRaw.length === 0) return [];
    pivotsRaw.sort((a, b) => a.index - b.index);
    const alt = [pivotsRaw[0]];
    for (let i = 1; i < pivotsRaw.length; i++) {
        const last = alt[alt.length - 1];
        if (pivotsRaw[i].type !== last.type) {
            alt.push(pivotsRaw[i]);
        } else {
            if (last.type === 'high' && pivotsRaw[i].price > last.price) alt[alt.length - 1] = pivotsRaw[i];
            else if (last.type === 'low' && pivotsRaw[i].price < last.price) alt[alt.length - 1] = pivotsRaw[i];
        }
    }
    return alt;
}

function calculateMomentumScore(candles, p3_index, p5_index) {
    if(p5_index < 20 || candles.length < p5_index) return { score: 50, divergence: false };
    
    const closes = candles.map(c => c.close);
    const rsi = RSI.calculate({ values: closes, period: 14 });
    
    let score = 50;
    let divergence = false;
    
    if (p3_index && p3_index < rsi.length && p5_index < rsi.length) {
        const p3_rsi = rsi[p3_index];
        const p5_rsi = rsi[p5_index];
        const p3_price = candles[p3_index].close;
        const p5_price = candles[p5_index].close;
        
        // Bearish Divergence (Fiyat daha yüksek tepe, RSI daha düşük tepe)
        if (p5_price > p3_price && p5_rsi < p3_rsi) {
            divergence = 'BEARISH_DIVERGENCE';
            score += 30;
        }
        // Bullish Divergence (Fiyat daha düşük dip, RSI daha yüksek dip)
        else if (p5_price < p3_price && p5_rsi > p3_rsi) {
            divergence = 'BULLISH_DIVERGENCE';
            score += 30;
        }
    }
    
    const currentRsi = rsi[rsi.length - 1];
    if(currentRsi < 30) score += 10;
    else if(currentRsi > 70) score += 10;
    
    return { score: Math.min(score, 100), divergence };
}

function calculateVolumeScore(candles, p4_index, p5_index) {
    if(p5_index < 10) return 50;
    return 65; 
}


function calculateFibConfluence(p0, p5) {
    const min = Math.min(p0, p5);
    const max = Math.max(p0, p5);
    const diff = max - min;
    
    // Basit bir Fib Confluence tespiti: 0.382, 0.5, 0.618 seviyeleri
    const levels = [
        min + diff * 0.382,
        min + diff * 0.5,
        min + diff * 0.618
    ];
    
    // Confluence Zone Heatmap için "sıcak" alanlar (0.618 en güçlü)
    return levels;
}

function findElliottWaves(pivotsRaw, candles) {
    const pivots = filterAlternating(pivotsRaw);
    const validWaves = [];
    const alternateWaves = [];
    const currentPrice = candles[candles.length - 1].close;
    
    for (let i = 0; i < pivots.length - 5; i++) {
        const p0 = pivots[i];   
        const p1 = pivots[i+1]; 
        const p2 = pivots[i+2]; 
        const p3 = pivots[i+3]; 
        const p4 = pivots[i+4]; 
        const p5 = pivots[i+5]; 
        
        const isBullish = p0.type === 'low' && p1.type === 'high';
        const isBearish = p0.type === 'high' && p1.type === 'low';

        if (!isBullish && !isBearish) continue;

        let rule1 = true;
        let rule2 = true;
        let rule3 = true;

        if (isBullish) {
            if (p2.price <= p0.price) rule1 = false;
            if (p4.price <= p1.price) rule3 = false;
            const w1Len = p1.price - p0.price;
            const w3Len = p3.price - p2.price;
            const w5Len = p5.price - p4.price;
            if (w3Len < w1Len && w3Len < w5Len) rule2 = false;
        } else {
            if (p2.price >= p0.price) rule1 = false;
            if (p4.price >= p1.price) rule3 = false;
            const w1Len = Math.abs(p1.price - p0.price);
            const w3Len = Math.abs(p3.price - p2.price);
            const w5Len = Math.abs(p5.price - p4.price);
            if (w3Len < w1Len && w3Len < w5Len) rule2 = false;
        }

        const isValid = validateImpulse(p0, p1, p2, p3, p4, p5, isBullish);

        const w1Len = Math.abs(p1.price - p0.price);
        const w2Len = Math.abs(p2.price - p1.price);
        const w3Len = Math.abs(p3.price - p2.price);
        const w4Len = Math.abs(p4.price - p3.price);

        const w2Retracement = w2Len / w1Len;
        const w3Extension = w3Len / w1Len;
        const w4Retracement = w4Len / w3Len;

        let projection = {};
        let tradeSetup = {};
        
        // BUGFIX 1 & 2: YÖN VE ENTRY ZONE
        if (isBullish) {
            projection.direction = 'SHORT'; // 5 dalgalı yükseliş (Bullish Motive) bitti, ABC aşağı (SHORT) düzeltme gelir.
            
            // W5 zirvesinden dönüş beklenir. Fiyat şu an W5 tepesinin altında (Düşüş başlamış)
            let entryMin = p5.price * 0.98;
            let entryMax = p5.price * 1.00;
            tradeSetup.entryZone = `${entryMin.toFixed(4)} - ${entryMax.toFixed(4)}`;
            tradeSetup.entryPrice = currentPrice;
            
            tradeSetup.stopLoss = p5.price * 1.02; // Geçersizlik: W5 tepesinin %2 üzeri (Kırarsa 5 uzuyor demektir)
            if(tradeSetup.stopLoss < currentPrice) tradeSetup.stopLoss = currentPrice * 1.02; // Hata payı (Zaten kırılmış)

            // TP'ler Fibonacci düzeltmesi (Mevcut düşüş için TP'ler Entry'den KÜÇÜK olmalıdır)
            tradeSetup.tp1 = p5.price - ((p5.price - p0.price) * 0.382);
            tradeSetup.tp2 = p5.price - ((p5.price - p0.price) * 0.5);
            tradeSetup.tp3 = p5.price - ((p5.price - p0.price) * 0.618);
            
            tradeSetup.riskReward = Math.abs(currentPrice - tradeSetup.tp2) / Math.abs(tradeSetup.stopLoss - currentPrice);
            tradeSetup.invalidationReason = `Fiyat ${tradeSetup.stopLoss.toFixed(2)} uzerine cikarsa, W5 uzamasi yasanir. Dusur iptal.`;
        } else {
            projection.direction = 'LONG'; // 5 dalgalı düşüş (Bearish Motive) bitti, ABC yukarı (LONG) tepki gelir.
            
            // W5 dibinden tepki beklenir. Fiyat şu an W5 dibinin üstünde (Tepki başlamış)
            let entryMin = p5.price * 1.00;
            let entryMax = p5.price * 1.02;
            tradeSetup.entryZone = `${entryMin.toFixed(4)} - ${entryMax.toFixed(4)}`;
            tradeSetup.entryPrice = currentPrice;
            
            tradeSetup.stopLoss = p5.price * 0.98; // Geçersizlik: W5 dibinin %2 altı (Kırarsa 5 uzuyor demektir)
            if(tradeSetup.stopLoss > currentPrice) tradeSetup.stopLoss = currentPrice * 0.98; // Hata payı (Zaten kırılmış)

            // TP'ler Fibonacci düzeltmesi (Mevcut yükseliş için TP'ler Entry'den BÜYÜK olmalıdır)
            tradeSetup.tp1 = p5.price + ((p0.price - p5.price) * 0.382);
            tradeSetup.tp2 = p5.price + ((p0.price - p5.price) * 0.5);
            tradeSetup.tp3 = p5.price + ((p0.price - p5.price) * 0.618);
            
            tradeSetup.riskReward = Math.abs(tradeSetup.tp2 - currentPrice) / Math.abs(currentPrice - tradeSetup.stopLoss);
            tradeSetup.invalidationReason = `Fiyat ${tradeSetup.stopLoss.toFixed(2)} altina duserse, yeni bir itki baslamistir. Tepki iptal.`;
        }
        
        // BUGFIX-1: LONG/SHORT MANTIK TUTARLILIK KONTROLU
        let logicValid = true;
        if (projection.direction === 'LONG' && !(tradeSetup.tp1 > currentPrice && currentPrice > tradeSetup.stopLoss)) logicValid = false;
        if (projection.direction === 'SHORT' && !(tradeSetup.tp1 < currentPrice && currentPrice < tradeSetup.stopLoss)) logicValid = false;

        // BUGFIX-3: R:R FILTRESI
        tradeSetup.isRecommended = tradeSetup.riskReward >= 1.5;

        const totalDuration = p5.index - p0.index; 
        projection.expectedDuration = Math.round(totalDuration * 0.618); 

        const structuralScore = (w3Extension >= 1.618 ? 30 : 10) + (w4Retracement <= 0.5 ? 20 : 10) + (w2Retracement >= 0.382 && w2Retracement <= 0.786 ? 30 : 10);
        const { score: momentumScore, divergence } = calculateMomentumScore(candles, p3.index, p5.index);
        const volumeScore = calculateVolumeScore(candles, p4.index, p5.index);
        
        const totalConfidence = Math.round((structuralScore * 0.5) + (momentumScore * 0.3) + (volumeScore * 0.2));

        const waveData = {
            type: isBullish ? 'BULLISH_MOTIVE_5' : 'BEARISH_MOTIVE_5',
            points: [
                { label: 0, price: p0.price, time: p0.time, index: p0.index },
                { label: 1, price: p1.price, time: p1.time, index: p1.index },
                { label: 2, price: p2.price, time: p2.time, index: p2.index },
                { label: 3, price: p3.price, time: p3.time, index: p3.index },
                { label: 4, price: p4.price, time: p4.time, index: p4.index },
                { label: 5, price: p5.price, time: p5.time, index: p5.index }
            ],
            rules: { rule1, rule2, rule3 },
            isValid: isValid && logicValid,
            logicValid,
            scores: {
                total: totalConfidence,
                structure: structuralScore,
                momentum: momentumScore,
                volume: volumeScore,
                mtf: 75 
            },
            divergence,
            projection,
            tradeSetup
        };

        if (isValid && logicValid) {
            validWaves.push(waveData);
        } else if (!rule3 && rule1 && rule2) {
            alternateWaves.push(waveData);
        }
    }

    return { 
        primaryWave: validWaves.length > 0 ? validWaves[validWaves.length - 1] : null, 
        alternateWave: alternateWaves.length > 0 ? alternateWaves[alternateWaves.length - 1] : null 
    };
}

async function analyzeElliott(symbol = 'BTC/USDT', timeframe = '1h', limit = 500) {
    const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
    try {
        let htf = '1d';
        if(timeframe === '1d' || timeframe === '1w') htf = '1w';
        else if (timeframe === '15m' || timeframe === '5m') htf = '4h';
        
        // BUGFIX: MTF MATRIX (Fetching multiple TFs)
        const tfs = ['15m', '1h', '4h', '1d'];
        const mtfPromises = tfs.map(tf => exchange.fetchOHLCV(symbol, tf, undefined, tf === timeframe ? limit : 100).catch(()=>[]));
        const results = await Promise.all(mtfPromises);
        
        const ohlcv = results[tfs.indexOf(timeframe)];
        
        let mtfMatrix = [];
        tfs.forEach((tf, idx) => {
            const data = results[idx];
            if(data && data.length > 50) {
                const closes = data.map(c => c[4]);
                const current = closes[closes.length-1];
                const sma = closes.slice(-50).reduce((a,b)=>a+b,0)/50;
                mtfMatrix.push({
                    tf: tf,
                    trend: current > sma ? 'UP' : 'DOWN',
                    signal: current > sma ? 'BUY' : 'SELL'
                });
            }
        });
        
        const candles = ohlcv.map((c, i) => ({ index: i, time: c[0] / 1000, open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] }));
        
        let pivotLength = 8;
        if (timeframe === '1d' || timeframe === '1w') pivotLength = 5;

        const pivots = getPivots(candles, pivotLength, pivotLength);
        const { primaryWave, alternateWave } = findElliottWaves(pivots, candles);
        
        const currentHtfTrend = mtfMatrix.find(m => m.tf === htf)?.trend === 'UP' ? 'BULLISH' : 'BEARISH';

        if (primaryWave) {
            if (primaryWave.projection.direction === 'LONG' && currentHtfTrend === 'BULLISH') primaryWave.scores.mtf = 90;
            else if (primaryWave.projection.direction === 'SHORT' && currentHtfTrend === 'BEARISH') primaryWave.scores.mtf = 90;
            else primaryWave.scores.mtf = 40;
            
            primaryWave.scores.total = Math.round((primaryWave.scores.structure * 0.4) + (primaryWave.scores.momentum * 0.2) + (primaryWave.scores.volume * 0.2) + (primaryWave.scores.mtf * 0.2));
        }

        return {
            success: true,
            symbol,
            timeframe,
            htf,
            htfTrend: currentHtfTrend,
            mtfMatrix,
            status: primaryWave ? "FOUND" : "NO_VALID_WAVE",
            latestWave: primaryWave,
            alternateWave: alternateWave,
            candles: candles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))
        };
    } catch (e) {
        throw e;
    }
}

module.exports = { analyzeElliott };
