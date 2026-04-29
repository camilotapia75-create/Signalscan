// Core universe — always scanned
const SCAN_UNIVERSE_CORE = [
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
  'MELI','NU','SE','RIVN','WOLF',
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
  'ADA-USD','AVAX-USD','POL-USD','LINK-USD','DOT-USD','UNI-USD',
  // Always included
  'ZETA',
];

// 50-stock rotation pool — 20 picked randomly each day (same picks all day, rotates daily)
const ROTATION_POOL = [
  'WDAY','SNOW','MDB','NOW','HUBS','ABNB','UBER','DASH','ASTS','IOT',
  'INTU','CORZ','IREN','RXRX','CRSP','JOBY','LMND','ZI','VEEV','ESTC',
  'PYPL','SQ','TWLO','NTNX','PSTG','MPWR','AMBA','CIEN','CALX','HPE',
  'KEYS','ONTO','SWKS','QRVO','STX','WDC','KKR','APO','BX','MSCI',
  'MCO','ROP','IDXX','ALGN','DXCM','OXY','FANG','MPC','CTRA','VST',
];

function getDailyPicks(pool, count) {
  const d = new Date();
  let seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

const SCAN_UNIVERSE = [...SCAN_UNIVERSE_CORE, ...getDailyPicks(ROTATION_POOL, 20)];

function getScanTimeframe() {
  const sel = document.getElementById('scanTimeframe');
  return sel ? sel.value : '1wk|1y';
}

async function quickAnalyzeForScan(ticker) {
  try {
    const data = await fetchStockData(ticker, getScanTimeframe());
    if (!data || !data.closes) return { _networkFail: true };
    const closes = data.closes.filter(Boolean);
    if (closes.length < 45) return null;
    const indData = computeIndicators(data);
    if (!indData) return null;

    // Price floor: sub-$3 non-crypto stocks are dead-company territory
    if (!ticker.includes('-USD') && indData.lastClose < 3) return null;

    const highs = data.highs.filter(Boolean);
    const lows = data.lows.filter(Boolean);

    // Range position: bottom 20% of yearly range = near yearly lows = structural decline
    const yearHigh = Math.max(...highs);
    const yearLow = Math.min(...lows);
    const rangeSpan = yearHigh - yearLow;
    if (rangeSpan > 0 && (indData.lastClose - yearLow) / rangeSpan < 0.20) return null;

    // EMA50 slope: >8% decline over 8 candles = confirmed structural downtrend, not a bounce
    const e50 = calcEMA(closes, 50);
    if (e50.length >= 9 && (e50[e50.length - 1] - e50[e50.length - 9]) / e50[e50.length - 9] < -0.08) return null;

    const sr = findSupportResistance(highs, lows, closes);
    const pa = analyzePriceAction(data);
    const rev = generateAnalysis(ticker, indData, sr, pa);
    const cont = generateContinuationAnalysis(ticker, indData, sr, pa);
    const isGoldenBull = rev.bias === 'BULLISH' && cont.bias === 'BULLISH';
    console.log(`[SCANNER] ${ticker}: rev=${rev.bias}(${rev.score.toFixed(2)}) cont=${cont.bias}(${cont.score.toFixed(2)}) => ${isGoldenBull ? '🐂 GOLDEN BULL' : 'skip'}`);
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
  btn.textContent = '⏳ Scanning...';
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
  const tf = getScanTimeframe();
  console.log(`[SCANNER] Starting scan of ${total} tickers using ${tf}`);
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
  if (foundMsg) foundMsg.textContent = failed > 0 ? `${failed} ticker${failed !== 1 ? 's' : ''} couldn’t load (network)` : '';
  progress.style.display = 'none';
  btn.disabled = false;
  btn.textContent = `🔍 SCAN AGAIN (${bulls.length} found${failed > 0 ? `, ${failed} failed` : ''})`;
}

function renderScanCard(r) {
  return `<div class="scan-card" onclick="loadTickerAndAnalyze('${r.ticker}')" style="cursor:pointer;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="font-weight:700;font-size:1.1em;">${r.ticker}</span>
      <span style="font-size:0.85em;color:#aaa;">$${r.price.toFixed(r.price < 10 ? 4 : 2)}</span>
    </div>
    <div class="scan-card-bar"></div>
    <div style="font-size:0.8em;margin-bottom:${r.topSignal ? '8px' : '0'};">
      <span style="color:#00ff88;font-weight:600;">⚡ GOLDEN BULL</span>
    </div>
    ${r.topSignal ? `<div style="font-size:0.75em;color:#bbb;line-height:1.4;">${r.topSignal.substring(0, 90)}${r.topSignal.length > 90 ? '…' : ''}</div>` : ''}
  </div>`;
}

function loadTickerAndAnalyze(ticker) {
  const input = document.getElementById('tickerInput');
  if (input) input.value = ticker.replace('-USD', '');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => runAnalysis(), 400);
}
