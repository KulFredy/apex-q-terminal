const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');
const ccxt = require('ccxt');

const app = express();
app.use(cors());
app.use(express.json());

const redis = createClient();
const PORT = 3005;

// Binance API Bağlantısı (Güvenli, çevre değişkenlerinden (veya şimdilik mock/test) alacak)
const exchange = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY || 'FATIH_TEST_KEY',
    secret: process.env.BINANCE_SECRET_KEY || 'FATIH_TEST_SECRET',
    enableRateLimit: true,
});

async function startServer() {
    await redis.connect();
    
    // Arka Planda Binance Quant Motorunu Başlat (Veriyi üreten dosyanın çalıştığını varsayıyoruz)
    console.log('[APEX-Q] Backend API Yayında! Port: 3005');

    // 1. Terminal Data Endpoint'i (Frontend burayı okuyor)
    app.get('/api/v1/terminal/scalp/:symbol', async (req, res) => {
        try {
            const data = await redis.get(`apex_terminal_btc`);
            if (!data) return res.status(404).json({ error: "No data available yet" });
            res.json(JSON.parse(data));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 2. LIVE TRADE PANEL (Bakiye, Açık Pozisyonlar) - FAZ 5
    app.get('/api/v1/trade/portfolio', async (req, res) => {
        try {
            // Test/Mock Mode (API Key girilmemişse sahte veri döner)
            if (exchange.apiKey === 'FATIH_TEST_KEY') {
                return res.json({
                    balance: { total: 10540.50, available: 8500.00, currency: "USDT" },
                    positions: [
                        { symbol: "BTC/USDT", side: "LONG", entryPrice: 74200.50, currentPrice: 75760.00, pnl: "+$125.40", pnlPercent: "+2.1%" }
                    ]
                });
            }

            const balance = await exchange.fetchBalance();
            const positions = await exchange.fetchPositions(); // Futures API gerekir
            
            res.json({
                balance: { 
                    total: balance.USDT.total, 
                    available: balance.USDT.free, 
                    currency: "USDT" 
                },
                positions: positions.filter(p => p.contracts > 0).map(p => ({
                    symbol: p.symbol,
                    side: p.side === 'long' ? "LONG" : "SHORT",
                    entryPrice: p.entryPrice,
                    currentPrice: p.markPrice,
                    pnl: p.unrealizedPnl,
                    pnlPercent: p.percentage
                }))
            });
        } catch (e) {
            res.status(500).json({ error: "Binance API Hatası: " + e.message });
        }
    });

    // 3. Otonom / Manuel Emir Gönderme (Live Trade) - FAZ 5
    app.post('/api/v1/trade/execute', async (req, res) => {
        try {
            const { symbol, side, amount, type, price, sl, tp1, tp2 } = req.body;

            console.log(`[TRADE EMİR] ${side} ${amount} ${symbol} @ ${price} (SL: ${sl} / TP: ${tp1})`);

            if (exchange.apiKey === 'FATIH_TEST_KEY') {
                return res.json({ success: true, message: "MOCK EMİR BAŞARIYLA İLETİLDİ (TEST MODU)", orderId: "123456789" });
            }

            // Gerçek Binance Market/Limit Emri
            let order;
            if (type === 'market') {
                order = await exchange.createMarketOrder(symbol, side.toLowerCase(), amount);
            } else {
                order = await exchange.createLimitOrder(symbol, side.toLowerCase(), amount, price);
            }

            // Stop Loss & Take Profit Emirlerini (OCO) Geliştirebiliriz...
            
            res.json({ success: true, message: "GERÇEK EMİR İLETİLDİ", order: order });
        } catch (e) {
            res.status(500).json({ error: "Emir İletilemedi: " + e.message });
        }
    });

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[APEX-Q] Binance Trade (CCXT) modülü aktif.`);
    });
}

startServer();app.post('/api/v1/trade/start-auto', async (req, res) => {
    try {
        const { botName, exchange, marketPair, apiSecret, apiToken, riskLevel, stopLoss, takeProfit } = req.body;
        console.log(`[AUTO TRADE BOT] Bot '${botName}' başlatılıyor... Borsası: ${exchange}, Market: ${marketPair}, Risk: ${riskLevel}%, SL: ${stopLoss}%, TP: ${takeProfit}%`);
        // Burada gerçek Auto Trade motorunu başlatan kodlar olacak. Şimdilik mock dönüyoruz.
        res.json({ success: true, message: `Bot '${botName}' başarıyla aktif edildi ve izlemeye alındı.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
