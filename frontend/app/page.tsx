"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { TrendingUp, TrendingDown, Activity, AlertTriangle, Timer, Layers, RefreshCcw, Target, ShieldAlert, Zap, Wallet, PlayCircle, BarChart2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const [data, setData] = useState<any>(null);
  const [tradeData, setTradeData] = useState<any>(null); // Bakiye & Açık Pozisyonlar
  const [error, setError] = useState(false);
  const [activeMode, setActiveMode] = useState("SCALP");
  const [candleCountdown, setCandleCountdown] = useState("--:--");
  const [refreshCountdown, setRefreshCountdown] = useState(1);
  const [isExecuting, setIsExecuting] = useState(false); // Otonom Buton Durumu

  // Mum Kapanış Sayacı
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      if (activeMode === "SWING") {
        const hoursLeft = 23 - now.getUTCHours();
        const minutesLeft = 59 - now.getUTCMinutes();
        const secondsLeft = 59 - now.getUTCSeconds();
        setCandleCountdown(`${hoursLeft}h ${minutesLeft}m ${secondsLeft}s`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeMode]);

  // Polling (Canlı Veri & Bakiye Okuma)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get("http://localhost:3005/api/v1/terminal/scalp/btc");
        setData(response.data);

        // Canlı Bakiye (Live Trade API)
        const tradeResponse = await axios.get("http://localhost:3005/api/v1/trade/portfolio");
        setTradeData(tradeResponse.data);

        setError(false);
      } catch (e) {
        setError(true);
      }
    };

    fetchData();
    const interval = setInterval(() => {
      fetchData();
      setRefreshCountdown(1);
    }, 1000);

    const msInterval = setInterval(() => {
      setRefreshCountdown((prev) => (prev > 0 ? prev - 0.1 : 0));
    }, 100);

    return () => {
      clearInterval(interval);
      clearInterval(msInterval);
    };
  }, []);

  // Kullanıcının veya Yapay Zekanın emri anında borsaya iletmesi (Otonom Tuş)
  const executeOtonomTrade = async () => {
    if (!data || !data.analysis || data.analysis.direction === "NONE") {
        alert("GEÇERLİ BİR SİNYAL VEYA HEDEF YOK (Konsolidasyon Süreci)");
        return;
    }

    setIsExecuting(true);
    
    try {
        const response = await axios.post("http://localhost:3005/api/v1/trade/execute", {
            symbol: "BTC/USDT",
            side: data.analysis.direction.includes("LONG") ? "BUY" : "SELL",
            type: "market",
            amount: 0.1, // Örnek %2 Portföy Risk Miktarı
            price: data.analysis.entryPrice,
            sl: data.analysis.sl,
            tp1: data.analysis.tp1,
            tp2: data.analysis.tp2
        });

        alert(`BİNANCE EMRİ İLETİLDİ!\n${response.data.message}`);
    } catch (e: any) {
        alert("EMİR HATA: " + e.message);
    } finally {
        setIsExecuting(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#0B0F19] text-white flex flex-col items-center justify-center font-mono">
        <AlertTriangle className="text-red-500 w-16 h-16 mb-4 animate-pulse" />
        <h1 className="text-2xl font-bold tracking-widest text-slate-400">APEX-Q TERMINAL OFFLINE</h1>
        <p className="text-slate-600 mt-2">API Bağlantısı Koptu Veya Veri Bekleniyor...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0B0F19] text-white flex items-center justify-center font-mono">
        <div className="animate-pulse text-slate-500">APEX-Q QUANT MOTORU BAŞLATILIYOR...</div>
      </div>
    );
  }

  // Faz-4 ve Faz-5'ten gelen Risk ve Premium Modül Verileri
  const analysis = data.analysis; 
  const isBuy = data.signal.includes("BUY");
  const isNeutral = data.signal.includes("NEUTRAL");
  const scoreColor = isBuy ? "text-[#00E676]" : isNeutral ? "text-slate-400" : "text-[#FF1744]";
  const signalIcon = isBuy ? <TrendingUp className="w-12 h-12" /> : isNeutral ? <Activity className="w-12 h-12" /> : <TrendingDown className="w-12 h-12" />;

  const mtfScalp = [
    { tf: "1s", signal: "STRONG BUY", color: "bg-[#00E676] text-black" },
    { tf: "10s", signal: "BUY", color: "bg-green-500/20 text-[#00E676] border border-[#00E676]/30" },
    { tf: "30s", signal: "BUY", color: "bg-green-500/20 text-[#00E676] border border-[#00E676]/30" },
    { tf: "1m", signal: data.signal.replace(/[^A-Z ]/g, ''), color: isBuy ? "bg-[#00E676] text-black" : isNeutral ? "bg-slate-700 text-white" : "bg-[#FF1744] text-white" },
    { tf: "5m", signal: "NEUTRAL", color: "bg-slate-800 text-slate-300 border border-slate-600" },
    { tf: "15m", signal: "SELL", color: "bg-red-500/20 text-[#FF1744] border border-[#FF1744]/30" },
    { tf: "1h", signal: "STRONG SELL", color: "bg-[#FF1744] text-white" },
  ];

  const mtfSwing = [
    { tf: "4h", signal: "SELL", color: "bg-red-500/20 text-[#FF1744] border border-[#FF1744]/30" },
    { tf: "1D", signal: "STRONG BUY", color: "bg-[#00E676] text-black" },
    { tf: "3D", signal: "BUY", color: "bg-green-500/20 text-[#00E676] border border-[#00E676]/30" },
    { tf: "1W", signal: "BUY", color: "bg-green-500/20 text-[#00E676] border border-[#00E676]/30" },
    { tf: "1M", signal: "NEUTRAL", color: "bg-slate-800 text-slate-300 border border-slate-600" },
  ];

  const activeMtf = activeMode === "SCALP" ? mtfScalp : activeMode === "SWING" ? mtfSwing : [];

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-300 p-6 font-mono flex flex-col">
      
      {/* HEADER & PORTFOLIO */}
      <header className="flex flex-col xl:flex-row justify-between items-center mb-6 gap-6">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <h1 className="text-3xl font-black text-white tracking-[0.2em]">APEX-Q</h1>
          
          <div className="flex bg-[#151C2C] rounded-lg p-1 border border-slate-800 shadow-lg">
            {["SCALP", "SWING", "LIVE TRADE"].map((mode) => (
              <button
                key={mode}
                onClick={() => setActiveMode(mode)}
                className={`px-6 py-2 rounded-md text-sm tracking-widest font-bold transition-all ${
                  activeMode === mode 
                    ? "bg-[#2563EB] text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]" 
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* CANLI PORTFÖY (MOCK VEYA GERÇEK) */}
        {tradeData && (
          <div className="flex items-center gap-4 bg-[#151C2C] border border-blue-900/50 p-2 rounded-lg">
              <Wallet className="w-5 h-5 text-blue-400 ml-2" />
              <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 font-bold tracking-widest">TOTAL BALANCE</span>
                  <span className="text-sm text-white font-black">${tradeData.balance.total.toLocaleString()}</span>
              </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#1A1525] px-4 py-2 rounded-lg border border-purple-900/50 text-purple-400">
            <RefreshCcw className={`w-4 h-4 ${refreshCountdown < 0.2 ? 'animate-spin text-purple-300' : ''}`} />
            <span className="text-xs font-bold tracking-widest">NEXT UPDATE:</span>
            <span className="text-sm font-black text-white w-8 text-right">{refreshCountdown.toFixed(1)}s</span>
          </div>

          {activeMode === "SWING" && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 bg-[#151C2C] px-4 py-2 rounded-lg border border-slate-800 text-slate-400"
            >
              <Timer className="w-4 h-4 text-[#00E676]" />
              <span className="text-xs font-bold tracking-widest">CANDLE CLOSE:</span>
              <span className="text-sm font-black text-white w-24 text-right">{candleCountdown}</span>
            </motion.div>
          )}

          <div className="flex items-center gap-3 bg-[#151C2C] px-4 py-2 rounded-full border border-slate-800">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00E676]"></span>
            </span>
            <span className="text-sm tracking-wider font-bold text-white">LIVE: BTC/USDT</span>
          </div>
        </div>
      </header>

      {/* MULTI-TIMEFRAME (MTF) TOP BANNER */}
      {activeMode !== "LIVE TRADE" && (
        <div className="w-full bg-[#151C2C] border border-slate-800 rounded-xl p-4 mb-8 flex flex-col md:flex-row items-center gap-4 shadow-lg transition-all duration-300">
          <div className="flex items-center gap-2 text-slate-400 border-r border-slate-700 pr-4 min-w-[120px]">
            <Layers className="w-5 h-5" />
            <span className="text-xs font-bold tracking-widest">{activeMode} MTF</span>
          </div>
          
          <div className="flex w-full justify-start items-center overflow-x-auto pb-2 md:pb-0 gap-3 px-2">
            {activeMtf.map((item, index) => (
              <motion.div 
                key={item.tf}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="flex flex-col items-center justify-center min-w-[80px]"
              >
                <span className="text-slate-500 text-xs font-bold mb-1">{item.tf}</span>
                <div className={`px-3 py-1.5 rounded text-[10px] font-black tracking-wider w-full text-center whitespace-nowrap ${item.color} shadow-sm`}>
                  {item.signal}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ANA İÇERİK EKRANI */}
      {activeMode === "LIVE TRADE" ? (
        // YAPAY ZEKA OTONOM (FAZ-4) & CANLI İŞLEM PANELİ
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {/* AI Sentez & Otonom Tetik Paneli */}
          <div className="bg-[#151C2C] p-6 rounded-xl border border-slate-800 shadow-2xl flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-500" />
            <div className="flex items-center gap-3 mb-6">
              <Zap className="w-6 h-6 text-blue-500" />
              <h2 className="text-slate-400 font-bold tracking-widest text-sm">AI ALGORITHMIC TRADE</h2>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              Aşağıdaki buton, Faz-4 Kuantum Motoru'nun Likidite Duvarlarına ve FVG Boşluklarına göre hazırladığı R:R kurulumunu (Setup) doğrudan Binance API'ye (Market Order olarak) iletir.
            </p>
            <div className={`mt-auto mb-4 border rounded-lg p-4 ${analysis.direction.includes("LONG") ? 'bg-green-900/20 border-green-500/30' : analysis.direction.includes("SHORT") ? 'bg-red-900/20 border-red-500/30' : 'bg-slate-900/20 border-slate-600'}`}>
              <span className="text-xs font-bold block mb-1">OTONOM KARAR:</span>
              <span className={`text-xl font-black ${analysis.direction.includes("LONG") ? 'text-[#00E676]' : analysis.direction.includes("SHORT") ? 'text-[#FF1744]' : 'text-slate-500'}`}>
                  {analysis.direction}
              </span>
            </div>

            <button 
                onClick={executeOtonomTrade}
                disabled={isExecuting || analysis.direction === "NONE"}
                className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-black tracking-widest transition-all ${
                    analysis.direction === "NONE" 
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
                }`}
            >
                {isExecuting ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-6 h-6" />}
                EXECUTE SETUP ON BINANCE
            </button>
          </div>

          {/* Motorun Anlık (Live) Setup'ı Paneli */}
          <div className="bg-[#151C2C] p-6 rounded-xl border border-slate-800 shadow-2xl flex flex-col relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1 ${analysis.direction.includes("LONG") ? 'bg-[#00E676]' : 'bg-[#FF1744]'}`} />
            <div className="flex items-center gap-3 mb-6">
              <Target className={`w-6 h-6 ${analysis.direction.includes("LONG") ? 'text-[#00E676]' : 'text-[#FF1744]'}`} />
              <h2 className="text-slate-400 font-bold tracking-widest text-sm">LIVE QUANT SETUP</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-[#0B0F19] p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-xs font-bold">ENTRY (Motorun Fiyatı)</span>
                <span className="text-white font-bold">${parseFloat(analysis.entryPrice).toLocaleString('en-US')}</span>
              </div>
              <div className="flex justify-between items-center bg-green-900/10 p-3 rounded-lg border border-green-900/30">
                <span className="text-green-500 text-xs font-bold">TP1 (Direnç Öncesi)</span>
                <span className="text-green-400 font-bold">${parseFloat(analysis.tp1).toLocaleString('en-US')}</span>
              </div>
              <div className="flex justify-between items-center bg-green-900/20 p-3 rounded-lg border border-green-500/30">
                <span className="text-green-500 text-xs font-bold">TP2 (Likidite Boşluğu)</span>
                <span className="text-green-400 font-bold">${parseFloat(analysis.tp2).toLocaleString('en-US')}</span>
              </div>
            </div>
          </div>

          {/* Risk Yönetimi Paneli */}
          <div className="bg-[#151C2C] p-6 rounded-xl border border-slate-800 shadow-2xl flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#FF1744]" />
            <div className="flex items-center gap-3 mb-6">
              <ShieldAlert className="w-6 h-6 text-[#FF1744]" />
              <h2 className="text-slate-400 font-bold tracking-widest text-sm">RISK MANAGEMENT</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-red-900/10 p-3 rounded-lg border border-red-900/30">
                <span className="text-red-500 text-xs font-bold">STOP LOSS (Likidite Altı)</span>
                <span className="text-red-400 font-bold">${parseFloat(analysis.sl).toLocaleString('en-US')}</span>
              </div>
              <div className="flex justify-between items-center bg-[#0B0F19] p-3 rounded-lg border border-slate-800 mt-4">
                <span className="text-slate-500 text-xs font-bold">Risk / Reward (R:R)</span>
                <span className="text-amber-400 font-bold tracking-widest">{analysis.rr}</span>
              </div>
              <div className="flex justify-between items-center bg-[#0B0F19] p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-xs font-bold">Portföy Risk Payı</span>
                <span className="text-white font-bold">%{analysis.riskPercentage}</span>
              </div>
            </div>
          </div>

        </motion.div>
      ) : (
        // SCALP / SWING MODU EKRANI (Ana Grid)
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          
          {/* APEX SCORE TİLES */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-1 md:col-span-1 bg-[#151C2C] p-6 rounded-xl border border-slate-800 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden"
          >
            <div className={`absolute top-0 w-full h-2 ${isBuy ? 'bg-[#00E676]' : isNeutral ? 'bg-slate-500' : 'bg-[#FF1744]'}`} />
            <h2 className="text-slate-500 text-sm tracking-widest font-bold mb-4">{activeMode} SCORE</h2>
            
            <div className={`mb-2 ${scoreColor}`}>
              {signalIcon}
            </div>
            
            <motion.div 
              key={data.apex_score}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`text-8xl font-black tracking-tighter ${scoreColor}`}
            >
              {data.apex_score}
            </motion.div>
            
            <div className="mt-4 text-2xl font-bold tracking-widest text-white">
              {data.signal.replace(/[^A-Z ]/g, '')}
            </div>
          </motion.div>

          {/* PRICE & CVD TİLES */}
          <div className="col-span-1 md:col-span-1 bg-[#151C2C] p-6 rounded-xl border border-slate-800 shadow-2xl flex flex-col justify-between">
            <div>
              <h2 className="text-slate-500 text-sm tracking-widest font-bold mb-6">PRICE ACTION (BTC)</h2>
              <div className="text-6xl font-black text-white tracking-tighter">
                ${parseFloat(data.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="mt-2 text-sm text-slate-500">Live Binance @kline_{activeMode === "SCALP" ? "1m" : "1d"}</div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-800">
              <h3 className="text-slate-500 text-xs tracking-widest mb-2">SMART MONEY CVD (DELTA)</h3>
              <div className={`text-4xl font-bold ${parseFloat(data.cvd) >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>
                {parseFloat(data.cvd) > 0 ? '+' : ''}{data.cvd} BTC
              </div>
            </div>
          </div>

          {/* FIBONACCI & ELLIOTT WAVE (PREMIUM FAZ-5) */}
          <div className="col-span-1 md:col-span-1 bg-[#151C2C] p-6 rounded-xl border border-slate-800 shadow-2xl flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
            <div>
              <div className="flex items-center gap-2 mb-6">
                <BarChart2 className="w-5 h-5 text-amber-500" />
                <h2 className="text-slate-400 text-sm tracking-widest font-bold">FIBONACCI & ELLIOTT</h2>
              </div>

              {/* Fibonacci Seviyesi */}
              <div className="bg-[#1A1525] border border-amber-900/30 p-3 rounded-lg mb-4">
                <div className="text-[10px] text-amber-500 font-bold tracking-widest mb-1">GOLDEN POCKET (FIB)</div>
                <div className="text-xl font-bold text-white mb-1">
                    {analysis.fibonacci ? analysis.fibonacci.level : "Hesaplanıyor..."}
                </div>
                <div className="text-sm text-amber-400/70">
                    Sınır: ${analysis.fibonacci && analysis.fibonacci.value > 0 ? parseFloat(analysis.fibonacci.value).toLocaleString('en-US') : "---"}
                </div>
              </div>
            </div>

            {/* Elliott Wave */}
            <div className="pt-4 border-t border-slate-800">
              <h3 className="text-slate-500 text-[10px] tracking-widest font-bold mb-2">ELLIOTT WAVE DETECTOR</h3>
              <div className="text-lg font-bold text-blue-400 mb-1">
                {analysis.elliott ? analysis.elliott.wave : "Tarama Yapılıyor..."}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {analysis.elliott ? analysis.elliott.description : "Piyasa hacim ivmesi hesaplanıyor, lütfen bekleyin."}
              </p>
            </div>
          </div>

          {/* ORDER BOOK WALLS */}
          <div className="col-span-1 md:col-span-1 bg-[#151C2C] p-6 rounded-xl border border-slate-800 shadow-2xl">
            <h2 className="text-slate-500 text-sm tracking-widest font-bold mb-6">ORDER BOOK WALLS</h2>
            
            <div className="space-y-6">
              <div className="bg-[#1A1215] border border-red-900/30 p-4 rounded-lg relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#FF1744]" />
                <div className="text-xs text-red-500 font-bold mb-1 tracking-widest">ASK WALL (RESISTANCE)</div>
                <div className="flex justify-between items-end">
                  <div className="text-2xl font-bold text-white">${parseFloat(data.orderbook.ask_wall.price).toLocaleString('en-US')}</div>
                  <div className="text-red-400 font-bold">{data.orderbook.ask_wall.volume} BTC</div>
                </div>
              </div>

              <div className="bg-[#121A15] border border-green-900/30 p-4 rounded-lg relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#00E676]" />
                <div className="text-xs text-green-500 font-bold mb-1 tracking-widest">BID WALL (SUPPORT)</div>
                <div className="flex justify-between items-end">
                  <div className="text-2xl font-bold text-white">${parseFloat(data.orderbook.bid_wall.price).toLocaleString('en-US')}</div>
                  <div className="text-green-400 font-bold">{data.orderbook.bid_wall.volume} BTC</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}