// ===== GOLDEN BULL SCANNER =====

const SCAN_UNIVERSE = [
  // Mega-cap tech
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','ORCL','ADBE',
  // Growth tech
  'CRM','NOW','INTU','SHOP','NET','DDOG','ZS','CRWD','PLTR','SNOW',
  // Semiconductors
  'AMD','INTC','QCOM','TXN','MU','AMAT','LRCX','KLAC','MRVL','ARM',
  // Financials
  'JPM','BAC','GS','MS','V','MA','BLK','SPGI','AXP','WFC',
  // Healthcare
  'LLY','UNH','JNJ','ABBV','MRK','TMO','ABT','ISRG','AMGN','GILD',
  // Consumer
  'WMT','COST','HD','MCD','SBUX','NKE','TGT','LOW','PG','KO',
  // Energy
  'XOM','CVX','COP','SLB','EOG',
  // Industrials
  'CAT','BA','HON','GE','UNP','RTX','LMT','DE',
  // Media / Telecom
  'NFLX','DIS','CMCSA','SPOT',
  // Utilities
  'NEE','DUK',
  // Crypto
  'BTC-USD','ETH-USD','SOL-USD','XRP-USD','BNB-USD','DOGE-USD','ADA-USD','AVAX-USD','LINK-USD',
];

async function quickAnalyzeForScan(ticker) {
  try {
    const data = await fetchStockData(ticker, '1wk|1y', 5000);
    const closes = data.closes.filter(Boolean);
    const highs  = data.highs.filter(Boolean);
    const lows   = data.lows.filter(Boolean);
    const vols   = data.volumes.filter(Boolean);
    if (closes.length < 30) return null;

    const rsi  = calcRSI(closes);
    const macd = calcMACD(closes);
    const bb   = calcBollinger(closes);
    const stoch = calcStochastic(highs, lows, closes);
    const atr  = calcATR(highs, lows, closes);
    const obv  = calcOBV(closes, vols);
    const ema20arr = calcEMA(closes, 20);
    const ema50arr = calcEMA(closes, 50);
    const ema20 = ema20arr[ema20arr.length - 1];
    const ema50 = ema50arr[ema50arr.length - 1];
    const lastClose = closes[closes.length - 1];
    const vol20avg = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volRatio = vols[vols.length - 1] / vol20avg;
    const sr = findSupportResistance(highs, lows, closes);
    const indData = { rsi, macd, bb, stoch, atr, obv, volRatio, ema20, ema50, lastClose };
    const priceAction = analyzePriceAction(data);

    const revResult = generateAnalysis(ticker, indData, sr, priceAction);
    const conResult = generateContinuationAnalysis(ticker, indData, sr, priceAction);
    return { ticker, price: lastClose, revResult, conResult, indData };
  } catch (e) {
    return null;
  }
}

function renderScanCard({ ticker, price, revResult, conResult, combinedStrength }) {
  const pct = Math.round(combinedStrength * 100);
  const isPerfect = combinedStrength > 0.4;
  const topSignal = revResult.keySignals.find(s => s.type === 'bull')
                 || conResult.keySignals.find(s => s.type === 'bull');
  const signalText = topSignal
    ? topSignal.text.slice(0, 110) + (topSignal.text.length > 110 ? '...' : '')
    : 'Both engines aligned bullish.';
  const displayName = ticker.replace(/-USD$/, '');
  const priceStr = '$' + price.toFixed(price < 1 ? 4 : 2);

  const card = document.createElement('div');
  card.className = 'scan-card' + (isPerfect ? ' perfect' : '');
  card.innerHTML = `
    ${isPerfect ? '<div class="scan-card-bar"></div>' : ''}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
      <div>
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:20px;color:var(--accent);">${displayName}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${priceStr}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:9px;color:var(--gold);letter-spacing:1.5px;font-weight:700;">${isPerfect ? '⚡ PERFECT BULL' : '🐂 GOLDEN BULL'}</div>
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:24px;color:var(--accent);line-height:1.1;">${pct}%</div>
        <div style="font-size:9px;color:var(--muted);letter-spacing:1px;">CONVICTION</div>
      </div>
    </div>
    <div style="font-size:11px;color:#c0cdd8;line-height:1.7;margin-bottom:12px;min-height:36px;">${signalText}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
      <span style="font-size:9px;padding:3px 8px;border:1px solid var(--accent);color:var(--accent);letter-spacing:1px;">REVERSAL ✓</span>
      <span style="font-size:9px;padding:3px 8px;border:1px solid var(--accent3);color:var(--accent3);letter-spacing:1px;">CONTINUATION ✓</span>
    </div>
    <div style="font-size:10px;color:var(--muted);letter-spacing:1.5px;border-top:1px solid var(--border);padding-top:10px;">CLICK TO ANALYZE →</div>
  `;
  card.addEventListener('click', () => loadTickerAndAnalyze(ticker));
  card.addEventListener('mouseover', () => {
    card.style.borderColor = 'rgba(0,255,136,0.6)';
    card.style.background  = 'rgba(0,255,136,0.03)';
  });
  card.addEventListener('mouseout', () => {
    card.style.borderColor = isPerfect ? 'rgba(0,255,136,0.45)' : 'rgba(0,255,136,0.2)';
    card.style.background  = 'var(--surface)';
  });
  document.getElementById('scanResultsGrid').appendChild(card);
}

function loadTickerAndAnalyze(ticker) {
  document.getElementById('tickerInput').value = ticker.replace(/-USD$/, '');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => runAnalysis(), 400);
}

async function runScanner() {
  const btn = document.getElementById('scanBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '⏳ SCANNING...';

  const progressWrap = document.getElementById('scanProgress');
  const bar          = document.getElementById('scanProgressBar');
  const countEl      = document.getElementById('scanProgressCount');
  const statusEl     = document.getElementById('scanStatusText');
  const foundEl      = document.getElementById('scanFoundMsg');
  const grid         = document.getElementById('scanResultsGrid');
  const emptyEl      = document.getElementById('scanEmpty');
  const hdrEl        = document.getElementById('scanResultsHeader');

  // Reset UI
  grid.innerHTML = '';
  emptyEl.style.display = 'none';
  hdrEl.style.display   = 'none';
  progressWrap.style.display = 'block';
  bar.style.width = '0%';
  foundEl.textContent = '';

  const total = SCAN_UNIVERSE.length;
  let processed = 0, found = 0;
  const BATCH = 5;

  for (let i = 0; i < total; i += BATCH) {
    const batch = SCAN_UNIVERSE.slice(i, i + BATCH);
    statusEl.textContent = 'Scanning ' + batch.map(t => t.replace(/-USD$/, '')).join(', ') + '...';

    const results = await Promise.allSettled(batch.map(t => quickAnalyzeForScan(t)));

    results.forEach(res => {
      processed++;
      bar.style.width = ((processed / total) * 100).toFixed(1) + '%';
      countEl.textContent = processed + ' / ' + total;

      if (res.status !== 'fulfilled' || !res.value) return;
      const { ticker, price, revResult, conResult } = res.value;
      if (revResult.bias !== 'BULLISH' || conResult.bias !== 'BULLISH') return;

      const combinedStrength = (Math.abs(revResult.score) + Math.abs(conResult.score)) / 2;
      found++;
      foundEl.textContent = found + ' golden bull' + (found !== 1 ? 's' : '') + ' found so far...';
      renderScanCard({ ticker, price, revResult, conResult, combinedStrength });
      hdrEl.style.display = 'block';
      hdrEl.textContent   = found + ' GOLDEN BULL' + (found !== 1 ? 'S' : '') + ' FOUND';
    });

    if (i + BATCH < total) await new Promise(r => setTimeout(r, 500));
  }

  // Done
  progressWrap.style.display = 'none';
  if (found === 0) {
    emptyEl.style.display = 'block';
  } else {
    hdrEl.textContent = found + ' GOLDEN BULL' + (found !== 1 ? 'S' : '') + ' FOUND — CLICK ANY TO ANALYZE';
  }
  btn.disabled = false;
  btn.textContent = '🔄 SCAN AGAIN';
}
