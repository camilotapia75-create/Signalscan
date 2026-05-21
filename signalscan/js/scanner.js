// Core universe — always scanned
const SCAN_UNIVERSE_CORE = [
  // Mega-cap tech
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','AVGO','ORCL','CRM',
  'NFLX','ADBE','AMD','QCOM',
  // AI & infrastructure
  'PLTR','ARM','TSM','MRVL','ANET','DELL','VRT','EQIX',
  // Cybersecurity
  'CRWD','PANW','ZS','FTNT','NET','CYBR',
  // Cloud & SaaS (quality only)
  'DDOG','NOW','SNOW','WDAY','HUBS','MDB','SHOP','APP','TTD','GTLB',
  // Fintech (established)
  'COIN','PYPL','TOST','AXON',
  // Consumer tech
  'ROKU','SPOT',
  // Health & wellness
  'HIMS','CELH','ONON','PODD','DXCM','ISRG',
  // Mid-cap quality growth
  'LULU','CAVA','MELI','NU','BKNG','ABNB','UBER','DASH',
  // Aerospace & defense
  'LMT','RTX','NOC','GD','HEI','TDG','KTOS','RKLB',
  'HON','GE','CAT','ETN',
  // Financials
  'V','MA','JPM','GS','MS','BLK','SPGI','AXP','COF',
  // Healthcare
  'UNH','LLY','ABBV','TMO','AMGN','REGN','VRTX','MRK',
  // Consumer staples & retail
  'WMT','COST','HD','LOW','MCD','CMG','NKE','TJX',
  // Energy (quality)
  'XOM','CVX',
  // Always tracked
  'ZETA',
];

// Rotation pool — 25 picked daily (quality names only, no speculative garbage)
const ROTATION_POOL = [
  // Semis & hardware
  'INTU','MPWR','ASML','KLAC','LRCX','AMAT','MU','ON','TXN',
  'LSCC','ACLS','ONTO','SWKS','QRVO','STX','WDC','PSTG','HPE',
  // Cloud & SaaS
  'VEEV','ZI','TWLO','NTNX','DUOL','PAYC','PCTY','IOT','FOUR','BILL',
  // Fintech & alt finance
  'KKR','APO','BX','MSCI','MCO','SQ','HOOD',
  // Industrials (trend consistently, high institutional ownership)
  'FAST','ODFL','SAIA','AME','ROK','WAB','FTV',
  'PWR','URI','DE','EMR','ITW','PH','ROP',
  // Defense & government IT
  'LHX','LDOS','BAH','CACI',
  // Healthcare (non-biotech quality)
  'SYK','ELV','CI','DHR','GEHC','IDXX','ALGN','INSP','MEDP','MOH',
  // Energy (quality trending)
  'OXY','CTRA','LNG','MPC','VLO',
  // Consumer & retail
  'DECK','ROST','ULTA','DKNG',
  // International quality ADRs
  'ACN','SAP','CPNG','INFY','SE',
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
  return [...SCAN_UNIVERSE_CORE, ...shuffled.slice(0, 25)];
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

async function quickAnalyzeForScan(ticker, spyReturn20d = null) {
  try {
    const data = await fetchStockData(ticker, getScanTimeframe());
    if (!data || !data.closes) return { _networkFail: true };
    const closes = data.closes.filter(Boolean);
    if (closes.length < 50) return null;
    const indData = computeIndicators(data);
    if (!indData) return null;

    const { rsi, ema20, lastClose, atr } = indData;

    if (lastClose < 5) return null;

    const highs    = data.highs.filter(Boolean);
    const lows     = data.lows.filter(Boolean);
    const yearHigh = Math.max(...highs);
    const yearLow  = Math.min(...lows);
    const rangeSpan = yearHigh - yearLow;

    // Only hard filter: near yearly low with collapsing 50MA = falling knife
    const nearYearlyLow   = rangeSpan > 0 && (lastClose - yearLow) / rangeSpan < 0.20;
    const e50             = calcEMA(closes, 50);
    const ema50Collapsing = e50.length >= 9 && (e50[e50.length-1] - e50[e50.length-9]) / e50[e50.length-9] < -0.08;
    if (nearYearlyLow && ema50Collapsing) return null;

    const sr  = findSupportResistance(highs, lows, closes);
    const pa  = analyzePriceAction(data);
    const rev  = generateAnalysis(ticker, indData, sr, pa);
    const cont = generateContinuationAnalysis(ticker, indData, sr, pa);

    if (rev.bias !== 'BULLISH' || cont.bias !== 'BULLISH') {
      console.log(`[SCAN] ${ticker}: rev=${rev.bias}(${rev.score.toFixed(2)}) cont=${cont.bias}(${cont.score.toFixed(2)}) => filtered (need both BULLISH)`);
      return null;
    }

    const conviction = Math.round(Math.min(100, Math.max(60, 60 + (rev.score + cont.score - 0.85) / 0.65 * 40)));
    const topSignal  = rev.keySignals[0]?.text || cont.keySignals[0]?.text || '';
    const spark      = closes.slice(-30);
    const stopPrice  = Math.max(ema20 * 0.985, lastClose - atr * 1.5);
    const nearestRes = sr.resistance.filter(r => r.price > lastClose)[0];
    const estimatedUpside = nearestRes
      ? (nearestRes.price - lastClose) / lastClose * 100
      : Math.max(0, (yearHigh - lastClose) / lastClose * 100);

    console.log(`[SCAN] ${ticker}: rev=${rev.score.toFixed(2)} cont=${cont.score.toFixed(2)} rsi=${rsi.toFixed(1)} => ⚡ GOLDEN BULL`);
    return { ticker, price: lastClose, isGoldenBull: true, conviction, topSignal, revScore: rev.score, contScore: cont.score, spark, estimatedUpside, stopPrice };
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
  if (foundMsg) foundMsg.textContent = '';

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

function startScan(spyReturn20d = null) {
  return _runScanCore(SCAN_UNIVERSE, {
    btnId: 'scanBtn',           progressId: 'scanProgress',       gridId:    'scanResultsGrid',
    emptyId: 'scanEmpty',       headerId: 'scanResultsHeader',    foundMsgId:'scanFoundMsg',
    statusId: 'scanStatusText', countId: 'scanProgressCount',     barId:     'scanProgressBar',
    btnLabel: '🔍 SCAN AGAIN',
  }, (t) => quickAnalyzeForScan(t, spyReturn20d), null, null, 'scanner');
}

async function runScanner() {
  let spyReturn20d = null;
  try {
    const spyData   = await fetchStockData('SPY', '1d|3mo');
    const spyCloses = spyData?.closes?.filter(Boolean) || [];
    if (spyCloses.length >= 50) {
      const spyE50  = calcEMA(spyCloses, 50);
      const spyLast = spyCloses[spyCloses.length - 1];
      if (spyLast < spyE50[spyE50.length - 1] * 0.99) {
        const emptyMsg = document.getElementById('scanEmpty');
        if (emptyMsg) {
          emptyMsg.style.display = 'block';
          const msgEl = emptyMsg.querySelector('div:last-child');
          if (msgEl) msgEl.innerHTML = '⚠️ Market downtrend — SPY below 50-day EMA.<br><span style="font-size:10px;">Golden Bull signals suppressed to protect capital. Check back when market recovers.</span>';
        }
        return;
      }
    }
    if (spyCloses.length >= 21) {
      spyReturn20d = (spyCloses[spyCloses.length - 1] - spyCloses[spyCloses.length - 21]) / spyCloses[spyCloses.length - 21] * 100;
      console.log(`[SCANNER] SPY 20-day return: ${spyReturn20d.toFixed(2)}%`);
    }
  } catch (_) {}
  return startScan(spyReturn20d);
}

async function runCustomScanner() {
  const tickers = window._watchlistTickers || [];
  if (tickers.length === 0) return;
  try {
    const spyData   = await fetchStockData('SPY', '1d|3mo');
    const spyCloses = spyData?.closes?.filter(Boolean) || [];
    if (spyCloses.length >= 50) {
      const spyE50  = calcEMA(spyCloses, 50);
      if (spyCloses[spyCloses.length - 1] < spyE50[spyE50.length - 1] * 0.99) {
        const emptyMsg = document.getElementById('customScanEmpty');
        if (emptyMsg) {
          emptyMsg.style.display = 'block';
          const msgEl = emptyMsg.querySelector('div:last-child');
          if (msgEl) msgEl.innerHTML = '⚠️ Market downtrend — SPY below 50-day EMA.<br><span style="font-size:10px;">Watchlist scan suppressed to protect capital.</span>';
        }
        return;
      }
    }
  } catch (_) {}
  let spyReturn20d = null;
  try {
    const spyData2  = await fetchStockData('SPY', '1d|3mo');
    const sc        = spyData2?.closes?.filter(Boolean) || [];
    if (sc.length >= 21) spyReturn20d = (sc[sc.length - 1] - sc[sc.length - 21]) / sc[sc.length - 21] * 100;
  } catch (_) {}
  return _runScanCore(tickers, {
    btnId: 'customScanBtn',       progressId: 'customScanProgress', gridId: 'customScanGrid',
    emptyId: 'customScanEmpty',   headerId: 'customScanHeader',     foundMsgId: 'customScanFoundMsg',
    statusId: 'customScanStatus', countId: 'customScanCount',       barId: 'customScanBar',
    btnLabel: '🔍 SCAN AGAIN',
  }, (t) => quickAnalyzeForScan(t, spyReturn20d), (bulls) => hofRecord(bulls, 'watchlist'), null, 'watchlist');
}

function renderScanCard(r) {
  const fmt = v => v < 10 ? v.toFixed(4) : v.toFixed(2);
  const stopStr = r.stopPrice ? `<span style="color:#ff6b6b;font-size:0.72em;">Stop $${fmt(r.stopPrice)} · Risk ${((r.price - r.stopPrice) / r.price * 100).toFixed(1)}%</span>` : '';
  const convColor = r.conviction >= 80 ? '#00ff88' : r.conviction >= 70 ? '#f5a623' : '#aaa';
  return `<div class="scan-card" onclick="loadTickerAndAnalyze('${r.ticker}')" style="cursor:pointer;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="font-weight:700;font-size:1.1em;">${r.ticker}</span>
      <span style="font-size:0.85em;color:#aaa;">$${fmt(r.price)}</span>
    </div>
    <div class="scan-card-bar"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${r.topSignal ? '6px' : '0'};">
      <span style="color:#00ff88;font-weight:600;font-size:0.8em;">⚡ GOLDEN BULL</span>
      <span style="font-size:0.72em;font-weight:700;color:${convColor};">${r.conviction}% conviction</span>
    </div>
    ${stopStr ? `<div style="margin-bottom:4px;">${stopStr}</div>` : ''}
    ${r.topSignal ? `<div style="font-size:0.72em;color:#bbb;line-height:1.4;">${r.topSignal.substring(0, 90)}${r.topSignal.length > 90 ? '…' : ''}</div>` : ''}
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
    let records;

    if (isAdmin) {
      // Admin: use Supabase JS client (has auth session)
      const sb = getSupabase();
      const { data, error } = await sb
        .from('golden_bull_hof')
        .select('ticker,detected_at,signal_price,conviction,source')
        .order('detected_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      records = data;
    } else {
      // Public: fetch via Vercel proxy to bypass ad blockers and RLS
      const r = await fetch('/api/hof/public', { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      records = await r.json();
    }

    if (gen !== _hofRenderGen) return; // a newer renderHoF() started — abort

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
        _injectAdminHofAddForm();
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
      const uniqueCount    = new Set(records.map(r => r.ticker)).size;
      if (titleEl)    titleEl.textContent    = '🏆 GOLDEN BULL HOF — ADMIN';
      if (subtitleEl) subtitleEl.textContent = `ADMIN VIEW — ${uniqueCount} TICKERS · ${watchlistCount} WATCHLIST`;
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
        <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker}${_adminSrcBadge(s.source)}</td>
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

async function restoreHofFromScreenshots() {
  const btn = document.getElementById('restoreHofBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Restoring...'; }
  const session = await getSupabase().auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) { alert('Not logged in'); if (btn) { btn.disabled = false; btn.textContent = '📸 RESTORE FROM SCREENSHOTS'; } return; }

  const ins = async (table, ticker, price, conviction, source, detectedAt) => {
    try {
      const r = await fetch('/api/hof/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'insert', table, ticker, price, conviction, source, detectedAt }),
      });
      return r.ok;
    } catch (_) { return false; }
  };

  const gb = 'golden_bull_hof', bp = 'bull_pen_hof';
  const entries = [
    [gb,'NBIS',   97.00,    72,'watchlist','2026-04-01'],
    [gb,'DDOG',   135.50,   72,'scanner',  '2026-04-30'],
    [gb,'PANW',   183.98,   66,'scanner',  '2026-05-05'],
    [gb,'CRWD',   476.53,   62,'scanner',  '2026-05-05'],
    [gb,'ZETA',   17.85,    63,'scanner',  '2026-05-05'],
    [gb,'IONQ',   48.00,    59,'scanner',  '2026-05-05'],
    [gb,'MARA',   12.16,    66,'scanner',  '2026-05-05'],
    [gb,'ORCL',   185.35,   57,'scanner',  '2026-05-05'],
    [gb,'AFRM',   66.81,    59,'scanner',  '2026-05-05'],
    [gb,'PINS',   22.28,    68,'scanner',  '2026-05-05'],
    [gb,'BRZE',   24.33,    68,'scanner',  '2026-05-05'],
    [gb,'CEG',    320.42,   63,'scanner',  '2026-05-05'],
    [gb,'BAC',    53.12,    71,'scanner',  '2026-05-05'],
    [gb,'BTC-USD',81394.89, 68,'scanner',  '2026-05-05'],
    [gb,'QRVO',   89.23,    75,'scanner',  '2026-05-06'],
    [gb,'APO',    131.12,   60,'scanner',  '2026-05-06'],
    [gb,'MSTR',   186.82,   66,'scanner',  '2026-05-06'],
    [gb,'SOUN',   9.37,     59,'scanner',  '2026-05-06'],
    [gb,'BAC',    53.60,    71,'scanner',  '2026-05-06'],
    [gb,'BTC-USD',81153.13, 68,'scanner',  '2026-05-06'],
    [gb,'APP',    498.87,   60,'scanner',  '2026-05-07'],
    // SMCI/CEG/PANW May 7 intentionally omitted — those live in bull_pen_hof only
    [gb,'SWKS',   66.78,    58,'scanner',  '2026-05-09'],
    [gb,'U',      28.16,    63,'scanner',  '2026-05-09'],
    [gb,'V',      323.86,   84,'scanner',  '2026-05-11'],
    [gb,'MSCI',   584.63,   80,'scanner',  '2026-05-11'],
    [gb,'TSLA',   445.00,   76,'scanner',  '2026-05-11'],
    [gb,'COIN',   216.60,   97,'scanner',  '2026-05-11'],
    [gb,'DIS',    106.16,   80,'scanner',  '2026-05-12'],
    [gb,'ZM',     99.76,   100,'scanner',  '2026-05-14'],
    [gb,'LAC',    5.17,    100,'watchlist', '2026-05-14'],
    [gb,'ATLX',   4.69,     79,'watchlist', '2026-05-14'],
    [bp,'SOUN',   9.63,     52,'scanner',  '2026-05-07'],
    [bp,'CEG',    311.28,   61,'scanner',  '2026-05-07'],
    [bp,'SMCI',   33.62,    59,'scanner',  '2026-05-07'],
    [bp,'PANW',   196.53,   66,'scanner',  '2026-05-07'],
    [bp,'MARA',   12.70,    71,'scanner',  '2026-05-07'],
  ];

  let ok = 0, fail = 0;
  for (let i = 0; i < entries.length; i++) {
    const [table, ticker, price, conviction, source, detectedAt] = entries[i];
    if (btn) btn.textContent = `⏳ ${i + 1} / ${entries.length}`;
    const success = await ins(table, ticker, price, conviction, source, detectedAt);
    if (success) ok++; else fail++;
    await new Promise(res => setTimeout(res, 200));
  }

  // Clean up bull-pen-only entries that may have been inserted into golden_bull_hof
  const bpOnlyInGb = [
    { ticker: 'SMCI', date: '2026-05-07' },
    { ticker: 'CEG',  date: '2026-05-07' },
    { ticker: 'PANW', date: '2026-05-07' },
  ];
  for (const { ticker, date } of bpOnlyInGb) {
    try {
      await fetch('/api/hof/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'delete-by-date', table: 'golden_bull_hof', ticker, date }),
      });
    } catch (_) {}
    await new Promise(res => setTimeout(res, 150));
  }

  if (btn) { btn.textContent = `✅ Done (${ok} ok, ${fail} failed)`; }
  setTimeout(() => renderBullPenHoF(), 500);
}

async function wipeAllHof() {
  const confirmed = prompt(
    'This permanently deletes ALL entries from ALL HOF tables and cannot be undone.\n\nType WIPE to confirm:'
  );
  if (confirmed?.trim() !== 'WIPE') { alert('Cancelled.'); return; }

  const session = (await getSupabase().auth.getSession()).data?.session;
  if (!session?.access_token) { alert('Not authenticated.'); return; }

  const btn = document.getElementById('wipeHofBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'WIPING...'; }

  try {
    const res = await fetch('/api/hof/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'wipe-all' }),
      signal: AbortSignal.timeout(20000),
    });
    const d = await res.json();
    if (!res.ok) { alert(`Wipe failed: ${d.error}\nDetails: ${JSON.stringify(d.failed)}`); return; }

    // Clear localStorage caches too
    [HOF_KEY, HOF_PENDING_KEY, BP_HOF_KEY].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });

    const msg = d.wiped.length
      ? `Cleared: ${d.wiped.join(', ')}${d.failed?.length ? `\nSkipped (not yet created): ${d.failed.map(f=>f.table).join(', ')}` : ''}`
      : 'No tables were wiped.';
    alert(msg);
    renderHoF();
    renderBullPenHoF();
      if (typeof renderStrictHoF    === 'function') renderStrictHoF();
    if (typeof renderMinerviniHoF === 'function') renderMinerviniHoF();
  } catch (e) {
    alert(`Wipe error: ${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '☢ WIPE ALL HOF'; }
  }
}

async function restoreHofTickers(tickers, table = 'golden_bull_hof') {
  const session = (await getSupabase().auth.getSession()).data?.session;
  if (!session?.access_token) { alert('Not authenticated.'); return; }

  const results = [];
  for (const ticker of tickers) {
    try {
      const data = await fetchStockData(ticker, '1d|5d');
      const cur  = data?.closes?.filter(Boolean).slice(-1)[0];
      if (!cur) { console.warn(`[RESTORE] ${ticker}: price unavailable, skipping`); continue; }
      results.push({ ticker, price: cur, conviction: 75 });
    } catch (e) { console.warn(`[RESTORE] ${ticker}: fetch failed —`, e.message); }
  }

  if (!results.length) { alert('Could not fetch prices for any of the tickers.'); return; }

  const res = await fetch('/api/hof/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action: 'batch-insert', signals: results.map(r => ({ ...r, source: 'scanner' })) }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await res.json();
  if (!res.ok) { alert(`Restore failed: ${d.error}`); return; }
  alert(`Restored ${d.inserted} ticker(s): ${results.map(r => `${r.ticker} @ $${r.price.toFixed(2)}`).join(', ')}`);
  renderHoF();
}

async function purgeZeroReturnEntries() {
  const btn = document.getElementById('purgeZeroBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'SCANNING...'; }

  const session = (await getSupabase().auth.getSession()).data?.session;
  if (!session?.access_token) { alert('Not authenticated.'); if (btn) { btn.disabled = false; btn.textContent = '🗑 PURGE 0% ENTRIES'; } return; }

  const TABLES = ['golden_bull_hof', 'bull_pen_hof', 'bull_pen_strict_hof', 'minervini_hof'];
  const SUPABASE_URL  = window.SIGNALSCAN_CONFIG?.supabaseUrl || 'https://bhykfnuljzzimzmdjcia.supabase.co';
  const SUPABASE_ANON = window.SIGNALSCAN_CONFIG?.supabaseAnonKey;

  const toDelete = []; // { table, id, ticker, pct }
  if (btn) btn.textContent = 'FETCHING PRICES...';

  for (const table of TABLES) {
    try {
      // Fetch with id so we can delete the specific row, not all rows for that ticker
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id,ticker,signal_price,detected_at&order=detected_at.desc&limit=500`, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${session.access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) continue;
      const records = await r.json();
      if (!Array.isArray(records)) continue;

      // Batch-fetch current prices once per unique ticker
      const uniqTickers = [...new Set(records.map(x => x.ticker))];
      const prices = {};
      await Promise.all(uniqTickers.map(async t => {
        try {
          const d = await fetchStockData(t, '1d|5d');
          const cur = d?.closes?.filter(Boolean).slice(-1)[0];
          if (cur) prices[t] = cur;
        } catch (_) {}
      }));

      for (const rec of records) {
        const cur = prices[rec.ticker];
        if (!cur) continue; // price unavailable — never delete blindly
        const pct = (cur - parseFloat(rec.signal_price)) / parseFloat(rec.signal_price) * 100;
        // Only flag this specific row — identified by its database id
        if (Math.abs(pct) < 0.1) toDelete.push({ table, id: rec.id, ticker: rec.ticker, pct });
      }
    } catch (_) {}
  }

  if (!toDelete.length) {
    if (btn) { btn.disabled = false; btn.textContent = '🗑 PURGE 0% ENTRIES'; }
    alert('No 0% entries found across all HOFs.');
    return;
  }

  if (!confirm(`Delete ${toDelete.length} specific row(s) showing 0% return?\n\n${toDelete.map(x => `${x.ticker} id=${x.id} (${x.table})`).join('\n')}`)) {
    if (btn) { btn.disabled = false; btn.textContent = '🗑 PURGE 0% ENTRIES'; }
    return;
  }

  if (btn) btn.textContent = `DELETING ${toDelete.length}...`;
  let deleted = 0;
  for (const { table, id } of toDelete) {
    try {
      const res = await fetch('/api/hof/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'delete-by-id', table, id }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) deleted++;
    } catch (_) {}
  }

  if (btn) { btn.disabled = false; btn.textContent = '🗑 PURGE 0% ENTRIES'; }
  alert(`Purged ${deleted} of ${uniq.length} entries. Refreshing HOFs...`);
  renderHoF();
  renderBullPenHoF();
  if (typeof renderStrictHoF   === 'function') renderStrictHoF();
  if (typeof renderMinerviniHoF === 'function') renderMinerviniHoF();
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
      <button id="purgeZeroBtn" onclick="purgeZeroReturnEntries()" style="background:rgba(255,68,102,0.12);border:1px solid rgba(255,68,102,0.4);color:#ff4466;font-family:'Syne',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;padding:7px 14px;cursor:pointer;white-space:nowrap;">🗑 PURGE 0% ENTRIES</button>
      <button id="wipeHofBtn" onclick="wipeAllHof()" style="background:rgba(255,30,30,0.15);border:1px solid rgba(255,30,30,0.5);color:#ff2222;font-family:'Syne',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;padding:7px 14px;cursor:pointer;white-space:nowrap;">☢ WIPE ALL HOF</button>
      <button id="restoreHofBtn" onclick="restoreHofFromScreenshots()" style="background:rgba(68,255,160,0.10);border:1px solid rgba(68,255,160,0.35);color:#44ffa0;font-family:'Syne',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;padding:7px 14px;cursor:pointer;white-space:nowrap;">📸 RESTORE FROM SCREENSHOTS</button>
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

    const { rsi, ema20, ema50, lastClose, volRatio, atr } = indData;

    if (lastClose < 5) return null;

    const highs   = data.highs.filter(Boolean);
    const lows    = data.lows.filter(Boolean);
    const yearHigh  = Math.max(...highs);
    const yearLow   = Math.min(...lows);
    const rangeSpan = yearHigh - yearLow;
    const nearYearlyLow   = rangeSpan > 0 && (lastClose - yearLow) / rangeSpan < 0.20;
    const e50             = calcEMA(closes, 50);
    const ema50Collapsing = e50.length >= 9 && (e50[e50.length-1] - e50[e50.length-9]) / e50[e50.length-9] < -0.08;
    if (nearYearlyLow && ema50Collapsing) return null;

    const sr   = findSupportResistance(highs, lows, closes);
    const pa   = analyzePriceAction(data);
    // Same dual-score philosophy as Golden Bull but slightly lower bar (experimental engine)
    const rev  = generateAnalysis(ticker, indData, sr, pa);
    const cont = generateContinuationAnalysis(ticker, indData, sr, pa);

    let revScore  = rev.score;
    let contScore = cont.score;

    // Momentum bonuses — applied on top of base scores (stock already passed trend gates)
    const near52High = (yearHigh - lastClose) / yearHigh < 0.08;
    if (near52High && volRatio > 1.5) contScore = Math.min(1, contScore + 0.12);

    const atrShort = calcATR(highs, lows, closes, 5);
    if (atrShort > atr * 1.25 && lastClose > ema20) contScore = Math.min(1, contScore + 0.10);

    if (spyReturn !== null && closes.length >= 21) {
      const rsVsSpy = (lastClose - closes[closes.length - 21]) / closes[closes.length - 21] * 100 - spyReturn;
      if (rsVsSpy > 8)        contScore = Math.min(1, contScore + 0.15);
      else if (rsVsSpy > 4)   contScore = Math.min(1, contScore + 0.08);
      else if (rsVsSpy < -10) contScore = Math.max(-1, contScore - 0.20);
    }

    if (rev.bias !== 'BULLISH' || cont.bias !== 'BULLISH') {
      console.log(`[BULL PEN] ${ticker}: rev=${rev.bias}(${revScore.toFixed(2)}) cont=${cont.bias}(${contScore.toFixed(2)}) => filtered`);
      return null;
    }

    const conviction = Math.round(Math.min(100, Math.max(50, 50 + (revScore + contScore - 0.74) / 0.86 * 50)));
    const stopPrice  = Math.max(ema20 * 0.985, lastClose - atr * 1.5);

    console.log(`[BULL PEN] ${ticker}: rev=${revScore.toFixed(2)} cont=${contScore.toFixed(2)} rsi=${rsi.toFixed(1)} => 🧪 BULL`);

    const topSignal = rev.keySignals[0]?.text || cont.keySignals[0]?.text || '';
    const spark = closes.slice(-30);
    const nearestRes = sr.resistance.filter(r => r.price > lastClose)[0];
    const estimatedUpside = nearestRes
      ? (nearestRes.price - lastClose) / lastClose * 100
      : Math.max(0, (yearHigh - lastClose) / lastClose * 100);

    return { ticker, price: lastClose, isGoldenBull: true, conviction, topSignal, revScore, contScore, spark, estimatedUpside, stopPrice };
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
      // Regime gate: abort if SPY is below its 50-day EMA
      if (sc.length >= 50) {
        const spyE50 = calcEMA(sc, 50);
        if (sc[sc.length - 1] < spyE50[spyE50.length - 1] * 0.99) {
          const emptyMsg = document.getElementById('bpEmpty');
          if (emptyMsg) {
            emptyMsg.style.display = 'block';
            const msgEl = emptyMsg.querySelector('div:last-child');
            if (msgEl) msgEl.innerHTML = '⚠️ Market downtrend — SPY below 50-day EMA.<br><span style="font-size:10px;">Bull Pen signals suppressed to protect capital.</span>';
          }
          return;
        }
      }
    }
    console.log(`[BULL PEN] SPY 20-day return: ${spyReturn?.toFixed(2) ?? 'unavailable'}%`);
  } catch (_) {}

  return _runScanCore(SCAN_UNIVERSE, {
    btnId:     'bpScanBtn',      progressId: 'bpProgress',     gridId:    'bpResultsGrid',
    emptyId:   'bpEmpty',        headerId:   'bpResultsHeader', foundMsgId:'bpFoundMsg',
    statusId:  'bpStatusText',   countId:    'bpProgressCount', barId:     'bpProgressBar',
    btnLabel:  '🧪 SCAN AGAIN',
  }, (t) => quickAnalyzeForScanV2(t, spyReturn), hofRecordBullPen, renderBullPenHoF, 'bullpen');
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

    section.style.display = 'block';
    const titleEl    = document.getElementById('bpHofTitle');
    const subtitleEl = document.getElementById('bpHofSubtitle');
    const btn        = document.getElementById('bpHofReturnBtn');

    if (!records?.length) {
      if (isAdmin) {
        if (titleEl)    titleEl.textContent    = '🧪 BULL PEN HALL OF FAME — ADMIN';
        if (subtitleEl) subtitleEl.textContent = 'ADMIN VIEW — 0 SIGNALS';
        if (btn) btn.style.display = 'none';
        if (!document.getElementById('bpRestoreBtn') && subtitleEl) {
          subtitleEl.insertAdjacentHTML('afterend',
            `<button id="bpRestoreBtn" onclick="restoreHofFromScreenshots()" style="margin:8px 0 14px;background:rgba(68,255,160,0.10);border:1px solid rgba(68,255,160,0.35);color:#44ffa0;font-family:'Syne',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;padding:7px 14px;cursor:pointer;">📸 RESTORE FROM SCREENSHOTS</button>`);
        }
      } else { section.style.display = 'none'; }
      return;
    }

    if (isAdmin) {
      _bpAdminRecords = records;
      if (titleEl)    titleEl.textContent    = '🧪 BULL PEN HALL OF FAME — ADMIN';
      if (subtitleEl) subtitleEl.textContent = `ADMIN VIEW — ALL ${records.length} SIGNALS`;
      if (btn) btn.style.display = 'block';
      if (!document.getElementById('bpRestoreBtn') && subtitleEl) {
        subtitleEl.insertAdjacentHTML('afterend',
          `<button id="bpRestoreBtn" onclick="restoreHofFromScreenshots()" style="margin:8px 0 14px;background:rgba(68,255,160,0.10);border:1px solid rgba(68,255,160,0.35);color:#44ffa0;font-family:'Syne',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;padding:7px 14px;cursor:pointer;">📸 RESTORE FROM SCREENSHOTS</button>`);
      }
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
    // RSI in momentum zone 45–75 (confirmed trend; >75 = overbought, skip)
    const rsi = calcRSI(closes, 14);
    if (!rsi || rsi < 45 || rsi > 75) return null;
    // Market regime: SPY must be at or above its 50-day EMA (no slack)
    if (spyData) {
      const sc   = spyData.closes.filter(Boolean);
      const se50 = calcEMA(sc, 50);
      if (sc[sc.length - 1] < se50[se50.length - 1]) return null;
    }
    // Overextension gate: reject if price ran >15% in last 10 trading days
    if (closes.length >= 11) {
      const move10d = (lastClose - closes[closes.length - 11]) / closes[closes.length - 11];
      if (move10d > 0.15) return null;
    }
    // 12-month absolute momentum gate: must be up >15% over the year
    if (closes.length >= 200) {
      const ret12m = (lastClose - closes[closes.length - 200]) / closes[closes.length - 200];
      if (ret12m < 0.15) return null;
    }

    // ── CONVICTION SCORING ────────────────────────────────────────────────
    let score = 0;

    // 1. Base tightness (VCP proxy): ATR contracting vs longer-term ATR
    const atrRecent = calcATR(highs.slice(-15), lows.slice(-15), closes.slice(-15), 10);
    const atrBase   = calcATR(highs.slice(-40), lows.slice(-40), closes.slice(-40), 30);
    const atrRatio  = atrBase > 0 ? atrRecent / atrBase : 1;
    if (atrRatio < 0.70)      score += 0.25; // Tight base — ideal VCP entry
    else if (atrRatio < 0.90) score += 0.12; // Mild contraction
    else if (atrRatio > 1.20) score -= 0.10; // Expanding volatility — chasing a move

    // 2. Base duration: ATR contraction must have been sustained 10+ days
    // Compare 5-day ATR to 15-day ATR — both should be below the 30-day baseline
    const atr5d = calcATR(highs.slice(-6), lows.slice(-6), closes.slice(-6), 5);
    const atr15d = calcATR(highs.slice(-16), lows.slice(-16), closes.slice(-16), 14);
    const bothTight = atrBase > 0 && (atr5d / atrBase < 0.85) && (atr15d / atrBase < 0.90);
    if (bothTight) score += 0.15; // Base has been tight for 2+ weeks, not just today

    // 3. Volume pattern: volume declining in base (drying up = no distribution)
    const volBase   = volumes.slice(-21, -6).reduce((a, b) => a + b, 0) / 15; // 6–20 days ago
    const volRecent = volumes.slice(-6).reduce((a, b) => a + b, 0) / 6;        // last 5 days
    if (volBase > 0 && volRecent < volBase * 0.85) score += 0.15; // Volume drying up — healthy base
    else if (volBase > 0 && volRecent > volBase * 1.30) score += 0.10; // Volume expanding — possible breakout

    // 4. EMA20 slope (near-term trend must be rising, not flattening)
    const ema20_5dAgo = e20.length >= 6 ? e20[e20.length - 6] : null;
    if (ema20_5dAgo && ema20 > ema20_5dAgo * 1.002) score += 0.10; // EMA20 rising

    // 5. EMA20 proximity (price near EMA20 = pulled back to support, not overextended)
    const pctAboveEma20 = (lastClose - ema20) / ema20;
    if (pctAboveEma20 >= 0 && pctAboveEma20 <= 0.03)       score += 0.15;
    else if (pctAboveEma20 > 0.03 && pctAboveEma20 <= 0.08) score += 0.07;
    // >8% above EMA20 = extended, no bonus

    // 6. MACD positive and expanding
    const macd = calcMACD(closes);
    if (macd.histogram > 0 && macd.macd > 0)  score += 0.15;
    else if (macd.histogram > 0)               score += 0.06;

    // 7. Relative strength vs SPY — both 3-month and 12-month
    if (spyData) {
      const sc = spyData.closes.filter(Boolean);
      if (closes.length >= 64 && sc.length >= 64) {
        const stockRet3m = (lastClose - closes[closes.length - 64]) / closes[closes.length - 64];
        const spyRet3m   = (sc[sc.length - 1] - sc[sc.length - 64]) / sc[sc.length - 64];
        const rs3m = stockRet3m - spyRet3m;
        if (rs3m > 0.20)      score += 0.15;
        else if (rs3m > 0.08) score += 0.08;
        else if (rs3m > 0)    score += 0.03;
      }
      if (closes.length >= 200 && sc.length >= 200) {
        const stockRet12m = (lastClose - closes[closes.length - 200]) / closes[closes.length - 200];
        const spyRet12m   = (sc[sc.length - 1] - sc[sc.length - 200]) / sc[sc.length - 200];
        const rs12m = stockRet12m - spyRet12m;
        if (rs12m > 0.25)      score += 0.15; // True momentum leader
        else if (rs12m > 0.10) score += 0.08;
        else if (rs12m > 0)    score += 0.03;
      }
    }

    // Require minimum conviction threshold
    if (score < 0.40) return null;

    // ── BASE / PIVOT DETECTION ─────────────────────────────────────────────
    // Pivot = highest close from 3–35 days ago (top of consolidation base)
    const baseLookback  = Math.min(closes.length - 4, 35);
    const baseWindow    = closes.slice(-(baseLookback + 3), -3);
    const pivot         = Math.max(...baseWindow);
    const baseFloor     = Math.min(...baseWindow);
    const baseWidth     = pivot > 0 ? (pivot - baseFloor) / pivot : 1;

    // Sloppy base (>18% spread) = not a real VCP
    if (baseWidth > 0.18) return null;

    // Determine setup phase based on distance from pivot
    const distFromPivot = (lastClose - pivot) / pivot;
    let setupPhase, setupPriority;
    if (distFromPivot > 0.05)        return null; // Extended >5% past breakout — too late
    else if (distFromPivot > 0.01)   { setupPhase = 'BREAKOUT';   setupPriority = 1; }
    else if (distFromPivot >= -0.03) { setupPhase = 'AT PIVOT';   setupPriority = 2; }
    else if (distFromPivot >= -0.08) { setupPhase = 'NEAR PIVOT'; setupPriority = 3; }
    else                              return null; // Too far from pivot — not actionable yet

    // Stop: below base floor or 8% below entry, whichever gives tighter protection
    const stopPrice = Math.max(baseFloor * 0.985, lastClose * 0.92);

    // Days in base: consecutive closes within the base range
    let daysInBase = 0;
    for (let i = closes.length - 1; i >= 0 && i >= closes.length - 40; i--) {
      if (closes[i] >= baseFloor * 0.97 && closes[i] <= pivot * 1.02) daysInBase++;
      else break;
    }
    if (daysInBase < 5) return null; // No real base formed

    // Compute rs3m for card display
    let rs3m = null;
    if (spyData) {
      const sc = spyData.closes.filter(Boolean);
      if (closes.length >= 64 && sc.length >= 64) {
        rs3m = ((lastClose - closes[closes.length - 64]) / closes[closes.length - 64])
             - ((sc[sc.length - 1] - sc[sc.length - 64]) / sc[sc.length - 64]);
      }
    }

    const conviction = Math.round(Math.min(100, Math.max(50, 50 + (score - 0.40) / 0.60 * 50)));
    const spark      = closes.slice(-30);

    console.log(`[MINERVINI] ${ticker}: ${setupPhase} dist=${(distFromPivot*100).toFixed(1)}% base=${daysInBase}d score=${score.toFixed(2)} ✅`);
    return {
      ticker, price: lastClose, isGoldenBull: true, conviction, spark,
      pivot, stopPrice, setupPhase, setupPriority, daysInBase, rs3m,
      distFromPivot, score,
      estimatedUpside: Math.max(0, (pivot - lastClose) / lastClose * 100),
      topSignal: `${setupPhase} · Pivot $${pivot.toFixed(2)} · ${daysInBase}d base`,
    };
  } catch (e) {
    console.error(`[MINERVINI] ${ticker}: failed —`, e.message);
    return { _networkFail: true };
  }
}

function renderMinerviniCard(r) {
  const phaseColor = r.setupPhase === 'BREAKOUT' ? '#00ff88'
                   : r.setupPhase === 'AT PIVOT'  ? '#22d3a0'
                   :                                '#f5a623';
  const phaseIcon  = r.setupPhase === 'BREAKOUT' ? '🚀'
                   : r.setupPhase === 'AT PIVOT'  ? '🎯'
                   :                                '⏳';
  const fmt     = v => v < 10 ? v.toFixed(4) : v.toFixed(2);
  const pivDist = (r.pivot - r.price) / r.price * 100;
  const stopRisk = (r.price - r.stopPrice) / r.price * 100;
  const rsStr   = r.rs3m !== null ? `${r.rs3m >= 0 ? '+' : ''}${(r.rs3m * 100).toFixed(1)}%` : '—';
  const rsColor = r.rs3m !== null && r.rs3m > 0 ? '#00ff88' : '#ff6666';

  return `<div class="scan-card" onclick="loadTickerAndAnalyze('${r.ticker}')" style="cursor:pointer;border-color:${phaseColor}44;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-weight:700;font-size:1.1em;">${r.ticker}</span>
      <span style="font-size:0.85em;color:#aaa;">$${fmt(r.price)}</span>
    </div>
    <div style="height:2px;background:linear-gradient(90deg,${phaseColor},transparent);margin-bottom:10px;border-radius:1px;"></div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="color:${phaseColor};font-weight:700;font-size:0.78em;letter-spacing:1px;">${phaseIcon} ${r.setupPhase}</span>
      <span style="font-size:0.7em;color:#555;">· ${r.daysInBase}d base · conv ${r.conviction}%</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:0.72em;">
      <div>
        <div style="color:#555;letter-spacing:0.5px;margin-bottom:2px;">PIVOT</div>
        <div style="color:${phaseColor};font-weight:600;">$${fmt(r.pivot)}&nbsp;<span style="color:#666;font-weight:400;">${pivDist > 0 ? '+' : ''}${pivDist.toFixed(1)}%</span></div>
      </div>
      <div>
        <div style="color:#555;letter-spacing:0.5px;margin-bottom:2px;">STOP</div>
        <div style="color:#ff4466;font-weight:600;">$${fmt(r.stopPrice)}&nbsp;<span style="color:#666;font-weight:400;">−${stopRisk.toFixed(1)}%</span></div>
      </div>
      <div style="grid-column:1/-1;margin-top:2px;">
        <span style="color:#555;">RS vs SPY 3mo: </span><span style="color:${rsColor};font-weight:600;">${rsStr}</span>
      </div>
    </div>
  </div>`;
}

async function runMinerviniScanner() {
  const btn      = document.getElementById('minerviniScanBtn');
  const progress = document.getElementById('minerviniProgress');
  const grid     = document.getElementById('minerviniResultsGrid');
  const emptyMsg = document.getElementById('minerviniEmpty');
  const header   = document.getElementById('minerviniResultsHeader');
  const fill     = document.getElementById('minerviniProgressBar');
  const countEl  = document.getElementById('minerviniProgressCount');
  const statusEl = document.getElementById('minerviniStatusText');
  const foundMsg = document.getElementById('minerviniFoundMsg');
  if (!btn || !grid) return;

  btn.disabled = true; btn.textContent = '⏳ Scanning...';
  if (progress) progress.style.display = 'block';
  if (emptyMsg) emptyMsg.style.display = 'none';
  if (header)   header.style.display   = 'none';
  grid.innerHTML = '';

  let spyData = null;
  try { spyData = await fetchStockData('SPY', '1d|1y'); } catch (_) {}

  const tickers = [...new Set(MINERVINI_UNIVERSE)];
  const total = tickers.length;
  let done = 0, failed = 0;
  const results = [];
  if (countEl) countEl.textContent = `0 / ${total}`;

  for (let i = 0; i < total; i++) {
    const ticker = tickers[i];
    if (statusEl) statusEl.textContent = `Scanning ${ticker}...`;
    const r = await quickAnalyzeMinervini(ticker, spyData);
    done++;
    if (fill)    fill.style.width    = `${Math.round(done / total * 100)}%`;
    if (countEl) countEl.textContent = `${done} / ${total}`;
    if (r?._networkFail) { failed++; }
    else if (r?.isGoldenBull) {
      results.push(r);
      if (foundMsg) foundMsg.textContent = `Found ${results.length} setup${results.length !== 1 ? 's' : ''} so far...`;
    }
    if (i < total - 1) await new Promise(res => setTimeout(res, 400));
  }

  // Sort: BREAKOUT → AT PIVOT → NEAR PIVOT, ties by conviction
  results.sort((a, b) => a.setupPriority - b.setupPriority || b.conviction - a.conviction);

  // Render with actionable cards, not generic "golden bull" cards
  grid.innerHTML = results.map(renderMinerviniCard).join('');

  if (results.length > 0) {
    hofRecordMinervini(results);
    renderMinerviniHoF();
  } else if (emptyMsg) {
    emptyMsg.style.display = 'block';
  }

  if (header)   header.style.display   = '';
  if (progress) progress.style.display = 'none';
  btn.disabled = false; btn.textContent = '📈 SCAN MINERVINI';
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
  // Pre-load NVDA so new visitors see the analysis tool in action
  const input = document.getElementById('tickerInput');
  if (input && !input.value.trim()) {
    input.value = 'NVDA';
    setTimeout(runAnalysis, 700);
  }
});