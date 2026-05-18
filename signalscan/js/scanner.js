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

function buildScanUniverse() {
  const seed = Math.floor(Date.now() / 86400000); // changes daily
  let s = seed;
  const shuffled = [...ROTATION_POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return [...SCAN_UNIVERSE_CORE, ...shuffled.slice(0, 20)];
}

const SCAN_UNIVERSE = buildScanUniverse();

function getScanTimeframe() {
  const sel = document.getElementById('scanTimeframe');
  return sel ? sel.value : '1wk|1y';
}

// ── Scanner ───────────────────────────────────────────────────────────────────

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

async function quickAnalyzeForScan(ticker) {
  try {
    const data = await fetchStockData(ticker, getScanTimeframe());
    if (!data || !data.closes) return { _networkFail: true };
    const closes = data.closes.filter(Boolean);
    if (closes.length < 45) return null;
    const indData = computeIndicators(data);
    if (!indData) return null;

    if (!ticker.includes('-USD') && indData.lastClose < 3) return null;

    const highs  = data.highs.filter(Boolean);
    const lows   = data.lows.filter(Boolean);
    const yearHigh = Math.max(...highs);
    const yearLow  = Math.min(...lows);
    const rangeSpan = yearHigh - yearLow;
    const nearYearlyLow = rangeSpan > 0 && (indData.lastClose - yearLow) / rangeSpan < 0.20;
    const e50 = calcEMA(closes, 50);
    const ema50Collapsing = e50.length >= 9 && (e50[e50.length-1] - e50[e50.length-9]) / e50[e50.length-9] < -0.08;
    if (nearYearlyLow && ema50Collapsing) return null;

    const sr   = findSupportResistance(highs, lows, closes);
    const pa   = analyzePriceAction(data);
    const rev  = generateAnalysis(ticker, indData, sr, pa);
    const cont = generateContinuationAnalysis(ticker, indData, sr, pa);
    const isGoldenBull = rev.score > 0.2 && cont.score > 0.25;

    const conviction = Math.round(Math.min(100, Math.max(50, 50 + (rev.score + cont.score - 0.45) / 0.55 * 50)));
    const topSignal = rev.keySignals[0]?.text || cont.keySignals[0]?.text || '';
    const spark = closes.slice(-30);
    const nearestRes = sr.resistance.filter(r => r.price > indData.lastClose)[0];
    const estimatedUpside = nearestRes
      ? (nearestRes.price - indData.lastClose) / indData.lastClose * 100
      : Math.max(0, (yearHigh - indData.lastClose) / indData.lastClose * 100);

    return { ticker, price: indData.lastClose, isGoldenBull, conviction, topSignal, revScore: rev.score, contScore: cont.score, spark, estimatedUpside };
  } catch (e) {
    console.error(`[SCAN] ${ticker}: failed —`, e.message);
    return { _networkFail: true };
  }
}

async function _runScanCore(tickers, ids, analyzeFn, recordFn, renderFn, hofSource) {
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
    const r = await (analyzeFn || quickAnalyzeForScan)(ticker);
    done++;
    if (fill)    fill.style.width    = `${Math.round(done / total * 100)}%`;
    if (countEl) countEl.textContent = `${done} / ${total}`;
    if (r && r._networkFail) { failed++; }
    else if (r && r.isGoldenBull) {
      bulls.push(r);
      if (foundMsg) foundMsg.textContent = `Found ${bulls.length} golden bull${bulls.length !== 1 ? 's' : ''} so far...`;
      grid.insertAdjacentHTML('beforeend', renderScanCard(r));
      if (hofSource) (recordFn || hofRecord)([r], hofSource).catch(() => {});
    }
    if (i < total - 1) await new Promise(res => setTimeout(res, 400));
  }

  console.log(`[SCANNER] Done. ${bulls.length} golden bulls found. ${failed} failed.`);
  if (bulls.length > 0) {
    (renderFn || renderHoF)();
  }

  const allFailed = failed > 0 && failed === done;
  const mostFailed = failed > total * 0.7;

  if (bulls.length === 0) {
    if (emptyMsg) {
      emptyMsg.style.display = 'block';
      const msgEl = emptyMsg.querySelector('div:last-child');
      if (msgEl) {
        if (allFailed || mostFailed) {
          msgEl.textContent = 'Market data unavailable. Try again in a few minutes.';
        } else {
          msgEl.textContent = 'No golden bull setups found in this scan. Market may be in a bearish phase.';
        }
      }
    }
  }

  if (header) header.style.display = '';
  progress.style.display = 'none';
  btn.disabled   = false;
  btn.textContent = btnLabel || '🔍 SCAN AGAIN';
}

function startScan() {
  return _runScanCore(SCAN_UNIVERSE, {
    btnId: 'scanBtn',           progressId: 'scanProgress',       gridId:    'scanResultsGrid',
    emptyId: 'scanEmpty',       headerId: 'scanResultsHeader',    foundMsgId:'scanFoundMsg',
    statusId: 'scanStatusText', countId: 'scanProgressCount',     barId:     'scanProgressBar',
    btnLabel: '🔍 SCAN AGAIN',
  }, null, null, null, 'scanner');
}

function runScanner() { return startScan(); }

function runCustomScanner() {
  const tickers = window._watchlistTickers || [];
  if (tickers.length === 0) return;
  return _runScanCore(tickers, {
    btnId: 'customScanBtn',       progressId: 'customScanProgress', gridId: 'customScanGrid',
    emptyId: 'customScanEmpty',   headerId: 'customScanHeader',     foundMsgId: 'customScanFoundMsg',
    statusId: 'customScanStatus', countId: 'customScanCount',       barId: 'customScanBar',
    btnLabel: '🔍 SCAN AGAIN',
  }, null, (bulls) => hofRecord(bulls, 'watchlist'), null, 'watchlist');
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

// ── Hall of Fame (Golden Bull Scanner) ───────────────────────────────────────

const HOF_KEY    = 'signalscan_hof';
const ADMIN_EMAIL = 'camilotapia75@gmail.com';
let _hofAdminRecords  = [];
let _hofRenderGen     = 0;
let _hofReturnLoading = false;
let _allHofAdminRecords = [];
let _allRenderGen       = 0;
let _allReturnLoading   = false;
let _minerviniAdminRecords = [];
let _minerviniRenderGen    = 0;
let _minerviniReturnLoading = false;

const HOF_PENDING_KEY = 'signalscan_hof_pending';

function _queueHofPending(signals) {
  try {
    const raw     = localStorage.getItem(HOF_PENDING_KEY);
    const pending = raw ? JSON.parse(raw) : [];
    for (const s of signals) {
      const dup = pending.find(p => p.ticker === s.ticker && Date.now() - p.ts < 7 * 86400000);
      if (!dup) pending.push({ ...s, ts: Date.now() });
    }
    localStorage.setItem(HOF_PENDING_KEY, JSON.stringify(pending.slice(-500)));
  } catch (_) {}
}

async function _syncHofPending() {
  try {
    const raw = localStorage.getItem(HOF_PENDING_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw);
    if (!pending.length) return;
    const signals = pending.map(p => ({ ticker: p.ticker, price: p.price, conviction: p.conviction, source: p.source || 'scanner' }));
    const res = await fetch('/api/hof/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signals }),
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      localStorage.removeItem(HOF_PENDING_KEY);
      console.log(`[HOF] synced ${pending.length} pending record(s)`);
    }
  } catch (_) {}
}

async function hofRecord(bulls, source = 'scanner') {
  const signals = bulls.map(b => ({ ticker: b.ticker, price: b.price, conviction: b.conviction, source }));

  // Save to localStorage immediately so nothing is lost even if all retries fail
  try {
    const raw   = localStorage.getItem(HOF_KEY);
    const store = raw ? JSON.parse(raw) : { since: Date.now(), signals: [] };
    const now   = Date.now();
    for (const b of bulls) {
      const dup = store.signals.find(s => s.ticker === b.ticker && now - s.ts < 7 * 86400000);
      if (!dup) store.signals.push({ ticker: b.ticker, ts: now, price: b.price, conviction: b.conviction, source });
    }
    store.signals = store.signals.slice(-500);
    localStorage.setItem(HOF_KEY, JSON.stringify(store));
  } catch (_) {}

  // Try Supabase up to 3 times with exponential backoff
  const delays = [0, 2000, 5000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await new Promise(r => setTimeout(r, delays[attempt]));
    try {
      const res = await fetch('/api/hof/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signals }),
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) return; // success — done
      console.warn(`[HOF] record attempt ${attempt + 1} got HTTP ${res.status}`);
    } catch (e) {
      console.warn(`[HOF] record attempt ${attempt + 1} failed:`, e.message);
    }
  }

  // All retries failed — queue for sync on next page load
  console.error('[HOF] all retries failed — queuing for next sync');
  _queueHofPending(signals);
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
      .select('ticker,detected_at,signal_price,conviction,source')
      .order('detected_at', { ascending: false })
      .limit(5000);

    if (gen !== _hofRenderGen) return; // a newer renderHoF() started — abort
    if (error) throw error;

    const subtitleEl = document.getElementById('hofSubtitle');
    const titleEl    = document.getElementById('hofTitle');
    const btn        = document.getElementById('hofReturnBtn');

    if (!records?.length) {
      if (isAdmin) {
        section.style.display = 'block';
        if (titleEl)    titleEl.textContent    = '🏆 GOLDEN BULL HOF — ADMIN';
        if (subtitleEl) subtitleEl.textContent = '0 SIGNALS';
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
      const watchlistCount = records.filter(r => r.source === 'watchlist').length;
      const scannerTagged  = records.filter(r => r.source === 'scanner').length;
      const legacyCount    = records.filter(r => !r.source).length;
      const uniqueCount    = new Set(records.map(r => r.ticker)).size;
      if (titleEl)    titleEl.textContent    = '🏆 GOLDEN BULL HOF — ADMIN';
      if (subtitleEl) subtitleEl.textContent = `${uniqueCount} TICKERS · ${scannerTagged} SCANNER · ${watchlistCount} WATCHLIST · ${legacyCount} LEGACY`;
      if (btn) btn.style.display = 'block';
      _injectAdminHofAddForm();
      _renderHofAdminTable(records);
      _hofReturnLoading = false;
      loadHofReturns();
    } else {
      _hofAdminRecords = [];
      const uniqueCount = new Set(records.map(r => r.ticker)).size;
      if (subtitleEl) subtitleEl.textContent = `ALL-TIME · ${uniqueCount} TICKERS`;
      if (btn) btn.style.display = 'none';
      await _renderHofPublicTable(records, gen);
    }
  } catch (e) {
    console.error('[HOF] renderHoF error:', e.message);
    _renderHofLegacy();
  }
}

async function _renderHofPublicTable(records, gen, tbodyId = 'hofTbody', retBtnId = 'hofReturnBtn', getGen = () => _hofRenderGen) {
  const tbody = document.getElementById(tbodyId);
  const btn   = document.getElementById(retBtnId);
  if (btn) btn.style.display = 'none';

  // One entry per ticker — keep OLDEST (first detection price), records sorted DESC
  const byTicker = new Map();
  for (const r of records) byTicker.set(r.ticker, r);
  const allUnique = [...byTicker.values()];
  // Show top 50 by conviction initially (placeholder before prices load)
  const initialView = [...allUnique].sort((a, b) => b.conviction - a.conviction).slice(0, 50);

  const renderRows = (rows) => {
    if (gen !== getGen()) return;
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
  renderRows(initialView.map(r => ({ ...r, pct: null })));

  // Fetch current prices for all unique tickers, compute % gain, sort by best
  try {
    const withPct = await Promise.all(allUnique.map(async r => {
      try {
        const data = await fetchStockData(r.ticker, '1d|5d');
        const cur  = data?.closes?.filter(Boolean).slice(-1)[0];
        if (!cur) return null;
        return { ...r, pct: (cur - parseFloat(r.signal_price)) / parseFloat(r.signal_price) * 100 };
      } catch (_) { return null; }
    }));

    const top30 = withPct.filter(Boolean).sort((a, b) => b.pct - a.pct).slice(0, 30);
    renderRows(top30);
  } catch (e) {
    console.error('[HOF] price fetch failed:', e.message);
  }
}

function _adminSrcBadge(source) {
  if (source === 'watchlist') return '<br><span style="font-size:8px;color:#4d9fff;letter-spacing:0.5px;">WATCHLIST</span>';
  if (source === 'manual')    return '<br><span style="font-size:8px;color:var(--gold);letter-spacing:0.5px;">MANUAL</span>';
  return ''; // scanner (default) and legacy show no badge
}

async function hofAdminDelete(table, ticker) {
  if (!confirm(`Remove ALL ${ticker} entries from ${table}?`)) return;
  const session = (await getSupabase().auth.getSession()).data?.session;
  if (!session?.access_token) { alert('Not authenticated.'); return; }
  try {
    const res = await fetch('/api/hof/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'delete', table, ticker }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok) { alert(`Delete failed: ${data.error}`); return; }
    // Refresh the relevant HOF
    if (table === 'golden_bull_hof')          renderHoF();
    else if (table === 'bull_pen_hof')        renderBullPenHoF();
    else if (table === 'bull_pen_strict_hof') renderStrictHoF();
    else if (table === 'minervini_hof')       renderMinerviniHoF();
  } catch (e) {
    alert(`Delete error: ${e.message}`);
  }
}

function _injectAdminHofAddForm() {
  const section = document.getElementById('hofSection');
  if (!section || document.getElementById('adminHofAddForm')) return;
  const subtitleEl = document.getElementById('hofSubtitle');
  const formHTML = `
  <div id="adminHofAddForm" style="background:rgba(255,204,68,0.05);border:1px solid rgba(255,204,68,0.2);padding:14px 18px;margin-bottom:18px;">
    <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;color:var(--gold);margin-bottom:10px;">⚡ ADMIN — ADD SIGNAL TO HOF</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
      <div><div style="font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:3px;">TICKER</div>
        <input id="aHofTicker" type="text" placeholder="DDOG" maxlength="12" style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:'Space Mono',monospace;font-size:11px;padding:5px 8px;width:80px;outline:none;text-transform:uppercase;"></div>
      <div><div style="font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:3px;">SIGNAL PRICE</div>
        <input id="aHofPrice" type="number" placeholder="123.45" step="0.01" style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:'Space Mono',monospace;font-size:11px;padding:5px 8px;width:100px;outline:none;"></div>
      <div><div style="font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:3px;">CONVICTION %</div>
        <input id="aHofConviction" type="number" placeholder="75" min="0" max="100" style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:'Space Mono',monospace;font-size:11px;padding:5px 8px;width:70px;outline:none;"></div>
      <div><div style="font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:3px;">DATE DETECTED</div>
        <input id="aHofDate" type="date" style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:'Space Mono',monospace;font-size:11px;padding:5px 8px;outline:none;"></div>
      <div><div style="font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:3px;">SOURCE</div>
        <select id="aHofSource" style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:'Space Mono',monospace;font-size:11px;padding:5px 8px;outline:none;">
          <option value="watchlist">WATCHLIST</option>
          <option value="scanner">SCANNER</option>
          <option value="manual">MANUAL</option>
        </select></div>
      <button onclick="hofAdminInsert()" style="background:var(--gold);color:#000;border:none;font-family:'Syne',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;padding:7px 14px;cursor:pointer;white-space:nowrap;">+ ADD</button>
    </div>
    <div style="margin-top:10px;">
      <button onclick="adminReScanToHof()" style="background:rgba(255,204,68,0.12);border:1px solid rgba(255,204,68,0.4);color:var(--gold);font-family:'Syne',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;padding:7px 14px;cursor:pointer;white-space:nowrap;">🔁 RESCAN ALL TICKERS → HOF</button>
      <span style="font-size:9px;color:var(--muted);margin-left:10px;">Detects all current golden bulls and force-adds them (bypasses 7-day dedup)</span>
    </div>
    <div id="aHofMsg" style="font-size:10px;margin-top:8px;letter-spacing:0.5px;min-height:14px;"></div>
  </div>`;
  if (subtitleEl) subtitleEl.insertAdjacentHTML('afterend', formHTML);
}

async function hofAdminInsert() {
  const ticker     = (document.getElementById('aHofTicker')?.value || '').trim().toUpperCase();
  const price      = parseFloat(document.getElementById('aHofPrice')?.value);
  const conviction = parseInt(document.getElementById('aHofConviction')?.value, 10);
  const dateStr    = document.getElementById('aHofDate')?.value;
  const source     = document.getElementById('aHofSource')?.value || 'manual';
  const msgEl      = document.getElementById('aHofMsg');
  const setMsg = (txt, ok) => {
    if (msgEl) {
      msgEl.style.color      = ok ? 'var(--accent)' : 'var(--accent2)';
      msgEl.style.fontSize   = '12px';
      msgEl.style.fontWeight = '600';
      msgEl.textContent      = txt;
    }
    console[ok ? 'log' : 'error']('[ADMIN INSERT]', txt);
  };

  if (!ticker || !/^[A-Z0-9.\-]{1,12}$/.test(ticker)) { setMsg('Invalid ticker.', false); return; }
  if (isNaN(price) || price <= 0)                        { setMsg('Invalid price.', false); return; }
  if (isNaN(conviction) || conviction < 0 || conviction > 100) { setMsg('Invalid conviction (0–100).', false); return; }

  setMsg('Inserting…', true);

  const allowedSources = ['scanner', 'watchlist', 'manual'];
  const record = {
    ticker,
    signal_price: price,
    conviction:   Math.round(conviction),
    source:       allowedSources.includes(source) ? source : 'manual',
  };
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) record.detected_at = d.toISOString();
  }

  try {
    // ── Path 1: server-side API (uses service role key, bypasses RLS) ──────────
    const session = (await getSupabase().auth.getSession()).data?.session;
    const token   = session?.access_token;

    if (token) {
      try {
        const res = await fetch('/api/hof/admin', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ action: 'insert', ticker, price, conviction: record.conviction, source: record.source,
                                    ...(record.detected_at ? { detectedAt: dateStr } : {}) }),
          signal:  AbortSignal.timeout(15000),
        });
        if (res.ok) {
          setMsg(`✓ ${ticker} added to HOF.`, true);
          ['aHofTicker','aHofPrice','aHofConviction','aHofDate'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
          });
          setTimeout(() => renderHoF(), 800);
          return;
        }
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        console.warn('[ADMIN INSERT] API path failed:', errData.error, '— trying direct Supabase');
      } catch (apiErr) {
        console.warn('[ADMIN INSERT] API path threw:', apiErr.message, '— trying direct Supabase');
      }
    }

    // ── Path 2: direct Supabase client (uses user JWT, requires RLS insert policy) ─
    const { error } = await getSupabase().from('golden_bull_hof').insert([record]);
    if (error) throw new Error(`RLS/DB: ${error.message}`);

    setMsg(`✓ ${ticker} added to HOF.`, true);
    ['aHofTicker','aHofPrice','aHofConviction','aHofDate'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    setTimeout(() => renderHoF(), 800);
  } catch (e) {
    setMsg(`Error: ${e.message}`, false);
  }
}

function getDailyRotation(pool, n) {
  const seed = Math.floor(Date.now() / 86400000);
  let s = seed;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

async function adminReScanToHof() {
  const msgEl  = document.getElementById('aHofMsg');
  const setMsg = (txt, ok) => { if (msgEl) { msgEl.style.color = ok ? 'var(--accent)' : 'var(--accent2)'; msgEl.textContent = txt; } };

  setMsg('⏳ Authenticating…', true);
  const session = (await getSupabase().auth.getSession()).data?.session;
  const token   = session?.access_token;
  if (!token) { setMsg('Not authenticated.', false); return; }

  const daily   = getDailyRotation(ROTATION_POOL, 20);
  const tickers = [...new Set([...SCAN_UNIVERSE_CORE, ...daily])];
  const bulls   = [];
  let processed = 0;
  let idx = 0;

  setMsg(`⏳ Scanning 0 / ${tickers.length}…`, true);

  async function worker() {
    while (idx < tickers.length) {
      const ticker = tickers[idx++];
      try {
        const r = await quickAnalyzeForScan(ticker);
        if (r?.isGoldenBull) bulls.push({ ticker: r.ticker, price: r.price, conviction: r.conviction, source: 'scanner' });
      } catch (_) {}
      processed++;
      if (processed % 5 === 0 || processed === tickers.length)
        setMsg(`⏳ Scanning ${processed} / ${tickers.length}… ${bulls.length} found so far`, true);
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker));

  if (!bulls.length) { setMsg('✓ Scan complete — no golden bulls detected right now.', true); return; }

  setMsg(`⏳ Force-inserting ${bulls.length} tickers into HOF…`, true);
  try {
    const res = await fetch('/api/hof/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'batch-insert', signals: bulls }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); setMsg(`Error: ${e.error || res.status}`, false); return; }
    const data = await res.json();
    const names = (data.tickers || bulls.map(b => b.ticker)).slice(0, 10).join(', ');
    setMsg(`✓ Added ${data.inserted} golden bulls to HOF: ${names}${data.inserted > 10 ? '…' : ''}`, true);
    setTimeout(() => renderHoF(), 800);
  } catch (e) {
    setMsg(`Error: ${e.message}`, false);
  }
}

function _renderHofAdminTable(records, tbodyId = 'hofTbody') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  // Deduplicate: one per ticker, keep OLDEST (first detection) — records sorted DESC
  // Always overwriting means last write wins = oldest record per ticker
  const byTicker = new Map();
  for (const r of records) byTicker.set(r.ticker, r);
  const unique = [...byTicker.values()].sort((a, b) => b.conviction - a.conviction);
  tbody.innerHTML = unique.map(s => {
    const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
    return `<tr>
      <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker} ${_adminSrcBadge(s.source)}</td>
      <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
      <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
      <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
      <td style="padding:7px 8px;color:var(--muted);">—</td>
      <td style="padding:4px 8px;"><button onclick="hofAdminDelete('golden_bull_hof','${s.ticker}')" style="background:none;border:none;color:#ff4466;font-size:14px;cursor:pointer;padding:2px 6px;opacity:0.6;line-height:1;" title="Remove ${s.ticker}" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">×</button></td>
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
    // Keep oldest (first detection) per ticker — overwrite gives oldest since records sorted DESC
    const byTicker = new Map();
    for (const r of _hofAdminRecords) byTicker.set(r.ticker, r);
    const toLoad = [...byTicker.values()];
    const results = await Promise.all(toLoad.map(async s => {
      try {
        const data = await fetchStockData(s.ticker, '1d|5d');
        const cur  = data?.closes?.filter(Boolean).slice(-1)[0];
        if (!cur) return null;
        return { ...s, pct: (cur - parseFloat(s.signal_price)) / parseFloat(s.signal_price) * 100 };
      } catch (_) { return null; }
    }));
    const sorted = results.filter(Boolean).sort((a, b) => b.pct - a.pct);
    const tbody = document.getElementById('hofTbody');
    if (tbody && sorted.length) {
      tbody.innerHTML = sorted.map(s => {
        const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
        const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
        const color = s.pct >= 0 ? 'var(--accent)' : 'var(--accent2)';
        return `<tr>
          <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker} ${_adminSrcBadge(s.source)}</td>
          <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
          <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
          <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
          <td style="padding:7px 8px;font-weight:600;color:${color};">${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%</td>
          <td style="padding:4px 8px;"><button onclick="hofAdminDelete('golden_bull_hof','${s.ticker}')" style="background:none;border:none;color:#ff4466;font-size:14px;cursor:pointer;padding:2px 6px;opacity:0.6;line-height:1;" title="Remove ${s.ticker}" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">×</button></td>
        </tr>`;
      }).join('');
    }
  } else {
    // localStorage legacy path
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
          return `<tr>
            <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker}</td>
            <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
            <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
            <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
            <td style="padding:7px 8px;font-weight:600;color:${color};">${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%</td>
          </tr>`;
        }).join('');
      }
    } catch (_) {}
  }

  _hofReturnLoading = false;
  if (btn) { btn.disabled = false; btn.textContent = 'REFRESH RETURNS'; }
}

// ── Combined HoF (Golden Bull Scanner + Watchlist) ────────────────────────────

async function renderAllHoF() {
  const section = document.getElementById('allHofSection');
  if (!section) return;

  const isAdmin = typeof currentUser !== 'undefined' && currentUser?.email === ADMIN_EMAIL;
  const gen = ++_allRenderGen;

  try {
    const sb = getSupabase();
    const { data: records, error } = await sb
      .from('golden_bull_hof')
      .select('ticker,detected_at,signal_price,conviction,source')
      .order('detected_at', { ascending: false })
      .limit(5000);

    if (gen !== _allRenderGen) return;
    if (error) throw error;

    if (!records?.length) { section.style.display = 'none'; return; }

    const watchlistCount = records.filter(r => r.source === 'watchlist').length;
    const scannerCount   = records.length - watchlistCount;

    // Combined HOF is admin-only (public HOF already includes all sources)
    if (!isAdmin) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    _allHofAdminRecords = records;
    const titleEl    = document.getElementById('allHofTitle');
    const subtitleEl = document.getElementById('allHofSubtitle');
    const btn        = document.getElementById('allHofReturnBtn');
    if (titleEl)    titleEl.textContent    = '⚡ COMBINED HOF — SCANNER + WATCHLIST (ADMIN)';
    if (subtitleEl) subtitleEl.textContent = `${scannerCount} SCANNER · ${watchlistCount} WATCHLIST`;
    if (btn) btn.style.display = 'block';
    _renderHofAdminTable(records, 'allHofTbody');
    _allReturnLoading = false;
    loadAllHofReturns();
  } catch (e) {
    console.error('[ALL HOF] render error:', e.message);
    section.style.display = 'none';
  }
}

async function loadAllHofReturns() {
  if (_allReturnLoading) return;
  _allReturnLoading = true;
  const btn = document.getElementById('allHofReturnBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'LOADING...'; }

  const byTicker = new Map();
  for (const r of _allHofAdminRecords) byTicker.set(r.ticker, r);
  const results = await Promise.all([...byTicker.values()].map(async s => {
    try {
      const data = await fetchStockData(s.ticker, '1d|5d');
      const cur  = data?.closes?.filter(Boolean).slice(-1)[0];
      if (!cur) return null;
      return { ...s, pct: (cur - parseFloat(s.signal_price)) / parseFloat(s.signal_price) * 100 };
    } catch (_) { return null; }
  }));
  const sorted = results.filter(Boolean).sort((a, b) => b.pct - a.pct);
  const tbody = document.getElementById('allHofTbody');
  if (tbody && sorted.length) {
    tbody.innerHTML = sorted.map(s => {
      const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
      const color = s.pct >= 0 ? 'var(--accent)' : 'var(--accent2)';
      return `<tr>
        <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker} ${_adminSrcBadge(s.source)}</td>
        <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
        <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
        <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
        <td style="padding:7px 8px;font-weight:600;color:${color};">${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%</td>
        <td style="padding:4px 8px;"><button onclick="hofAdminDelete('golden_bull_hof','${s.ticker}')" style="background:none;border:none;color:#ff4466;font-size:14px;cursor:pointer;padding:2px 6px;opacity:0.6;line-height:1;" title="Remove ${s.ticker}" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">×</button></td>
      </tr>`;
    }).join('');
  }

  _allReturnLoading = false;
  if (btn) { btn.disabled = false; btn.textContent = 'REFRESH RETURNS'; }
}

// ── Theme toggle ──────────────────────────────────────────────────────────────

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('signalscan_theme', isLight ? 'light' : 'dark');
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = isLight ? '☀' : '🌙';
}

function initTheme() {
  const saved = localStorage.getItem('signalscan_theme');
  if (saved === 'light') {
    document.body.classList.add('light-mode');
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = '☀';
  }
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

// ── Bull Pen Scanner ──────────────────────────────────────────────────────────

const BP_HOF_KEY = 'signalscan_bullpen_hof';
let _bpAdminRecords  = [];
let _bpRenderGen     = 0;
let _bpReturnLoading = false;
let _activeScanTab   = 'original';

function switchScanTab(tab) {
  _activeScanTab = tab;

  document.getElementById('scanPanelOriginal').style.display = tab === 'original'   ? '' : 'none';
  document.getElementById('scanPanelBullpen').style.display  = tab === 'bullpen'    ? '' : 'none';
  const strictPanel    = document.getElementById('scanPanelStrict');
  const minerviniPanel = document.getElementById('scanPanelMinervini');
  if (strictPanel)    strictPanel.style.display    = tab === 'strict'    ? '' : 'none';
  if (minerviniPanel) minerviniPanel.style.display = tab === 'minervini' ? '' : 'none';

  document.getElementById('scanBtn').style.display   = tab === 'original' ? '' : 'none';
  document.getElementById('bpScanBtn').style.display = tab === 'bullpen'  ? '' : 'none';
  const strictBtn    = document.getElementById('strictScanBtn');
  const minerviniBtn = document.getElementById('minerviniScanBtn');
  if (strictBtn)    strictBtn.style.display    = tab === 'strict'    ? '' : 'none';
  if (minerviniBtn) minerviniBtn.style.display = tab === 'minervini' ? '' : 'none';

  const origTab      = document.getElementById('scanTabOriginal');
  const bpTab        = document.getElementById('scanTabBullpen');
  const strictTab    = document.getElementById('scanTabStrict');
  const minerviniTab = document.getElementById('scanTabMinervini');
  if (origTab) {
    origTab.style.background = tab === 'original' ? 'var(--gold)' : 'transparent';
    origTab.style.color      = tab === 'original' ? '#000' : 'var(--muted)';
  }
  if (bpTab) {
    bpTab.style.background = tab === 'bullpen' ? 'rgba(255,140,80,0.18)' : 'transparent';
    bpTab.style.color      = tab === 'bullpen' ? '#ff9055' : 'var(--muted)';
  }
  if (strictTab) {
    strictTab.style.background = tab === 'strict' ? 'rgba(100,200,255,0.15)' : 'transparent';
    strictTab.style.color      = tab === 'strict' ? '#64c8ff' : 'var(--muted)';
  }
  if (minerviniTab) {
    minerviniTab.style.background = tab === 'minervini' ? 'rgba(34,211,160,0.15)' : 'transparent';
    minerviniTab.style.color      = tab === 'minervini' ? '#22d3a0' : 'var(--muted)';
  }
}

async function quickAnalyzeForScanV2(ticker, spyReturn) {
  try {
    const data = await fetchStockData(ticker, getScanTimeframe());
    if (!data || !data.closes) return { _networkFail: true };
    const closes = data.closes.filter(Boolean);
    if (closes.length < 45) return null;
    const indData = computeIndicators(data);
    if (!indData) return null;

    if (!ticker.includes('-USD') && indData.lastClose < 3) return null;

    const highs   = data.highs.filter(Boolean);
    const lows    = data.lows.filter(Boolean);

    const yearHigh  = Math.max(...highs);
    const yearLow   = Math.min(...lows);
    const rangeSpan = yearHigh - yearLow;
    const nearYearlyLow     = rangeSpan > 0 && (indData.lastClose - yearLow) / rangeSpan < 0.20;
    const e50               = calcEMA(closes, 50);
    const ema50Collapsing   = e50.length >= 9 && (e50[e50.length-1] - e50[e50.length-9]) / e50[e50.length-9] < -0.08;
    if (nearYearlyLow && ema50Collapsing) return null;

    const sr  = findSupportResistance(highs, lows, closes);
    const pa  = analyzePriceAction(data);
    const rev  = generateAnalysis(ticker, indData, sr, pa);
    const cont = generateContinuationAnalysis(ticker, indData, sr, pa);

    let revScore  = rev.score;
    let contScore = cont.score;

    const { volRatio, lastClose, ema20, atr } = indData;

    // 1. Volume surge — pre-pump anomaly detection
    if (volRatio > 2.5) {
      revScore  = Math.min(1, revScore  + 0.30);
      contScore = Math.min(1, contScore + 0.30);
    } else if (volRatio > 1.8) {
      revScore  = Math.min(1, revScore  + 0.15);
      contScore = Math.min(1, contScore + 0.15);
    }

    // 2. Near 52-week high with elevated volume = breakout momentum (inverted from V1 penalty)
    const near52High = (yearHigh - lastClose) / yearHigh < 0.08;
    if (near52High && volRatio > 1.2) {
      revScore  = Math.min(1, revScore  + 0.25);
      contScore = Math.min(1, contScore + 0.20);
    }

    // 3. Bollinger squeeze breakout — short-term ATR expanding vs long-term ATR
    const atrShort = calcATR(highs, lows, closes, 5);
    if (atrShort > atr * 1.30 && lastClose > ema20) {
      contScore = Math.min(1, contScore + 0.20);
    }

    // 4. Relative strength vs SPY — 20-day return comparison
    if (spyReturn !== null && closes.length >= 21) {
      const stockReturn = (lastClose - closes[closes.length - 21]) / closes[closes.length - 21] * 100;
      const rsVsSpy = stockReturn - spyReturn;
      if (rsVsSpy > 8)        contScore = Math.min(1, contScore + 0.20);
      else if (rsVsSpy > 4)   contScore = Math.min(1, contScore + 0.10);
      else if (rsVsSpy < -10) contScore = Math.max(-1, contScore - 0.20);
    }

    const isGoldenBull = revScore > 0.2 && contScore > 0.25;

    // True conviction range 0–100 (V1 floors at 50)
    const avgScore = (revScore + contScore) / 2;
    const conviction = Math.round(Math.min(100, Math.max(0, 50 + (avgScore - 0.2) / 0.8 * 50)));

    console.log(`[BULL PEN] ${ticker}: rev=${revScore.toFixed(2)} cont=${contScore.toFixed(2)} => ${isGoldenBull ? '🧪 BULL' : 'skip'}`);

    const topSignal = rev.keySignals[0]?.text || cont.keySignals[0]?.text || '';
    const spark = closes.slice(-30);
    const nearestRes = sr.resistance.filter(r => r.price > lastClose)[0];
    const estimatedUpside = nearestRes
      ? (nearestRes.price - lastClose) / lastClose * 100
      : Math.max(0, (yearHigh - lastClose) / lastClose * 100);

    return { ticker, price: lastClose, isGoldenBull, conviction, topSignal, revScore, contScore, spark, estimatedUpside };
  } catch (e) {
    console.error(`[BULL PEN] ${ticker}: failed —`, e.message);
    return { _networkFail: true };
  }
}

async function runBullPenScanner() {
  let spyReturn = null;
  try {
    const spyData = await fetchStockData('SPY', getScanTimeframe());
    if (spyData?.closes) {
      const sc = spyData.closes.filter(Boolean);
      if (sc.length >= 21) spyReturn = (sc[sc.length-1] - sc[sc.length-21]) / sc[sc.length-21] * 100;
    }
    console.log(`[BULL PEN] SPY 20-day return: ${spyReturn?.toFixed(2) ?? 'unavailable'}%`);
  } catch (_) {}

  return _runScanCore(SCAN_UNIVERSE, {
    btnId:     'bpScanBtn',      progressId: 'bpProgress',     gridId:    'bpResultsGrid',
    emptyId:   'bpEmpty',        headerId:   'bpResultsHeader', foundMsgId:'bpFoundMsg',
    statusId:  'bpStatusText',   countId:    'bpProgressCount', barId:     'bpProgressBar',
    btnLabel:  '🧪 SCAN AGAIN',
  }, (t) => quickAnalyzeForScanV2(t, spyReturn), hofRecordBullPen, renderBullPenHoF);
}

async function hofRecordBullPen(bulls) {
  try {
    await fetch('/api/bullpen/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signals: bulls.map(b => ({ ticker: b.ticker, price: b.price, conviction: b.conviction })) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.error('[BP HOF] record failed:', e.message);
  }
  try {
    const raw   = localStorage.getItem(BP_HOF_KEY);
    const store = raw ? JSON.parse(raw) : { since: Date.now(), signals: [] };
    const now   = Date.now();
    for (const b of bulls) {
      const dup = store.signals.find(s => s.ticker === b.ticker && now - s.ts < 7 * 86400000);
      if (!dup) store.signals.push({ ticker: b.ticker, ts: now, price: b.price, conviction: b.conviction });
    }
    store.signals = store.signals.slice(-500);
    localStorage.setItem(BP_HOF_KEY, JSON.stringify(store));
  } catch (_) {}
}

async function renderBullPenHoF() {
  const section = document.getElementById('bpHofSection');
  if (!section) return;

  const isAdmin = typeof currentUser !== 'undefined' && currentUser?.email === ADMIN_EMAIL;
  const gen = ++_bpRenderGen;

  try {
    const sb = getSupabase();
    const { data: records, error } = await sb
      .from('bull_pen_hof')
      .select('ticker,detected_at,signal_price,conviction')
      .order('detected_at', { ascending: false })
      .limit(1000);

    if (gen !== _bpRenderGen) return;
    if (error) throw error;

    if (!records?.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    const titleEl    = document.getElementById('bpHofTitle');
    const subtitleEl = document.getElementById('bpHofSubtitle');
    const btn        = document.getElementById('bpHofReturnBtn');

    if (isAdmin) {
      _bpAdminRecords = records;
      if (titleEl)    titleEl.textContent    = '🧪 BULL PEN HALL OF FAME — ADMIN';
      if (subtitleEl) subtitleEl.textContent = `ADMIN VIEW — ALL ${records.length} SIGNALS`;
      if (btn) btn.style.display = 'block';
      _renderBullPenAdminTable(records);
      _bpReturnLoading = false;
      loadBullPenReturns();
    } else {
      _bpAdminRecords = [];
      if (titleEl)    titleEl.textContent    = '🧪 BULL PEN HALL OF FAME';
      if (subtitleEl) subtitleEl.textContent = `EXPERIMENTAL FORMULA · ${records.length} SIGNALS DETECTED`;
      if (btn) btn.style.display = 'none';
      await _renderBullPenPublicTable(records, gen);
    }
  } catch (e) {
    console.error('[BP HOF] render error:', e.message);
    section.style.display = 'none';
  }
}

async function _renderBullPenPublicTable(records, gen) {
  const tbody = document.getElementById('bpHofTbody');
  if (!tbody) return;

  // Keep oldest (first detection) per ticker
  const byTicker = new Map();
  for (const r of records) byTicker.set(r.ticker, r);
  const unique = [...byTicker.values()].sort((a, b) => b.conviction - a.conviction).slice(0, 30);

  const renderRows = (rows) => {
    if (gen !== _bpRenderGen) return;
    tbody.innerHTML = rows.map(s => {
      const lbl    = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const price  = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
      const color  = s.pct != null ? (s.pct >= 0 ? 'var(--accent)' : 'var(--accent2)') : 'var(--muted)';
      const pctStr = s.pct != null ? `${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%` : '—';
      return `<tr>
        <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#ff9055;padding:7px 8px;">${s.ticker}</td>
        <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
        <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
        <td style="padding:7px 8px;color:#ff9055;">${s.conviction}%</td>
        <td style="padding:7px 8px;font-weight:600;color:${color};">${pctStr}</td>
      </tr>`;
    }).join('');
  };

  renderRows(unique.map(r => ({ ...r, pct: null })));

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

    const withPct = unique.map(r => {
      const cur = prices[r.ticker];
      if (!cur) return null;
      return { ...r, pct: (cur - parseFloat(r.signal_price)) / parseFloat(r.signal_price) * 100 };
    }).filter(Boolean);

    renderRows(withPct.sort((a, b) => b.pct - a.pct).slice(0, 20));
  } catch (e) {
    console.error('[BP HOF] price fetch failed:', e.message);
  }
}

function _renderBullPenAdminTable(records) {
  const tbody = document.getElementById('bpHofTbody');
  if (!tbody) return;
  tbody.innerHTML = records.map(s => {
    const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
    const ts    = new Date(s.detected_at).getTime();
    return `<tr>
      <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#ff9055;padding:7px 8px;">${s.ticker}</td>
      <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
      <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
      <td style="padding:7px 8px;color:#ff9055;">${s.conviction}%</td>
      <td id="bpret-${s.ticker}-${ts}" style="padding:7px 8px;color:var(--muted);">—</td>
      <td style="padding:4px 8px;"><button onclick="hofAdminDelete('bull_pen_hof','${s.ticker}')" style="background:none;border:none;color:#ff4466;font-size:14px;cursor:pointer;padding:2px 6px;opacity:0.6;line-height:1;" title="Remove ${s.ticker}" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">×</button></td>
    </tr>`;
  }).join('');
}

async function loadBullPenReturns() {
  if (_bpReturnLoading) return;
  _bpReturnLoading = true;
  const btn = document.getElementById('bpHofReturnBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'LOADING...'; }

  const byTicker = new Map();
  for (const r of _bpAdminRecords) byTicker.set(r.ticker, r);
  const toLoad = [...byTicker.values()];
  const results = await Promise.all(toLoad.map(async s => {
    try {
      const data = await fetchStockData(s.ticker, '1d|5d');
      const cur  = data?.closes?.filter(Boolean).slice(-1)[0];
      if (!cur) return null;
      return { ...s, pct: (cur - parseFloat(s.signal_price)) / parseFloat(s.signal_price) * 100 };
    } catch (_) { return null; }
  }));
  const sorted = results.filter(Boolean).sort((a, b) => b.pct - a.pct);
  const tbody  = document.getElementById('bpHofTbody');
  if (tbody && sorted.length) {
    tbody.innerHTML = sorted.map(s => {
      const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
      const color = s.pct >= 0 ? 'var(--accent)' : 'var(--accent2)';
      return `<tr>
        <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#ff9055;padding:7px 8px;">${s.ticker}</td>
        <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
        <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
        <td style="padding:7px 8px;color:#ff9055;">${s.conviction}%</td>
        <td style="padding:7px 8px;font-weight:600;color:${color};">${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%</td>
        <td style="padding:4px 8px;"><button onclick="hofAdminDelete('bull_pen_hof','${s.ticker}')" style="background:none;border:none;color:#ff4466;font-size:14px;cursor:pointer;padding:2px 6px;opacity:0.6;line-height:1;" title="Remove ${s.ticker}" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">×</button></td>
      </tr>`;
    }).join('');
  }

  _bpReturnLoading = false;
  if (btn) { btn.disabled = false; btn.textContent = 'REFRESH RETURNS'; }
}

// ── Bull Pen STRICT Scanner ───────────────────────────────────────────────────
// Admin-only. Hard filters: full EMA stack, RSI bull zone, MACD+, relative
// strength > SPY, market regime gate, higher score thresholds, curated universe.

const STRICT_UNIVERSE = [
  // Mega-cap tech
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','AVGO',
  // Software / internet
  'CRM','ADBE','NOW','PANW','CRWD','ZS','NET','DDOG','FTNT','NFLX','ORCL','INTU','ACN','UBER','PYPL',
  // Semiconductors
  'AMD','QCOM','AMAT','LRCX','KLAC','ASML','TSM','MU','MRVL','TXN',
  // Financials
  'V','MA','JPM','GS','MS','BLK','SPGI','MCO','AXP','CME','ICE',
  // Healthcare
  'UNH','LLY','ABBV','TMO','DHR','ISRG','AMGN','REGN','VRTX','SYK','MRK',
  // Consumer
  'HD','LOW','COST','WMT','MCD','CMG','NKE','TJX','BKNG',
  // Industrial / defense
  'CAT','HON','LMT','RTX','GE','ETN',
  // Energy
  'XOM','CVX','COP',
  // Infrastructure / other quality
  'NEE','PGR','CB','EQIX','BRK-B',
];

let _strictAdminRecords  = [];
let _strictRenderGen     = 0;
let _strictReturnLoading = false;

async function quickAnalyzeForStrict(ticker, spyReturn3m, spyAboveEma50) {
  try {
    if (!spyAboveEma50) return null; // market regime gate

    const data = await fetchStockData(ticker, '1d|1y');
    if (!data || !data.closes) return { _networkFail: true };
    const closes = data.closes.filter(Boolean);
    if (closes.length < 65) return null;

    const indData = computeIndicators(data);
    if (!indData) return null;

    const { rsi, macd, ema20, ema50, lastClose } = indData;

    if (lastClose < 15)            return null; // no sub-$15 stocks
    if (lastClose < ema20)         return null; // price below EMA20
    if (ema20 < ema50)             return null; // EMA20 below EMA50 — not stacked
    if (rsi < 50 || rsi > 70)      return null; // outside bull zone
    if (macd.histogram <= 0)       return null; // MACD must be positive

    // Relative strength: stock must outperform SPY over past 3 months (~65 trading days)
    if (spyReturn3m !== null) {
      const stockReturn3m = (lastClose - closes[closes.length - 65]) / closes[closes.length - 65] * 100;
      if (stockReturn3m < spyReturn3m) return null;
    }

    // Base-building: recent 10-day range should not be wider than 2× the prior 20-day range
    const recent = closes.slice(-10);
    const prior  = closes.slice(-30, -10);
    if (prior.length >= 10) {
      const recentRange = (Math.max(...recent) - Math.min(...recent)) / lastClose;
      const priorRange  = (Math.max(...prior)  - Math.min(...prior))  / prior[prior.length - 1];
      if (recentRange > priorRange * 2) return null; // explosive/panic move, not a base
    }

    const highs = data.highs.filter(Boolean);
    const lows  = data.lows.filter(Boolean);
    const sr   = findSupportResistance(highs, lows, closes);
    const pa   = analyzePriceAction(data);
    const rev  = generateAnalysis(ticker, indData, sr, pa);
    const cont = generateContinuationAnalysis(ticker, indData, sr, pa);

    // Higher score thresholds than original (0.2/0.25) or bull pen (0.2/0.25)
    if (rev.score <= 0.35 || cont.score <= 0.40) return null;

    const conviction = Math.round(Math.min(100, Math.max(50, 50 + (rev.score + cont.score - 0.75) / 0.75 * 50)));
    const topSignal  = rev.keySignals[0]?.text || cont.keySignals[0]?.text || '';
    const spark      = closes.slice(-30);
    const yearHigh   = Math.max(...highs);
    const nearestRes = sr.resistance.filter(r => r.price > lastClose)[0];
    const estimatedUpside = nearestRes
      ? (nearestRes.price - lastClose) / lastClose * 100
      : Math.max(0, (yearHigh - lastClose) / lastClose * 100);

    console.log(`[STRICT] ${ticker}: rev=${rev.score.toFixed(2)} cont=${cont.score.toFixed(2)} rsi=${rsi.toFixed(1)} => 🎯 STRICT BULL`);
    return { ticker, price: lastClose, isGoldenBull: true, conviction, topSignal, revScore: rev.score, contScore: cont.score, spark, estimatedUpside };
  } catch (e) {
    console.error(`[STRICT] ${ticker}: failed —`, e.message);
    return { _networkFail: true };
  }
}

async function runStrictScanner() {
  let spyReturn3m    = null;
  let spyAboveEma50  = false;
  try {
    const spyData = await fetchStockData('SPY', '1d|1y');
    if (spyData?.closes) {
      const sc = spyData.closes.filter(Boolean);
      if (sc.length >= 65) {
        spyReturn3m   = (sc[sc.length - 1] - sc[sc.length - 65]) / sc[sc.length - 65] * 100;
      }
      const spyEma50 = calcEMA(sc, 50);
      spyAboveEma50  = sc[sc.length - 1] > spyEma50[spyEma50.length - 1];
      console.log(`[STRICT] SPY: 3m=${spyReturn3m?.toFixed(2)}% aboveEMA50=${spyAboveEma50}`);
    }
  } catch (_) {}

  if (!spyAboveEma50) {
    const el = document.getElementById('strictStatusText');
    if (el) el.textContent = 'Market regime: SPY below EMA50 — strict signals suppressed.';
  }

  return _runScanCore(STRICT_UNIVERSE, {
    btnId:     'strictScanBtn',      progressId: 'strictProgress',      gridId:    'strictResultsGrid',
    emptyId:   'strictEmpty',        headerId:   'strictResultsHeader',  foundMsgId:'strictFoundMsg',
    statusId:  'strictStatusText',   countId:    'strictProgressCount',  barId:     'strictProgressBar',
    btnLabel:  '🎯 SCAN AGAIN',
  }, (t) => quickAnalyzeForStrict(t, spyReturn3m, spyAboveEma50), hofRecordStrict, renderStrictHoF, 'strict');
}

async function hofRecordStrict(bulls) {
  try {
    await fetch('/api/bullpen/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'bull_pen_strict_hof', signals: bulls.map(b => ({ ticker: b.ticker, price: b.price, conviction: b.conviction })) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.error('[STRICT HOF] record failed:', e.message);
  }
}

async function renderStrictHoF() {
  const section = document.getElementById('strictHofSection');
  if (!section) return;
  const gen = ++_strictRenderGen;

  try {
    const sb = getSupabase();
    const { data: records, error } = await sb
      .from('bull_pen_strict_hof')
      .select('ticker,detected_at,signal_price,conviction')
      .order('detected_at', { ascending: false })
      .limit(1000);

    if (gen !== _strictRenderGen) return;
    if (error) throw error;
    if (!records?.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    _strictAdminRecords   = records;

    const titleEl    = document.getElementById('strictHofTitle');
    const subtitleEl = document.getElementById('strictHofSubtitle');
    const uniqueCount = new Set(records.map(r => r.ticker)).size;
    if (titleEl)    titleEl.textContent    = '🎯 BULL PEN STRICT — HALL OF FAME';
    if (subtitleEl) subtitleEl.textContent = `STRICT ENGINE · ${uniqueCount} TICKERS DETECTED`;

    _renderStrictAdminTable(records);
    const btn = document.getElementById('strictHofReturnBtn');
    if (btn) btn.style.display = 'block';
  } catch (e) {
    console.error('[STRICT HOF] renderStrictHoF error:', e.message);
  }
}

function _renderStrictAdminTable(records) {
  const tbody = document.getElementById('strictHofTbody');
  if (!tbody) return;
  tbody.innerHTML = records.map(s => {
    const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
    return `<tr>
      <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#64c8ff;padding:7px 8px;">${s.ticker}</td>
      <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
      <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
      <td style="padding:7px 8px;color:#64c8ff;">${s.conviction}%</td>
      <td id="sret-${s.ticker}-${new Date(s.detected_at).getTime()}" style="padding:7px 8px;color:var(--muted);">—</td>
      <td style="padding:4px 8px;"><button onclick="hofAdminDelete('bull_pen_strict_hof','${s.ticker}')" style="background:none;border:none;color:#ff4466;font-size:14px;cursor:pointer;padding:2px 6px;opacity:0.6;line-height:1;" title="Remove ${s.ticker}" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">×</button></td>
    </tr>`;
  }).join('');
}

async function loadStrictReturns() {
  if (_strictReturnLoading) return;
  _strictReturnLoading = true;
  const btn = document.getElementById('strictHofReturnBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'LOADING...'; }

  const byTicker = new Map();
  for (const r of _strictAdminRecords) byTicker.set(r.ticker, r);
  const toLoad = [...byTicker.values()];

  const results = await Promise.all(toLoad.map(async s => {
    try {
      const data = await fetchStockData(s.ticker, '1d|5d');
      const cur  = data?.closes?.filter(Boolean).slice(-1)[0];
      if (!cur) return null;
      return { ...s, pct: (cur - parseFloat(s.signal_price)) / parseFloat(s.signal_price) * 100 };
    } catch (_) { return null; }
  }));
  const sorted = results.filter(Boolean).sort((a, b) => b.pct - a.pct);
  const tbody  = document.getElementById('strictHofTbody');
  if (tbody && sorted.length) {
    tbody.innerHTML = sorted.map(s => {
      const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
      const color = s.pct >= 0 ? 'var(--accent)' : 'var(--accent2)';
      return `<tr>
        <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#64c8ff;padding:7px 8px;">${s.ticker}</td>
        <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
        <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
        <td style="padding:7px 8px;color:#64c8ff;">${s.conviction}%</td>
        <td style="padding:7px 8px;font-weight:600;color:${color};">${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%</td>
        <td style="padding:4px 8px;"><button onclick="hofAdminDelete('bull_pen_strict_hof','${s.ticker}')" style="background:none;border:none;color:#ff4466;font-size:14px;cursor:pointer;padding:2px 6px;opacity:0.6;line-height:1;" title="Remove ${s.ticker}" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">×</button></td>
      </tr>`;
    }).join('');
  }

  _strictReturnLoading = false;
  if (btn) { btn.disabled = false; btn.textContent = 'REFRESH RETURNS'; }
}

// ── Minervini SEPA Scanner ────────────────────────────────────────────────────
// Admin-only. Implements Minervini's Trend Template: full EMA stack (price >
// EMA50 > EMA150 > EMA200, EMA200 rising), top-quartile 52-week range,
// RS vs SPY, and volume accumulation scoring. No reversal/mean-reversion bias.

const MINERVINI_UNIVERSE = [
  // Mega-cap tech
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','AVGO',
  // Software / SaaS / cloud
  'CRM','ADBE','NOW','PANW','CRWD','ZS','NET','DDOG','FTNT','INTU','ORCL','ACN','UBER','PYPL',
  'SNOW','HUBS','WDAY','MDB','GTLB','BILL','PCTY','VEEV','SMAR','ZI',
  // Semiconductors
  'AMD','QCOM','AMAT','LRCX','KLAC','ASML','TSM','MU','MRVL','TXN','ON','MPWR','WOLF','ENTG',
  // AI / data infrastructure
  'PLTR','ARM','ANET','SMCI','AI','DELL','HPE',
  // Streaming / consumer tech
  'NFLX','SPOT','LYV','RBLX','ROKU',
  // Fintech / payments
  'V','MA','AXP','COIN','SQ','AFRM','SOFI','NU',
  // Traditional financials
  'JPM','GS','MS','BLK','SPGI','MCO','CME','ICE','COF','SCHW','FI','GPN',
  // Healthcare / biotech
  'UNH','LLY','ABBV','TMO','DHR','ISRG','AMGN','REGN','VRTX','SYK','MRK','ELV','IDXX',
  'EXAS','GEHC','DXCM','RVMD','CAVA',
  // Consumer discretionary
  'HD','LOW','COST','WMT','MCD','CMG','NKE','TJX','BKNG','LULU','ROST','ULTA','ONON','DECK',
  'ABNB','LYFT','DASH','EXPE',
  // Industrial / defense / infrastructure
  'CAT','HON','LMT','RTX','GE','ETN','DE','NOC','GD','AXON','PWR','URI','CSGP','FSLR',
  // Energy
  'XOM','CVX','SLB','OXY',
  // Communication / media / ad-tech
  'DIS','CMCSA','APP','TTD','MGNI',
  // International / ADR
  'SHOP','MELI','SE','TSM',
  // Blue chips / defensive
  'JNJ','PG','KO','PEP','ABT','AMZN',
];

async function quickAnalyzeMinervini(ticker, spyData) {
  try {
    const data = await fetchStockData(ticker, '1d|1y');
    if (!data || !data.closes) return { _networkFail: true };
    const closes  = data.closes.filter(Boolean);
    const highs   = data.highs.filter(Boolean);
    const lows    = data.lows.filter(Boolean);
    const volumes = data.volumes.filter(Boolean);
    if (closes.length < 210) return null;

    const lastClose = closes[closes.length - 1];
    if (lastClose < 10) return null;

    // Calculate full EMA stack
    const e20  = calcEMA(closes, 20);
    const e50  = calcEMA(closes, 50);
    const e150 = calcEMA(closes, 150);
    const e200 = calcEMA(closes, 200);
    const ema20  = e20[e20.length - 1];
    const ema50  = e50[e50.length - 1];
    const ema150 = e150[e150.length - 1];
    const ema200 = e200[e200.length - 1];
    const ema200_4wAgo = e200.length >= 22 ? e200[e200.length - 22] : null;

    const yearHigh = Math.max(...highs);
    const yearLow  = Math.min(...lows);

    // ── SEPA TREND TEMPLATE (hard gates — all must pass) ─────────────────
    if (lastClose <= ema200)  return null;  // price above 200
    if (lastClose <= ema150)  return null;  // price above 150
    if (lastClose <= ema50)   return null;  // price above 50
    if (ema150    <= ema200)  return null;  // 150 > 200
    if (ema50     <= ema150)  return null;  // 50 > 150
    // EMA200 must be trending up (not rolling over)
    if (ema200_4wAgo && ema200 <= ema200_4wAgo) return null;
    // Price in top 25% of 52-week range (buy strength, not weakness)
    const rangePos = (yearHigh > yearLow) ? (lastClose - yearLow) / (yearHigh - yearLow) : 0;
    if (rangePos < 0.75) return null;
    // Price > 30% above 52-week low (not a recovery-from-crash play)
    if ((lastClose - yearLow) / yearLow < 0.30) return null;
    // RSI in momentum zone 45–82 (confirmed trend without exhaustion)
    const rsi = calcRSI(closes, 14);
    if (!rsi || rsi < 45 || rsi > 82) return null;
    // Market regime: SPY must be above its 50-day EMA
    if (spyData) {
      const sc   = spyData.closes.filter(Boolean);
      const se50 = calcEMA(sc, 50);
      if (sc[sc.length - 1] < se50[se50.length - 1] * 0.97) return null;
    }

    // ── CONVICTION SCORING ────────────────────────────────────────────────
    let score = 0;

    // 1. EMA20 alignment (price near EMA20 = healthy pullback entry)
    const pctAboveEma20 = (lastClose - ema20) / ema20;
    if (pctAboveEma20 >= 0 && pctAboveEma20 <= 0.03)      score += 0.25;
    else if (pctAboveEma20 > 0.03 && pctAboveEma20 <= 0.08) score += 0.15;
    else if (pctAboveEma20 > 0.08)                          score += 0.05;

    // 2. MACD positive and expanding
    const macd = calcMACD(closes);
    if (macd.histogram > 0 && macd.macd > 0)  score += 0.20;
    else if (macd.histogram > 0)               score += 0.08;

    // 3. Volume accumulation: up-day volume > down-day volume (last 20 days)
    const rCloses  = closes.slice(-21);
    const rVolumes = volumes.slice(-21);
    let upVol = 0, downVol = 0;
    for (let i = 1; i < rCloses.length; i++) {
      if (rCloses[i] > rCloses[i - 1]) upVol  += rVolumes[i];
      else                              downVol += rVolumes[i];
    }
    if (upVol > downVol * 1.3) score += 0.20;
    else if (upVol > downVol)  score += 0.10;

    // 4. Relative strength vs SPY (3-month ~63 trading days)
    if (spyData && closes.length >= 64) {
      const sc = spyData.closes.filter(Boolean);
      const stockRet3m = (lastClose - closes[closes.length - 64]) / closes[closes.length - 64];
      const spyRet3m   = sc.length >= 64
        ? (sc[sc.length - 1] - sc[sc.length - 64]) / sc[sc.length - 64]
        : 0;
      const rs = stockRet3m - spyRet3m;
      if (rs > 0.20)      score += 0.25;
      else if (rs > 0.08) score += 0.15;
      else if (rs > 0)    score += 0.05;
    }

    // 5. Near 52-week high (breakout proximity)
    const distFromHigh = (yearHigh - lastClose) / yearHigh;
    if (distFromHigh < 0.05)      score += 0.10;
    else if (distFromHigh < 0.12) score += 0.05;

    // Require minimum conviction threshold
    if (score < 0.35) return null;

    const conviction = Math.round(Math.min(100, Math.max(50, 50 + (score - 0.35) / 0.65 * 50)));

    let topSignal;
    if (pctAboveEma20 <= 0.03)   topSignal = 'EMA20 pullback entry — Minervini pivot zone';
    else if (distFromHigh < 0.05) topSignal = 'Within 5% of 52-week high — breakout watch';
    else                          topSignal = 'Full EMA stack aligned — Stage 2 uptrend';

    const spark = closes.slice(-30);
    const estimatedUpside = (yearHigh - lastClose) / lastClose * 100;

    console.log(`[MINERVINI] ${ticker}: score=${score.toFixed(2)} rsi=${rsi.toFixed(1)} rangePos=${(rangePos*100).toFixed(0)}% => ✅ SIGNAL`);
    return { ticker, price: lastClose, isGoldenBull: true, conviction, topSignal, spark, estimatedUpside, score };
  } catch (e) {
    console.error(`[MINERVINI] ${ticker}: failed —`, e.message);
    return { _networkFail: true };
  }
}

async function runMinerviniScanner() {
  let spyData = null;
  try {
    spyData = await fetchStockData('SPY', '1d|1y');
  } catch (_) {}

  await _runScanCore(
    [...new Set(MINERVINI_UNIVERSE)],
    {
      btnId: 'minerviniScanBtn', progressId: 'minerviniProgress', gridId: 'minerviniResultsGrid',
      emptyId: 'minerviniEmpty', headerId: 'minerviniResultsHeader', foundMsgId: 'minerviniFoundMsg',
      statusId: 'minerviniStatusText', countId: 'minerviniProgressCount', barId: 'minerviniProgressBar',
      btnLabel: '📈 SCAN MINERVINI',
    },
    (t) => quickAnalyzeMinervini(t, spyData),
    hofRecordMinervini,
    renderMinerviniHoF,
    'scanner'
  );
}

async function hofRecordMinervini(bulls) {
  if (!bulls.length) return;
  try {
    await fetch('/api/bullpen/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'minervini_hof', signals: bulls.map(b => ({ ticker: b.ticker, price: b.price, conviction: b.conviction })) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (_) {}
}

async function renderMinerviniHoF() {
  const section = document.getElementById('minerviniHofSection');
  if (!section) return;
  const gen = ++_minerviniRenderGen;

  try {
    const { data: records, error } = await getSupabase()
      .from('minervini_hof')
      .select('ticker,detected_at,signal_price,conviction')
      .order('detected_at', { ascending: false })
      .limit(1000);

    if (gen !== _minerviniRenderGen) return;
    if (error) throw error;
    if (!records?.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    _minerviniAdminRecords = records;

    const uniqueCount = new Set(records.map(r => r.ticker)).size;
    const titleEl    = document.getElementById('minerviniHofTitle');
    const subtitleEl = document.getElementById('minerviniHofSubtitle');
    if (titleEl)    titleEl.textContent    = '📈 MINERVINI SEPA — HALL OF FAME';
    if (subtitleEl) subtitleEl.textContent = `TREND TEMPLATE · ${uniqueCount} TICKERS DETECTED`;

    _renderMinerviniAdminTable(records);
    const btn = document.getElementById('minerviniHofReturnBtn');
    if (btn) btn.style.display = 'block';
    _minerviniReturnLoading = false;
    loadMinerviniReturns();
  } catch (e) {
    console.error('[MINERVINI HOF] renderMinerviniHoF error:', e.message);
  }
}

function _renderMinerviniAdminTable(records) {
  const tbody = document.getElementById('minerviniHofTbody');
  if (!tbody) return;
  const byTicker = new Map();
  for (const r of records) byTicker.set(r.ticker, r);
  const unique = [...byTicker.values()].sort((a, b) => b.conviction - a.conviction);
  tbody.innerHTML = unique.map(s => {
    const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
    return `<tr>
      <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#22d3a0;padding:7px 8px;">${s.ticker}</td>
      <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
      <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
      <td style="padding:7px 8px;color:#22d3a0;">${s.conviction}%</td>
      <td id="mret-${s.ticker}-${new Date(s.detected_at).getTime()}" style="padding:7px 8px;color:var(--muted);">—</td>
      <td style="padding:4px 8px;"><button onclick="hofAdminDelete('minervini_hof','${s.ticker}')" style="background:none;border:none;color:#ff4466;font-size:14px;cursor:pointer;padding:2px 6px;opacity:0.6;line-height:1;" title="Remove ${s.ticker}" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">×</button></td>
    </tr>`;
  }).join('');
}

async function loadMinerviniReturns() {
  if (_minerviniReturnLoading) return;
  _minerviniReturnLoading = true;
  const btn = document.getElementById('minerviniHofReturnBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'LOADING...'; }

  const byTicker = new Map();
  for (const r of _minerviniAdminRecords) byTicker.set(r.ticker, r);
  const results = await Promise.all([...byTicker.values()].map(async s => {
    try {
      const data = await fetchStockData(s.ticker, '1d|5d');
      const cur  = data?.closes?.filter(Boolean).slice(-1)[0];
      if (!cur) return null;
      return { ...s, pct: (cur - parseFloat(s.signal_price)) / parseFloat(s.signal_price) * 100 };
    } catch (_) { return null; }
  }));
  const sorted = results.filter(Boolean).sort((a, b) => b.pct - a.pct);
  const tbody  = document.getElementById('minerviniHofTbody');
  if (tbody && sorted.length) {
    tbody.innerHTML = sorted.map(s => {
      const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
      const color = s.pct >= 0 ? 'var(--accent)' : 'var(--accent2)';
      return `<tr>
        <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#22d3a0;padding:7px 8px;">${s.ticker}</td>
        <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
        <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
        <td style="padding:7px 8px;color:#22d3a0;">${s.conviction}%</td>
        <td style="padding:7px 8px;font-weight:600;color:${color};">${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%</td>
        <td style="padding:4px 8px;"><button onclick="hofAdminDelete('minervini_hof','${s.ticker}')" style="background:none;border:none;color:#ff4466;font-size:14px;cursor:pointer;padding:2px 6px;opacity:0.6;line-height:1;" title="Remove ${s.ticker}" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">×</button></td>
      </tr>`;
    }).join('');
  }

  _minerviniReturnLoading = false;
  if (btn) { btn.disabled = false; btn.textContent = 'REFRESH RETURNS'; }
}

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await _migrateHofToSupabase();
  _syncHofPending();
  renderHoF();
  renderBullPenHoF();
  renderAllHoF();
  // Pre-load NVDA so new visitors see the analysis tool in action
  const input = document.getElementById('tickerInput');
  if (input && !input.value.trim()) {
    input.value = 'NVDA';
    setTimeout(runAnalysis, 700);
  }
});