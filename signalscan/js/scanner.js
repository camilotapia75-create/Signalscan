const SCAN_UNIVERSE = [
  // Mega-cap tech
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','ORCL','CRM',
  'NFLX','ADBE','AMD','INTC','QCOM',
  // AI & AI infrastructure
  'PLTR','AI','ARM','TSM','MRVL','ALAB','VRT','DELL','SOUN','IONQ',
  'CEG','VST','EQIX','SMCI',
  // Cybersecurity
  'CRWD','PANW','ZS','OKTA','S','FTNT','CYBR','NET',
  // Cloud & SaaS
  'DDOG','PATH','DOCS','BILL','GTLB','DUOL','MNDY','CFLT','BRZE',
  'SHOP','ZM','SPOT','APP','TTD','PAYC','PCTY',
  // High-growth / fintech
  'COIN','HOOD','AFRM','SOFI','UPST','DKNG','AXON','TOST',
  // Consumer tech & social
  'RBLX','U','SNAP','PINS','ROKU',
  // Health & wellness
  'HIMS','CELH','ONON','PODD','TMDX','INSP','IRTC',
  // Mid-cap growth
  'LULU','ULTA','FIVE','SKX','BROS','CAVA','WING',
  'MELI','NU','SE','RIVN','CHPT','WOLF',
  // Aerospace & defense
  'LMT','RTX','NOC','GD','BA','HEI','TDG','LDOS','KTOS','RKLB','ACHR',
  'HON','GE','CAT',
  // Financials
  'V','MA','JPM','BAC','WFC','GS','MS',
  // Healthcare / pharma
  'UNH','JNJ','PFE','MRK','ABBV',
  // Consumer staples & retail
  'WMT','COST','TGT','HD','MCD','SBUX','NKE',
  // Media / Telecom
  'DIS','CMCSA','T','VZ',
  // Energy
  'XOM','CVX','COP','ENPH','SEDG','NEE','SO',
  // Crypto miners
  'MARA','RIOT','CLSK',
  // ETFs
  'SPY','QQQ','IWM','GLD','SLV',
  // Crypto
  'BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','DOGE-USD',
  'ADA-USD','AVAX-USD','POL-USD','LINK-USD','DOT-USD','UNI-USD'
];

// Same timeframe as the normal analyzer default (1Y weekly)
const SCAN_TIMEFRAME = '1wk|1y';

async function quickAnalyzeForScan(ticker) {
  try {
    const data = await fetchStockData(ticker, SCAN_TIMEFRAME);
    if (!data || !data.closes) return { _networkFail: true };
    const closes = data.closes.filter(Boolean);
    if (closes.length < 45) return null;
    const indData = computeIndicators(data);
    if (!indData) return null;
    const highs = data.highs.filter(Boolean);
    const lows = data.lows.filter(Boolean);
    const sr = findSupportResistance(highs, lows, closes);
    const pa = analyzePriceAction(data);
    const rev = generateAnalysis(ticker, indData, sr, pa);
    const cont = generateContinuationAnalysis(ticker, indData, sr, pa);
    const isGoldenBull = rev.bias === 'BULLISH' && cont.bias === 'BULLISH';
    console.log(`[SCANNER] ${ticker}: rev=${rev.bias}(${rev.score.toFixed(2)}) cont=${cont.bias}(${cont.score.toFixed(2)}) => ${isGoldenBull ? '🐂 GOLDEN BULL' : 'skip'}`);
    // Remap combined score from golden-bull range [0.2, 1.0] → display range [50, 100]
    // so every result starts at 50% (minimum qualification) and scales to 100%
    const avgScore = (rev.score + cont.score) / 2;
    const conviction = Math.round(Math.min(100, Math.max(50, 50 + (avgScore - 0.2) / 0.8 * 50)));
    const topSignal = rev.keySignals[0]?.text || cont.keySignals[0]?.text || '';
    return { ticker, price: indData.lastClose, isGoldenBull, conviction, topSignal, revScore: rev.score, contScore: cont.score };
  } catch (e) {
    console.error(`[SCANNER] ${ticker}: failed —`, e.message);
    return { _networkFail: true };
  }
}

function computeIndicators(data) {
  try {
    const closes = data.closes.filter(Boolean);
    const highs = data.highs.filter(Boolean);
    const lows = data.lows.filter(Boolean);
    const volumes = data.volumes.filter(Boolean);
    const rsi = calcRSI(closes, 14);
    const macd = calcMACD(closes);
    const bb = calcBollinger(closes, 20, 2);
    const stoch = calcStochastic(highs, lows, closes, 14, 3);
    const atr = calcATR(highs, lows, closes, 14);
    const obv = calcOBV(closes, volumes);
    const e20 = calcEMA(closes, 20);
    const e50 = calcEMA(closes, 50);
    const ema20 = e20[e20.length - 1];
    const ema50 = e50[e50.length - 1];
    const lastClose = closes[closes.length - 1];
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volRatio = volumes[volumes.length - 1] / (avgVol || 1);
    return { rsi, macd, bb, stoch, atr, obv, ema20, ema50, lastClose, volRatio };
  } catch (e) {
    console.error('[SCANNER] computeIndicators error:', e.message);
    return null;
  }
}

async function runScanner() {
  const btn = document.getElementById('scanBtn');
  const progress = document.getElementById('scanProgress');
  const grid = document.getElementById('scanResultsGrid');
  const emptyMsg = document.getElementById('scanEmpty');
  const header = document.getElementById('scanResultsHeader');
  btn.disabled = true;
  btn.textContent = '\u23f3 Scanning...';
  progress.style.display = 'block';
  if (emptyMsg) emptyMsg.style.display = 'none';
  if (header) header.style.display = 'none';
  grid.innerHTML = '';
  const total = SCAN_UNIVERSE.length;
  let done = 0, failed = 0;
  const bulls = [];
  const fill = document.getElementById('scanProgressBar');
  const countEl = document.getElementById('scanProgressCount');
  const statusEl = document.getElementById('scanStatusText');
  const foundMsg = document.getElementById('scanFoundMsg');
  if (countEl) countEl.textContent = `0 / ${total}`;
  console.log(`[SCANNER] Starting scan of ${total} tickers using ${SCAN_TIMEFRAME}`);
  for (let i = 0; i < total; i++) {
    const ticker = SCAN_UNIVERSE[i];
    if (statusEl) statusEl.textContent = `Scanning ${ticker}...`;
    const r = await quickAnalyzeForScan(ticker);
    done++;
    if (fill) fill.style.width = `${Math.round(done / total * 100)}%`;
    if (countEl) countEl.textContent = `${done} / ${total}`;
    if (r && r._networkFail) { failed++; }
    else if (r && r.isGoldenBull) {
      bulls.push(r);
      if (foundMsg) foundMsg.textContent = `Found ${bulls.length} golden bull${bulls.length !== 1 ? 's' : ''} so far...`;
      grid.insertAdjacentHTML('beforeend', renderScanCard(r));
    }
    if (i < total - 1) await new Promise(res => setTimeout(res, 600));
  }
  console.log(`[SCANNER] Done. ${bulls.length} golden bulls found. ${failed} tickers failed to load.`);
  if (bulls.length === 0) {
    if (emptyMsg) emptyMsg.style.display = 'block';
  } else {
    if (header) { header.textContent = `${bulls.length} GOLDEN BULL${bulls.length !== 1 ? 'S' : ''} FOUND`; header.style.display = 'block'; }
  }
  if (foundMsg) foundMsg.textContent = failed > 0 ? `${failed} ticker${failed !== 1 ? 's' : ''} couldn\u2019t load (network)` : '';
  progress.style.display = 'none';
  btn.disabled = false;
  btn.textContent = `\ud83d\udd0d SCAN AGAIN (${bulls.length} found${failed > 0 ? `, ${failed} failed` : ''})`;
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
        <span style="color:${color};font-weight:600;">\u26a1 GOLDEN BULL</span>
        <span style="color:${color};font-weight:700;">${pct}% conviction</span>
      </div>
      <div class="scan-card-bar"><div class="scan-progress-fill" style="width:${pct}%;background:${color};"></div></div>
    </div>
    ${r.topSignal ? `<div style="font-size:0.75em;color:#bbb;line-height:1.4;margin-top:6px;">${r.topSignal.substring(0, 90)}${r.topSignal.length > 90 ? '\u2026' : ''}</div>` : ''}
  </div>`;
}

function loadTickerAndAnalyze(ticker) {
  const input = document.getElementById('tickerInput');
  if (input) input.value = ticker.replace('-USD', '');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => runAnalysis(), 400);
}
