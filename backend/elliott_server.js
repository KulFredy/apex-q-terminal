const express = require('express');
const cors = require('cors');
const { analyzeElliott } = require('./elliott_engine');
const path = require('path');

const { formatTelegramMessage } = require("./telegram_formatter.js");
const app = express();
app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

// Root isteği elliott.html dosyasına yönlendir.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'elliott.html'));
});

app.get('/api/v1/elliott', async (req, res) => {
    const symbol = req.query.symbol || 'BTC/USDT';
    const timeframe = req.query.timeframe || '1h';
    
    console.log(`Scan request: ${symbol} at ${timeframe}`);
    let result;
    try { result = await analyzeElliott(symbol, timeframe, 500); }
    catch(e) { console.error(e); return res.status(500).json({ success: false, error: e.message }); }
    
    if (result.success) {
        res.json(result);
    } else {
        res.status(500).json(result);
    }
});


const ccxt = require('ccxt');
let activeSymbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT'];

async function updateSymbols() {
    try {
        const exchangeInst = new ccxt.binance({ options: { defaultType: 'future' } });
        const markets = await exchangeInst.loadMarkets();
        const symbols = Object.keys(markets).filter(s => (s.endsWith('/USDT:USDT') || s.endsWith('/USDT')) && markets[s].linear && markets[s].active);
        
        if (symbols.length > 0) {
            let cleanedSymbols = symbols.map(s => s.replace(':USDT', ''));
            cleanedSymbols = [...new Set(cleanedSymbols)];

            cleanedSymbols.sort((a, b) => {
                if (a === 'BTC/USDT') return -1;
                if (b === 'BTC/USDT') return 1;
                if (a === 'ETH/USDT') return -1;
                if (b === 'ETH/USDT') return 1;
                return a.localeCompare(b);
            });
            activeSymbols = cleanedSymbols;
            console.log(`[APEX-Q] Sembol listesi guncellendi: ${activeSymbols.length} aktif USDT Futures paritesi.`);
        }
    } catch (e) {
        console.error('[APEX-Q] Semboller guncellenirken hata:', e.message);
    }
}

updateSymbols();
setInterval(updateSymbols, 12 * 60 * 60 * 1000);

app.get('/api/v1/symbols', (req, res) => {
    res.json({ success: true, symbols: activeSymbols });
});

const PORT = 3005;

app.get('/api/v1/telegram', async (req, res) => {
    try {
        const { symbol, timeframe } = req.query;
        const result = await analyzeElliott(symbol || 'BTC/USDT', timeframe || '1h');
        const msg = formatTelegramMessage(result);
        res.type('text/plain');
        res.send(msg);
    } catch (e) {
        res.status(500).send("Error: " + e.message);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`APEX-Q Elliott Wave Server running on http://0.0.0.0:${PORT}`);
});


const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3006 });

const activeConnections = new Map(); // ws -> symbol

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const req = JSON.parse(message);
            if(req.action === 'subscribe') {
                activeConnections.set(ws, { symbol: req.symbol, timeframe: req.timeframe });
                // Send initial data immediately
                const data = await analyzeElliott(req.symbol, req.timeframe);
                ws.send(JSON.stringify({ type: 'analysis', data }));
            }
        } catch(e) {
            console.error('WS Error:', e);
        }
    });

    ws.on('close', () => {
        activeConnections.delete(ws);
    });
});

// Broadcast worker for subscribed clients
setInterval(async () => {
    for (const [ws, config] of activeConnections.entries()) {
        try {
            const data = await analyzeElliott(config.symbol, config.timeframe);
            ws.send(JSON.stringify({ type: 'analysis', data }));
        } catch(e) {
            console.log('WS Broadcast Error:', e.message);
        }
    }
}, 10000); // 10 saniyede bir analiz yenile (CCXT Rate limitlerini yormamak icin)

console.log("WebSocket Analytics Server running on port 3006");
