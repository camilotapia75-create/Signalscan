const SCAN_UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','ORCL','CRM',
  'NFLX','ADBE','AMD','INTC','QCOM',
  'PLTR','COIN','HOOD','RBLX','U','SNAP','PINS','ROKU','SPOT','SHOP',
  'DDOG','NET','PATH','DOCS','BILL','GTLB','DUOL','AI','HIMS','CELH',
  'ONON','DKNG','AFRM','SOFI','UPST','SMCI','WOLF',
  'V','MA','JPM','BAC','WFC','GS','MS',
  'UNH','JNJ','PFE','MRK','ABBV','INSP','IRTC',
  'WMT','COST','TGT','HD','MCD','SBUX','NKE','BROS','CAVA','WING',
  'DIS','CMCSA','T','VZ',
  'XOM','CVX','COP','ENPH','SEDG',
  'NEE','SO','BA','CAT','RTX','HON','GE','LMT',
  'MARA','RIOT','CLSK',
  'SPY','QQQ','IWM','GLD','SLV',
  'BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','DOGE-USD',
  'ADA-USD','AVAX-USD','MATIC-USD','LINK-USD','DOT-USD','UNI-USD'
];

async function quickAnalyzeForScan(ticker) {
  try {
    const data = await fetchStockData(ticker, '3mo', '1d', 5000);
    if (!data || data.length < 30) return null;
    const indData = computeIndicators(data);
    if (!indData) return null;
    const sr = findSupportResistance(data);
    const pa = analyzePriceAction(data);
    const rev = generateAnalysis(ticker, indData, sr, pa);
    const cont = generateContinuationAnalysis(ticker, indData, sr, pa);
    const isGoldenBull = rev.bias === 'BULLISH' && cont.bias === 'BULLISH';
    const conviction = Math.round((rev.confidence + cont.confidence) / 2);
    const topSignal = rev.keySignals[0]?.text || cont.keySignals[0]?.text || '';
    return { ticker, price: indData.lastClose, isGoldenBull, conviction, topSignal, revScore: rev.score, contScore: cont.score };
  } catch (e) { return null; }
}

function computeIndicators(data) {
  try {
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);
    const rsi = calcRSI(closes, 14);
    const macd = calcMACD(closes);
    const bb = calcBollinger(closes, 20, 2);
    const stoch = calcStochastic(highs, lows, closes, 14, 3);
    const atr = calcATR(highs, lows, closes, 14);
    const obv = calcOBV(closes, volumes);
    const ema20 = calcEMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const lastClose = closes[closes.length - 1];
    const avgVol = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
    const volRatio = volumes[volumes.length - 1] / (avgVol || 1);
    return { rsi, macd, bb, stoch, atr, obv, ema20, ema50, lastClose, volRatio };
  } catch (e) { return null; }
}

async function runScanner() {
  const btn = document.getElementById('scanBtn');
  const progress = document.getElementById('scanProgress');
  const grid = document.getElementById('scanResultsGrid');
  btn.disabled = true;
  btn.textContent = '⏳ Scanning...';
  progress.style.display = 'block';
  grid.innerHTML = '';
  const total = SCAN_UNIVERSE.length;
  let done = 0;
  const bulls = [];
  const fill = document.getElementById('scanProgressFill');
  const label = document.getElementById('scanProgressLabel');
  for (let i = 0; i < total; i += 5) {
    const batch = SCAN_UNIVERSE.slice(i, i + 5);
    const results = await Promise.all(batch.map(quickAnalyzeForScan));
    results.forEach(r => {
      done++;
      if (fill) fill.style.width = `${Math.round(done / total * 100)}%`;
      if (label) label.textContent = `Scanning ${done}/${total}...`;
      if (r && r.isGoldenBull) { bulls.push(r); grid.insertAdjacentHTML('beforeend', renderScanCard(r)); }
    });
    if (i + 5 < total) await new Promise(res => setTimeout(res, 500));
  }
  if (bulls.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#aaa;padding:40px;">No Golden Bulls found right now. Market may be consolidating — check back later.</div>';
  }
  progress.style.display = 'none';
  btn.disabled = false;
  btn.textContent = `🔍 SCAN AGAIN (${bulls.length} found)`;
}

function renderScanCard(r) {
  const pct = r.conviction;
  const color = pct >= 75 ? '#f5c518' : pct >= 60 ? '#4caf50' : '#2196f3';
  return `<div class="scan-card${pct >= 75 ? ' perfect' : ''}" onclick="loadTickerAndAnalyze('${r.ticker}')" style="cursor:pointer;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-weight:700;font-size:1.1em;">${r.ticker}</span>
      <span style="font-size:0.85em;color:#aaa;">$${r.price.toFixed(r.price < 10 ? 4 : 2)}</span>
    </div>
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:0.8em;margin-bottom:3px;">
        <span style="color:${color};font-weight:600;">⚡ GOLDEN BULL</span>
        <span style="color:${color};font-weight:700;">${pct}% conviction</span>
      </div>
      <div class="scan-card-bar"><div class="scan-progress-fill" style="width:${pct}%;background:${color};"></div></div>
    </div>
    ${r.topSignal ? `<div style="font-size:0.75em;color:#bbb;line-height:1.4;margin-top:6px;">${r.topSignal.substring(0,90)}${r.topSignal.length>90?'\u2026':''}</div>` : ''}
  </div>`;
}

function loadTickerAndAnalyze(ticker) {
  const input = document.getElementById('tickerInput');
  if (input) input.value = ticker.replace('-USD','');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => runAnalysis(), 400);
}
