const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');
const QuantEngineAPI = require('./quant_engine_api');

const app = express();
app.use(cors());

const redis = createClient();
const PORT = 3005;

async function startServer() {
    await redis.connect();
    
    // Arka Planda Binance Quant Motorunu Başlat
    const engine = new QuantEngineAPI('btc', '1m');
    await engine.init();
    console.log('[APEX-Q] Quant Motoru arka planda canlı verileri Redis e yazıyor...');

    // Frontend İçin Uç Nokta (API Endpoint)
    app.get('/api/v1/terminal/scalp/:symbol', async (req, res) => {
        try {
            const symbol = req.params.symbol.toLowerCase();
            const data = await redis.get(`apex:${symbol}:snapshot`);
            
            if (!data) return res.status(404).json({ error: "No data available yet" });
            res.json(JSON.parse(data));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.listen(PORT, () => {
        console.log(`[APEX-Q] Backend API Yayında! Port: ${PORT}`);
        console.log(`[TEST] http://localhost:${PORT}/api/v1/terminal/scalp/btc adresinden veriyi görebilirsiniz.`);
    });
}

startServer();