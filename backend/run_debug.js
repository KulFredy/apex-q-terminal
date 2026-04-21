const { analyzeElliott } = require('./elliott_engine_test.js');
async function run() {
    const data = await analyzeElliott('BTC/USDT', '1h');
    console.log("totalWavesFound:", data.totalWavesFound);
}
run();
