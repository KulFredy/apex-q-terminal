
function formatTelegramMessage(data) {
    if (!data || !data.latestWave) return "Geçerli bir Elliott dalgası bulunamadı.";
    const w = data.latestWave;
    const ts = w.tradeSetup;
    const dir = w.projection.direction;
    
    const slPercent = ((Math.abs(ts.stopLoss - ts.entryPrice) / ts.entryPrice) * 100).toFixed(1);
    const tp1Percent = ((Math.abs(ts.tp1 - ts.entryPrice) / ts.entryPrice) * 100).toFixed(1);
    const tp2Percent = ((Math.abs(ts.tp2 - ts.entryPrice) / ts.entryPrice) * 100).toFixed(1);
    
    const phase = dir === 'LONG' ? 'Dalga 5 düşüşü bitti → ABC tepkisi' : 'Dalga 5 yükselişi bitti → ABC düzeltmesi';
    const rrCheck = ts.isRecommended ? '✓' : '⚠️ Zayıf';
    const invDir = dir === 'LONG' ? 'altı' : 'üstü';

    const cleanSymbol = data.symbol.replace('/USDT', '');

    return `🎯 ${cleanSymbol} • ${data.timeframe} • ${dir}
━━━━━━━━━━━━━━━━━━
📍 Faz: ${phase}
🟢 Giriş: ${ts.entryZone}
🔴 SL: ${ts.stopLoss.toFixed(4)} (-%${slPercent})
🎯 TP1: ${ts.tp1.toFixed(4)} (+%${tp1Percent}) [Fib 0.382]
🎯 TP2: ${ts.tp2.toFixed(4)} (+%${tp2Percent}) [Fib 0.500]
⚖️ R:R: 1:${ts.riskReward.toFixed(2)} ${rrCheck}
🔥 Güven: ${w.scores.total}/100
⏱️ Süre: ~${w.projection.expectedDuration} mum
━━━━━━━━━━━━━━━━━━
⚠️ İptal: ${ts.stopLoss.toFixed(4)} ${invDir} kapanış`;
}

module.exports = { formatTelegramMessage };
