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

    // Structural decline filter: reject only when BOTH signals confirm a dead company.
    // Near yearly lows alone can mean a healthy stock in a market correction.
    // Steeply declining EMA50 alone can happen during a broad selloff.
    // Together they specifically identify CHPT-style structural collapse.
    const yearHigh = Math.max(...highs);
    const yearLow = Math.min(...lows);
    const rangeSpan = yearHigh - yearLow;
    const nearYearlyLow = rangeSpan > 0 && (indData.lastClose - yearLow) / rangeSpan < 0.20;
    const e50 = calcEMA(closes, 50);
    const ema50Collapsing = e50.length >= 9 && (e50[e50.length - 1] - e50[e50.length - 9]) / e50[e50.length - 9] < -0.08;
    if (nearYearlyLow && ema50Collapsing) return null;

    const sr = findSupportResistance(highs, lows, closes);
    const pa = analyzePriceAction(data);
    const rev = generateAnalysis(ticker, indData, sr, pa);
    const cont = generateContinuationAnalysis(ticker, indData, sr, pa);
    const isGoldenBull = rev.bias === 'BULLISH' && cont.bias === 'BULLISH';
    console.log(`[SCANNER] ${ticker}: rev=${rev.bias}(${rev.score.toFixed(2)}) cont=${cont.bias}(${cont.score.toFixed(2)}) => ${isGoldenBull ? '🐂 GOLDEN BULL' : 'skip'}`);
    const avgScore = (rev.score + cont.score) / 2;
    const conviction = Math.round(Math.min(100, Math.max(50, 50 + (avgScore - 0.2) / 0.8 * 50)));
    const topSignal = rev.keySignals[0]?.text || cont.keySignals[0]?.text || '';
    const spark = closes.slice(-30);
    const nearestRes = sr.resistance.filter(r => r.price > indData.lastClose)[0];
    const estimatedUpside = nearestRes
      ? (nearestRes.price - indData.lastClose) / indData.lastClose * 100
      : Math.max(0, (yearHigh - indData.lastClose) / indData.lastClose * 100);
    return { ticker, price: indData.lastClose, isGoldenBull, conviction, topSignal, revScore: rev.score, contScore: cont.score, spark, estimatedUpside };
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

async function _runScanCore(tickers, ids) {
  const { btnId, progressId, gridId, emptyId, headerId, foundMsgId, statusId, countId, barId, btnLabel } = ids;
  const btn      = document.getElementById(btnId);
  const progress = document.getElementById(progressId);
  const grid     = document.getElementById(gridId);
  const emptyMsg = document.getElementById(emptyId);
  const header   = document.getElementById(headerId);

  btn.disabled = true;
  btn.textContent = '⏳ Scanning...';
  progress.style.display = 'block';
  if (emptyMsg) emptyMsg.style.display = 'none';
  if (header)   header.style.display   = 'none';
  grid.innerHTML = '';

  const total    = tickers.length;
  let done = 0, failed = 0;
  const bulls    = [];
  const fill     = document.getElementById(barId);
  const countEl  = document.getElementById(countId);
  const statusEl = document.getElementById(statusId);
  const foundMsg = document.getElementById(foundMsgId);

  if (countEl) countEl.textContent = `0 / ${total}`;
  console.log(`[SCANNER] Starting scan of ${total} tickers using ${getScanTimeframe()}`);

  for (let i = 0; i < total; i++) {
    const ticker = tickers[i];
    if (statusEl) statusEl.textContent = `Scanning ${ticker}...`;
    const r = await quickAnalyzeForScan(ticker);
    done++;
    if (fill)    fill.style.width          = `${Math.round(done / total * 100)}%`;
    if (countEl) countEl.textContent       = `${done} / ${total}`;
    if (r && r._networkFail) { failed++; }
    else if (r && r.isGoldenBull) {
      bulls.push(r);
      if (foundMsg) foundMsg.textContent = `Found ${bulls.length} golden bull${bulls.length !== 1 ? 's' : ''} so far...`;
      grid.insertAdjacentHTML('beforeend', renderScanCard(r));
    }
    if (i < total - 1) await new Promise(res => setTimeout(res, 400));
  }

  console.log(`[SCANNER] Done. ${bulls.length} golden bulls found. ${failed} failed.`);
  if (bulls.length > 0) { await hofRecord(bulls); await renderHoF(); }

  const allFailed = failed > 0 && failed === done;
  const mostFailed = failed > total * 0.7;

  if (bulls.length === 0) {
    if (emptyMsg) {
      emptyMsg.style.display = 'block';
      const msgEl = emptyMsg.querySelector('div:last-child');
      if (msgEl) {
        if (allFailed || mostFailed) {
          msgEl.innerHTML = `<span style="color:#ff6b6b;">Network error — ${failed} tickers couldn't load.</span><br><span style="font-size:11px;color:var(--muted);">Check your connection and try again.</span>`;
        } else {
          msgEl.innerHTML = `No golden bull signals in current market conditions.${failed > 0 ? `<br><span style="font-size:11px;color:var(--muted);">${failed} ticker${failed !== 1 ? 's' : ''} couldn't load.</span>` : ''}`;
        }
      }
    }
  } else {
    if (header) { header.textContent = `${bulls.length} GOLDEN BULL${bulls.length !== 1 ? 'S' : ''} FOUND`; header.style.display = 'block'; }
  }

  if (foundMsg) foundMsg.textContent = (allFailed || mostFailed) ? `Network error — ${failed} of ${total} tickers failed to load` : failed > 0 ? `${failed} ticker${failed !== 1 ? 's' : ''} couldn't load (network)` : '';
  progress.style.display = 'none';
  btn.disabled  = false;
  btn.textContent = `${btnLabel} (${bulls.length} found${failed > 0 ? `, ${failed} failed` : ''})`;
}

function runScanner() {
  return _runScanCore(SCAN_UNIVERSE, {
    btnId: 'scanBtn',         progressId: 'scanProgress',    gridId: 'scanResultsGrid',
    emptyId: 'scanEmpty',     headerId: 'scanResultsHeader', foundMsgId: 'scanFoundMsg',
    statusId: 'scanStatusText', countId: 'scanProgressCount', barId: 'scanProgressBar',
    btnLabel: '🔍 SCAN AGAIN',
  });
}

function runCustomScanner() {
  const tickers = window._watchlistTickers || [];
  if (tickers.length === 0) return;
  return _runScanCore(tickers, {
    btnId: 'customScanBtn',       progressId: 'customScanProgress', gridId: 'customScanGrid',
    emptyId: 'customScanEmpty',   headerId: 'customScanHeader',     foundMsgId: 'customScanFoundMsg',
    statusId: 'customScanStatus', countId: 'customScanCount',       barId: 'customScanBar',
    btnLabel: '🔍 SCAN AGAIN',
  });
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

// ── Hall of Fame ─────────────────────────────────────────────────────────────

const HOF_KEY    = 'signalscan_hof';
const ADMIN_EMAIL = 'camilotapia75@gmail.com';
let _hofAdminRecords = [];
let _hofRenderGen    = 0; // increments on each renderHoF() call to cancel stale async renders
let _hofReturnLoading = false;

async function hofRecord(bulls) {
  // Persist to Supabase via server endpoint (cross-device)
  try {
    await fetch('/api/hof/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signals: bulls.map(b => ({ ticker: b.ticker, price: b.price, conviction: b.conviction })) }),
    });
  } catch (e) {
    console.error('[HOF] record failed:', e.message);
  }
  // localStorage fallback for offline resilience
  try {
    const raw   = localStorage.getItem(HOF_KEY);
    const store = raw ? JSON.parse(raw) : { since: Date.now(), signals: [] };
    const now   = Date.now();
    for (const b of bulls) {
      const dup = store.signals.find(s => s.ticker === b.ticker && now - s.ts < 7 * 86400000);
      if (!dup) store.signals.push({ ticker: b.ticker, ts: now, price: b.price, conviction: b.conviction });
    }
    store.signals = store.signals.slice(-500);
    localStorage.setItem(HOF_KEY, JSON.stringify(store));
  } catch (_) {}
}

async function renderHoF() {
  const section = document.getElementById('hofSection');
  if (!section) return;

  const isAdmin = typeof currentUser !== 'undefined' && currentUser?.email === ADMIN_EMAIL;
  const gen = ++_hofRenderGen; // stale-render guard

  try {
    const sb = getSupabase();
    const { data: records, error } = await sb
      .from('golden_bull_hof')
      .select('ticker,detected_at,signal_price,conviction')
      .order('detected_at', { ascending: false })
      .limit(1000);

    if (gen !== _hofRenderGen) return; // a newer renderHoF() started — abort
    if (error) throw error;

    const subtitleEl = document.getElementById('hofSubtitle');
    const titleEl    = document.getElementById('hofTitle');
    const btn        = document.getElementById('hofReturnBtn');

    if (!records?.length) {
      if (isAdmin) {
        section.style.display = 'block';
        if (titleEl)    titleEl.textContent    = '🏆 GOLDEN BULL HALL OF FAME — ADMIN';
        if (subtitleEl) subtitleEl.textContent = 'ADMIN VIEW — 0 SIGNALS';
        const tbody = document.getElementById('hofTbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="padding:14px 8px;color:var(--muted);font-size:10px;letter-spacing:1px;">No signals yet. Run a Golden Bull scan to populate.</td></tr>';
        if (btn) btn.style.display = 'none';
      } else {
        _hofAdminRecords = [];
        _renderHofLegacy();
      }
      return;
    }

    section.style.display = 'block';

    if (isAdmin) {
      _hofAdminRecords = records;
      if (titleEl)    titleEl.textContent    = '🏆 GOLDEN BULL HALL OF FAME — ADMIN';
      if (subtitleEl) subtitleEl.textContent = `ADMIN VIEW — ALL ${records.length} SIGNALS`;
      if (btn) btn.style.display = 'block';
      _renderHofAdminTable(records);
    } else {
      _hofAdminRecords = [];
      if (subtitleEl) subtitleEl.textContent = `ALL-TIME · ${records.length} TOTAL SIGNALS DETECTED`;
      if (btn) btn.style.display = 'none';
      await _renderHofPublicTable(records, gen);
    }
  } catch (e) {
    console.error('[HOF] renderHoF error:', e.message);
    _renderHofLegacy();
  }
}

async function _renderHofPublicTable(records, gen) {
  const tbody = document.getElementById('hofTbody');
  const btn   = document.getElementById('hofReturnBtn');
  if (btn) btn.style.display = 'none';

  // One entry per ticker (most recent signal), capped at 30 for price fetching
  const byTicker = new Map();
  for (const r of records) {
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, r);
  }
  const unique = [...byTicker.values()].sort((a, b) => b.conviction - a.conviction).slice(0, 30);

  const renderRows = (rows) => {
    if (gen !== _hofRenderGen) return; // admin may have logged in mid-fetch
    if (!tbody) return;
    tbody.innerHTML = rows.map(s => {
      const lbl    = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const price  = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
      const color  = s.pct != null ? (s.pct >= 0 ? 'var(--accent)' : 'var(--accent2)') : 'var(--muted)';
      const pctStr = s.pct != null ? `${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%` : '—';
      return `<tr>
        <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker}</td>
        <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
        <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
        <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
        <td style="padding:7px 8px;font-weight:600;color:${color};">${pctStr}</td>
      </tr>`;
    }).join('');
  };

  // Show tickers immediately so the table is never blank
  renderRows(unique.map(r => ({ ...r, pct: null })));

  // Fetch current prices for all unique tickers via batch quote endpoint
  try {
    const symbols  = unique.map(r => r.ticker).join(',');
    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice`;
    const res      = await fetch(`/api/proxy?url=${encodeURIComponent(quoteUrl)}`);
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const json   = await res.json();
    const quotes = json.quoteResponse?.result || [];

    const prices = {};
    for (const q of quotes) {
      if (q.symbol && q.regularMarketPrice) prices[q.symbol] = q.regularMarketPrice;
    }

    // Compute % gain for ALL records (not just most-recent per ticker)
    const withPct = records.map(r => {
      const cur = prices[r.ticker];
      if (!cur) return null;
      return { ...r, pct: (cur - parseFloat(r.signal_price)) / parseFloat(r.signal_price) * 100 };
    }).filter(Boolean);

    // Per ticker, keep only the entry with the best (highest) % gain
    const bestByTicker = new Map();
    for (const r of withPct) {
      const existing = bestByTicker.get(r.ticker);
      if (!existing || r.pct > existing.pct) bestByTicker.set(r.ticker, r);
    }

    const top20 = [...bestByTicker.values()]
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 20);

    renderRows(top20);
  } catch (e) {
    console.error('[HOF] price fetch failed:', e.message);
  }
}

function _renderHofAdminTable(records) {
  const tbody = document.getElementById('hofTbody');
  if (!tbody) return;
  tbody.innerHTML = records.map(s => {
    const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
    const ts    = new Date(s.detected_at).getTime();
    return `<tr>
      <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker}</td>
      <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
      <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
      <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
      <td id="hret-${s.ticker}-${ts}" style="padding:7px 8px;color:var(--muted);">—</td>
    </tr>`;
  }).join('');
}

function _renderHofLegacy() {
  try {
    const raw = localStorage.getItem(HOF_KEY);
    if (!raw) return;
    const store = JSON.parse(raw);
    if (!store.signals?.length) return;
    const section = document.getElementById('hofSection');
    if (!section) return;
    const days = Math.max(0, Math.floor((Date.now() - store.since) / 86400000));
    const daysEl    = document.getElementById('hofDays');
    const countEl   = document.getElementById('hofTotalCount');
    const subtitleEl = document.getElementById('hofSubtitle');
    if (daysEl)  daysEl.textContent  = days;
    if (countEl) countEl.textContent = store.signals.length;
    if (subtitleEl) subtitleEl.textContent = `TRACKING FOR ${days} DAYS · ${store.signals.length} TOTAL SIGNALS DETECTED`;
    const tbody = document.getElementById('hofTbody');
    if (tbody) {
      const recent = store.signals.slice().reverse().slice(0, 30);
      tbody.innerHTML = recent.map(s => {
        const lbl   = new Date(s.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const price = s.price < 10 ? s.price.toFixed(4) : s.price.toFixed(2);
        return `<tr>
          <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker}</td>
          <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
          <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
          <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
          <td id="hret-${s.ticker}-${s.ts}" style="padding:7px 8px;color:var(--muted);">—</td>
        </tr>`;
      }).join('');
    }
    const hofBtn = document.getElementById('hofReturnBtn');
    if (hofBtn) hofBtn.style.display = '';
    section.style.display = 'block';
  } catch (_) {}
}

async function loadHofReturns() {
  if (_hofReturnLoading) return;
  _hofReturnLoading = true;
  const btn = document.getElementById('hofReturnBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'LOADING...'; }

  if (_hofAdminRecords.length) {
    // Supabase admin path
    await Promise.all(_hofAdminRecords.slice(0, 50).map(async s => {
      try {
        const data = await fetchStockData(s.ticker, '1d|5d');
        const cur  = data?.closes?.filter(Boolean).slice(-1)[0];
        if (!cur) return;
        const ret = (cur - parseFloat(s.signal_price)) / parseFloat(s.signal_price) * 100;
        const el  = document.getElementById(`hret-${s.ticker}-${new Date(s.detected_at).getTime()}`);
        if (el) {
          el.textContent = `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`;
          el.style.color = ret >= 0 ? 'var(--accent)' : 'var(--accent2)';
        }
      } catch (_) {}
    }));
  } else {
    // localStorage legacy path — fetch prices, sort by % gain, re-render
    try {
      const raw = localStorage.getItem(HOF_KEY);
      if (!raw) { if (btn) { btn.disabled = false; btn.textContent = 'LOAD RETURNS'; } return; }
      const store = JSON.parse(raw);
      const pool  = store.signals.slice().reverse().slice(0, 50);

      const withPct = await Promise.all(pool.map(async s => {
        try {
          const data = await fetchStockData(s.ticker, '1d|5d');
          const cur  = data?.closes?.filter(Boolean).slice(-1)[0];
          if (!cur) return null;
          return { ...s, pct: (cur - s.price) / s.price * 100 };
        } catch (_) { return null; }
      }));

      const top20 = withPct.filter(Boolean).sort((a, b) => b.pct - a.pct).slice(0, 20);
      const tbody = document.getElementById('hofTbody');
      if (tbody && top20.length) {
        tbody.innerHTML = top20.map(s => {
          const lbl   = new Date(s.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const price = s.price < 10 ? s.price.toFixed(4) : s.price.toFixed(2);
          const color = s.pct >= 0 ? 'var(--accent)' : 'var(--accent2)';
          const pctStr = `${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%`;
          return `<tr>
            <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker}</td>
            <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
            <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
            <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
            <td style="padding:7px 8px;font-weight:600;color:${color};">${pctStr}</td>
          </tr>`;
        }).join('');
      }
    } catch (_) {}
  }

  _hofReturnLoading = false;
  if (btn) { btn.disabled = false; btn.textContent = 'REFRESH RETURNS'; }
}

async function _migrateHofToSupabase() {
  const MIG_KEY = 'signalscan_hof_migrated';
  if (localStorage.getItem(MIG_KEY)) return;
  try {
    const raw = localStorage.getItem(HOF_KEY);
    if (!raw) { localStorage.setItem(MIG_KEY, '1'); return; }
    const store = JSON.parse(raw);
    if (!store.signals?.length) { localStorage.setItem(MIG_KEY, '1'); return; }
    const signals = store.signals.map(s => ({
      ticker:      s.ticker,
      price:       s.price,
      conviction:  s.conviction,
      detected_at: new Date(s.ts).toISOString(),
    }));
    console.log(`[HOF] Migrating ${signals.length} signals from localStorage to Supabase...`);
    const r = await fetch('/api/hof/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signals }),
    });
    if (r.ok) {
      const d = await r.json();
      console.log(`[HOF] Migration complete — ${d.migrated} signals uploaded.`);
      localStorage.setItem(MIG_KEY, '1');
    }
  } catch (e) {
    console.error('[HOF] Migration failed:', e.message);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await _migrateHofToSupabase();
  renderHoF();
  // Pre-load NVDA so new visitors see the analysis tool in action
  const input = document.getElementById('tickerInput');
  if (input && !input.value.trim()) {
    input.value = 'NVDA';
    setTimeout(runAnalysis, 700);
  }
});
