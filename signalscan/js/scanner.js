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

function getDailyRotation(pool, count) {
  const seed = Math.floor(Date.now() / 86400000);
  const arr  = pool.slice();
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

function getRandomSubset(arr, count) {
  return arr.slice(0, count);
}

const ADMIN_EMAIL = 'camilotapia75@gmail.com';

// ── Scanner core ────────────────────────────────────────────────

async function _runScanCore(tickers, ui, quickFn, recordFn, renderFn) {
  const btn       = document.getElementById(ui.btnId);
  const progressEl = document.getElementById(ui.progressId);
  const gridEl    = document.getElementById(ui.gridId);
  const emptyEl   = document.getElementById(ui.emptyId);
  const headerEl  = document.getElementById(ui.headerId);
  const foundMsgEl = document.getElementById(ui.foundMsgId);
  const statusEl  = document.getElementById(ui.statusId);
  const countEl   = document.getElementById(ui.countId);
  const barEl     = document.getElementById(ui.barId);

  if (btn) { btn.disabled = true; btn.textContent = '⏳ SCANNING...'; }
  if (progressEl) progressEl.style.display = 'block';
  if (gridEl)  gridEl.innerHTML  = '';
  if (emptyEl) emptyEl.style.display = 'none';
  if (headerEl) headerEl.style.display = 'none';

  const bulls  = [];
  const total  = tickers.length;
  let   done   = 0;

  const CONCURRENCY = 6;
  let   idx         = 0;

  async function worker() {
    while (idx < tickers.length) {
      const ticker = tickers[idx++];
      try {
        const fn = quickFn || quickAnalyzeForScan;
        const r  = await fn(ticker);
        if (r?.isGoldenBull) {
          bulls.push(r);
          if (gridEl) gridEl.insertAdjacentHTML('beforeend', renderScanCard(r));
        }
      } catch (_) {}
      done++;
      const pct = Math.round(done / total * 100);
      if (countEl) countEl.textContent = `${done}/${total}`;
      if (barEl)   barEl.style.width   = `${pct}%`;
      if (statusEl) statusEl.textContent = ticker;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (progressEl) progressEl.style.display = 'none';
  if (headerEl)  headerEl.style.display   = 'block';
  if (foundMsgEl) foundMsgEl.textContent  = `${bulls.length} GOLDEN BULL${bulls.length !== 1 ? 'S' : ''} FOUND`;
  if (emptyEl)   emptyEl.style.display    = bulls.length ? 'none' : 'block';
  if (btn) { btn.disabled = false; btn.textContent = ui.btnLabel; }

  if (bulls.length) {
    await (recordFn || hofRecord)(bulls);
    if (renderFn) renderFn();
  }
}

function switchAppTab(tab) {
  const analyzeEl = document.getElementById('appSectionAnalyze');
  const algoEl    = document.getElementById('appSectionAlgoLab');
  const btnAnalyze = document.getElementById('appTabAnalyze');
  const btnAlgo    = document.getElementById('appTabAlgoLab');

  if (analyzeEl) analyzeEl.style.display = tab === 'analyze' ? 'block' : 'none';
  if (algoEl)    algoEl.style.display    = tab === 'algolab' ? 'block' : 'none';

  if (btnAnalyze) {
    btnAnalyze.style.color       = tab === 'analyze' ? 'var(--accent)' : 'var(--muted)';
    btnAnalyze.style.borderBottom = tab === 'analyze' ? '2px solid var(--accent)' : '2px solid transparent';
  }
  if (btnAlgo) {
    btnAlgo.style.color       = tab === 'algolab' ? '#9b6bff' : 'var(--muted)';
    btnAlgo.style.borderBottom = tab === 'algolab' ? '2px solid #9b6bff' : '2px solid transparent';
    if (tab === 'algolab') btnAlgo.classList.add('algo-tab-active');
    else                   btnAlgo.classList.remove('algo-tab-active');
  }

  if (tab === 'algolab' && typeof initV2Builder === 'function') initV2Builder();
}

function switchScanTab(tab) {
  const tabs   = ['original', 'bullpen'];
  const panels = { original: 'scanPanelOriginal', bullpen: 'scanPanelBullpen' };
  const tabBtns = { original: 'scanTabOriginal', bullpen: 'scanTabBullpen' };

  tabs.forEach(t => {
    const panel = document.getElementById(panels[t]);
    const btn   = document.getElementById(tabBtns[t]);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      if (t === tab) {
        btn.style.background = t === 'bullpen' ? 'rgba(255,140,80,0.8)' : 'var(--gold)';
        btn.style.color = '#000';
      } else {
        btn.style.background = 'transparent'; btn.style.color = 'var(--muted)';
      }
    }
  });

  const scanBtn   = document.getElementById('scanBtn');
  const bpScanBtn = document.getElementById('bpScanBtn');
  if (scanBtn)   scanBtn.style.display   = tab === 'original' ? 'inline-block' : 'none';
  if (bpScanBtn) bpScanBtn.style.display = tab === 'bullpen'  ? 'inline-block' : 'none';
}

function runScanner() {
  const daily   = getDailyRotation(ROTATION_POOL, 20);
  const tickers = [...new Set([...SCAN_UNIVERSE_CORE, ...daily])];
  return _runScanCore(tickers, {
    btnId: 'scanBtn',              progressId: 'scanProgress',     gridId: 'scanResultsGrid',
    emptyId: 'scanEmpty',          headerId: 'scanResultsHeader',  foundMsgId: 'scanFoundMsg',
    statusId: 'scanStatusText',    countId: 'scanProgressCount',   barId: 'scanProgressBar',
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
  }, null, (bulls) => hofRecord(bulls, 'watchlist'), null);
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

// ── HOF persistence ───────────────────────────────────────────────

const HOF_KEY    = 'signalscan_hof';
let _hofRenderGen = 0;
let _allRenderGen = 0;
let _bpRenderGen  = 0;
let _hofReturnLoading = false;
let _allReturnLoading = false;
let _bpReturnLoading  = false;
let _hofAdminRecords    = [];
let _allHofAdminRecords = [];
let _bpAdminRecords     = [];

async function hofRecord(bulls, source = 'scanner') {
  try {
    await fetch('/api/hof/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signals: bulls.map(b => ({ ticker: b.ticker, price: b.price, conviction: b.conviction, source })) }),
    });
  } catch (_) {}

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
    let records;

    if (isAdmin) {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('golden_bull_hof')
        .select('ticker,detected_at,signal_price,conviction,source')
        .order('detected_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      records = data;
    } else {
      // Use Vercel proxy so ad blockers can't intercept the Supabase call
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

  // Fetch prices for ALL unique tickers so low-conviction high-gainers aren't excluded
  try {
    const symbols  = allUnique.map(r => r.ticker).join(',');
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

    const top30 = [...bestByTicker.values()]
      .sort((a, b) => b.pct - a.pct);

    renderRows(top30);
  } catch (e) {
    console.error('[HOF] price fetch failed:', e.message);
  }
}

function _adminSrcBadge(source) {
  if (source === 'watchlist') return '<br><span style="font-size:8px;color:#4d9fff;letter-spacing:0.5px;">WATCHLIST</span>';
  if (source === 'scanner')   return '<br><span style="font-size:8px;color:var(--accent);letter-spacing:0.5px;">SCANNER</span>';
  if (source === 'manual')    return '<br><span style="font-size:8px;color:var(--gold);letter-spacing:0.5px;">MANUAL</span>';
  return '<br><span style="font-size:8px;color:var(--muted);letter-spacing:0.5px;">LEGACY</span>';
}

function _renderHofAdminTable(records, tbodyId = 'hofTbody') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  // Deduplicate: one per ticker, keep OLDEST (first detection) — records sorted DESC
  // so always overwriting means the last write wins = oldest record per ticker
  const byTicker = new Map();
  for (const r of records) byTicker.set(r.ticker, r);
  const unique = [...byTicker.values()].sort((a, b) => b.conviction - a.conviction);
  tbody.innerHTML = unique.map(s => {
    const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
    return `<tr>
      <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker}${_adminSrcBadge(s.source)}</td>
      <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
      <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
      <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
      <td style="padding:7px 8px;color:var(--muted);">—</td>
    </tr>`;
  }).join('');
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
  const setMsg     = (txt, ok) => { if (msgEl) { msgEl.style.color = ok ? 'var(--accent)' : 'var(--accent2)'; msgEl.textContent = txt; } };

  if (!ticker || !/^[A-Z0-9.\-]{1,12}$/.test(ticker)) { setMsg('Invalid ticker.', false); return; }
  if (isNaN(price) || price <= 0) { setMsg('Invalid price.', false); return; }
  if (isNaN(conviction) || conviction < 0 || conviction > 100) { setMsg('Invalid conviction (0–100).', false); return; }

  setMsg('Inserting…', true);
  try {
    const session = (await getSupabase().auth.getSession()).data?.session;
    const token   = session?.access_token;
    if (!token) { setMsg('Not authenticated.', false); return; }

    const body = { ticker, price, conviction, source };
    if (dateStr) body.detectedAt = dateStr;

    const res  = await fetch('/api/hof/admin-insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); setMsg(`Error: ${e.error || res.status}`, false); return; }
    setMsg(`✓ ${ticker} added to HOF.`, true);
    ['aHofTicker','aHofPrice','aHofConviction','aHofDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    setTimeout(() => renderHoF(), 800);
  } catch (e) {
    setMsg(`Error: ${e.message}`, false);
  }
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
    // Deduplicate to one per ticker (same as render), then fetch returns
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
        const pctStr = `${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%`;
        return `<tr>
          <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:var(--accent);padding:7px 8px;">${s.ticker}${_adminSrcBadge(s.source)}</td>
          <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
          <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
          <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
          <td style="padding:7px 8px;font-weight:600;color:${color};">${pctStr}</td>
        </tr>`;
      }).join('');
    }
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

// ── Combined HoF (Golden Bull Scanner + Watchlist) ────────────────────

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

  // Keep oldest (first detection) per ticker
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

  _allReturnLoading = false;
  if (btn) { btn.disabled = false; btn.textContent = 'REFRESH RETURNS'; }
}

// ── Bull Pen HOF ───────────────────────────────────────────────

const BP_HOF_KEY = 'signalscan_bullpen_hof';

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
      .limit(500);

    if (gen !== _bpRenderGen) return;
    if (error) throw error;

    const titleEl    = document.getElementById('bpHofTitle');
    const subtitleEl = document.getElementById('bpHofSubtitle');
    const countEl    = document.getElementById('bpHofCount');
    const btn        = document.getElementById('bpHofReturnBtn');

    if (!records?.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';

    if (isAdmin) {
      _bpAdminRecords = records;
      const uniqueCount = new Set(records.map(r => r.ticker)).size;
      if (titleEl)    titleEl.textContent    = '🧪 BULL PEN HOF — ADMIN';
      if (subtitleEl) subtitleEl.textContent = `${records.length} SIGNALS · ${uniqueCount} TICKERS`;
      if (countEl)    countEl.textContent    = records.length;
      if (btn) btn.style.display = 'block';
      _renderBullPenAdminTable(records);
    } else {
      _bpAdminRecords = [];
      const uniqueCount = new Set(records.map(r => r.ticker)).size;
      if (countEl)    countEl.textContent    = uniqueCount;
      if (btn) btn.style.display = 'none';
      await _renderBullPenPublicTable(records, gen);
    }
  } catch (e) {
    console.error('[BP HOF] render error:', e.message);
    // localStorage fallback
    try {
      const raw = localStorage.getItem(BP_HOF_KEY);
      if (!raw) return;
      const store = JSON.parse(raw);
      if (!store.signals?.length) return;
      const section2 = document.getElementById('bpHofSection');
      if (section2) section2.style.display = 'block';
      const tbody = document.getElementById('bpHofTbody');
      if (tbody) {
        tbody.innerHTML = store.signals.slice().reverse().slice(0, 20).map(s => {
          const lbl   = new Date(s.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const price = s.price < 10 ? s.price.toFixed(4) : s.price.toFixed(2);
          return `<tr>
            <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#ff9055;padding:7px 8px;">${s.ticker}</td>
            <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
            <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
            <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
            <td style="padding:7px 8px;color:var(--muted);">—</td>
          </tr>`;
        }).join('');
      }
    } catch (_) {}
  }
}

async function _renderBullPenPublicTable(records, gen) {
  const tbody = document.getElementById('bpHofTbody');
  if (!tbody) return;

  // One per ticker — keep OLDEST (first detection price), records sorted DESC
  const byTicker = new Map();
  for (const r of records) byTicker.set(r.ticker, r);
  const allUnique = [...byTicker.values()];
  // Show top 50 by conviction initially
  const initialView = [...allUnique].sort((a, b) => b.conviction - a.conviction).slice(0, 50);

  const renderRows = (rows) => {
    if (gen !== _bpRenderGen) return;
    tbody.innerHTML = rows.map(s => {
      const lbl    = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const price  = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
      const color  = s.pct != null ? (s.pct >= 0 ? '#ff9055' : 'var(--accent2)') : 'var(--muted)';
      const pctStr = s.pct != null ? `${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%` : '—';
      return `<tr>
        <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#ff9055;padding:7px 8px;">${s.ticker}</td>
        <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
        <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
        <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
        <td style="padding:7px 8px;font-weight:600;color:${color};">${pctStr}</td>
      </tr>`;
    }).join('');
  };

  renderRows(initialView.map(r => ({ ...r, pct: null })));

  try {
    const symbols  = allUnique.map(r => r.ticker).join(',');
    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice`;
    const res      = await fetch(`/api/proxy?url=${encodeURIComponent(quoteUrl)}`);
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const json   = await res.json();
    const quotes = json.quoteResponse?.result || [];

    const prices = {};
    for (const q of quotes) {
      if (q.symbol && q.regularMarketPrice) prices[q.symbol] = q.regularMarketPrice;
    }

    const withPct = records.map(r => {
      const cur = prices[r.ticker];
      if (!cur) return null;
      return { ...r, pct: (cur - parseFloat(r.signal_price)) / parseFloat(r.signal_price) * 100 };
    }).filter(Boolean);

    const bestByTicker = new Map();
    for (const r of withPct) {
      const existing = bestByTicker.get(r.ticker);
      if (!existing || r.pct > existing.pct) bestByTicker.set(r.ticker, r);
    }

    renderRows([...bestByTicker.values()].sort((a, b) => b.pct - a.pct));
  } catch (e) {
    console.error('[BP HOF] price fetch failed:', e.message);
  }
}

function _renderBullPenAdminTable(records) {
  const tbody = document.getElementById('bpHofTbody');
  if (!tbody) return;
  // Deduplicate: one per ticker, keep OLDEST — records sorted DESC so last write = oldest
  const byTicker = new Map();
  for (const r of records) byTicker.set(r.ticker, r);
  const unique = [...byTicker.values()].sort((a, b) => b.conviction - a.conviction);
  tbody.innerHTML = unique.map(s => {
    const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
    return `<tr>
      <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#ff9055;padding:7px 8px;">${s.ticker}</td>
      <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
      <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
      <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
      <td style="padding:7px 8px;color:var(--muted);">—</td>
    </tr>`;
  }).join('');
}

async function loadBullPenReturns() {
  if (_bpReturnLoading) return;
  _bpReturnLoading = true;
  const btn = document.getElementById('bpHofReturnBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'LOADING...'; }

  // Deduplicate to one per ticker (oldest first detection), then fetch returns
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
  const tbody = document.getElementById('bpHofTbody');
  if (tbody && sorted.length) {
    tbody.innerHTML = sorted.map(s => {
      const lbl   = new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      const price = s.signal_price < 10 ? parseFloat(s.signal_price).toFixed(4) : parseFloat(s.signal_price).toFixed(2);
      const color = s.pct >= 0 ? '#ff9055' : 'var(--accent2)';
      const pctStr = `${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%`;
      return `<tr>
        <td onclick="loadTickerAndAnalyze('${s.ticker}')" style="cursor:pointer;color:#ff9055;padding:7px 8px;">${s.ticker}</td>
        <td class="hof-col-det" style="padding:7px 8px;color:var(--muted);">${lbl}</td>
        <td class="hof-col-price" style="padding:7px 8px;">$${price}</td>
        <td style="padding:7px 8px;color:var(--gold);">${s.conviction}%</td>
        <td style="padding:7px 8px;font-weight:600;color:${color};">${pctStr}</td>
      </tr>`;
    }).join('');
  }

  _bpReturnLoading = false;
  if (btn) { btn.disabled = false; btn.textContent = 'REFRESH RETURNS'; }
}

// ── Analysis ────────────────────────────────────────────────────

const ANALYSIS_CACHE = new Map();

async function fetchStockData(ticker, range = '3mo') {
  const cacheKey = `${ticker}|${range}`;
  const hit = ANALYSIS_CACHE.get(cacheKey);
  if (hit && Date.now() - hit.ts < 5 * 60 * 1000) return hit.data;

  const ranges = range.split('|');
  let data = null;
  for (const r of ranges) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${r}&includePrePost=false`;
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const closes = result.indicators?.quote?.[0]?.close || [];
      const volumes = result.indicators?.quote?.[0]?.volume || [];
      const timestamps = result.timestamp || [];
      if (closes.length >= 2) {
        data = { closes, volumes, timestamps };
        break;
      }
    } catch (_) { continue; }
  }
  if (data) ANALYSIS_CACHE.set(cacheKey, { data, ts: Date.now() });
  return data;
}

function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (ema12 == null || ema26 == null) return null;
  return ema12 - ema26;
}

function calcBB(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean  = slice.reduce((a, b) => a + b, 0) / period;
  const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return { upper: mean + 2 * std, lower: mean - 2 * std, mean };
}

function calcATR(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) trs.push(Math.abs(closes[i] - closes[i - 1]));
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcOBV(closes, volumes) {
  let obv = 0;
  const obvArr = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1])      obv += (volumes[i] || 0);
    else if (closes[i] < closes[i - 1]) obv -= (volumes[i] || 0);
    obvArr.push(obv);
  }
  return obvArr;
}

function calcVWAP(closes, volumes) {
  let cumPV = 0, cumV = 0;
  for (let i = 0; i < closes.length; i++) {
    cumPV += closes[i] * (volumes[i] || 0);
    cumV  += (volumes[i] || 0);
  }
  return cumV > 0 ? cumPV / cumV : null;
}

async function quickAnalyzeForScan(ticker) {
  const data = await fetchStockData(ticker, '6mo|3mo');
  if (!data) return null;
  const { closes, volumes } = data;
  if (closes.length < 50) return null;

  const price = closes[closes.length - 1];
  if (!price || price < 2) return null; // skip penny stocks

  const ema9   = calcEMA(closes, 9);
  const ema21  = calcEMA(closes, 21);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi    = calcRSI(closes);
  const macd   = calcMACD(closes);
  const bb     = calcBB(closes);
  const obv    = calcOBV(closes, volumes);

  if (!ema9 || !ema21 || !ema50 || !rsi || !bb) return null;

  // ── Hard gates — all must pass ──────────────────────────────
  if (price < ema50) return null;   // must be in bull territory
  if (rsi > 76) return null;        // not chasing overbought

  // EMA50 slope: must be flat or rising (rejects dead-cat bounces in downtrends)
  if (closes.length >= 70) {
    const ema50Prior = calcEMA(closes.slice(0, -20), 50);
    if (ema50Prior && ema50 < ema50Prior * 0.998) return null;
  }

  // ── Weighted scoring ─────────────────────────────────────────
  let score = 0;
  const signals = [];

  // EMA alignment — most important (3 pts for full stack, 1 pt partial)
  if (ema9 > ema21 && ema21 > ema50) {
    score += 3;
    signals.push('Full EMA stack aligned (9 > 21 > 50) — confirmed uptrend');
  } else if (ema9 > ema21) {
    score += 1;
    signals.push('EMA9 > EMA21 — short-term bullish momentum');
  }

  // Long-term structure: EMA200 (2 pts)
  if (ema200 && price > ema200) {
    score += 2;
    signals.push(`Above EMA200 ($${ema200.toFixed(2)}) — long-term bull market structure`);
  }

  // RSI sweet spot 48–65: momentum with room to run (3 pts)
  // 65–76: allowed by gate but no reward (0 pts)
  // 38–48: dip zone, partial credit (1 pt)
  if (rsi >= 48 && rsi <= 65) {
    score += 3;
    signals.push(`RSI ${rsi.toFixed(0)} — momentum zone, upside room intact`);
  } else if (rsi >= 38 && rsi < 48) {
    score += 1;
    signals.push(`RSI ${rsi.toFixed(0)} — pulling back into support zone`);
  }

  // MACD: EMA12 > EMA26 = short-term momentum positive (2 pts)
  if (macd && macd > 0) {
    score += 2;
    signals.push('MACD positive — bull momentum building');
  }

  // Extension from EMA50: healthy ≤15% (+2 pts), overextended >25% (−2 pts)
  const extPct = (price - ema50) / ema50 * 100;
  if (extPct <= 15) {
    score += 2;
    signals.push(`${extPct.toFixed(1)}% above EMA50 — healthy, room to extend`);
  } else if (extPct > 25) {
    score -= 2;
    signals.push(`${extPct.toFixed(1)}% above EMA50 — overextended, high reversal risk`);
  }

  // OBV: 10-bar sustained accumulation (2 pts — 5 bars was meaningless noise)
  if (obv.length >= 10) {
    const o = obv.slice(-10);
    if (o[o.length - 1] > o[0]) {
      score += 2;
      signals.push('OBV rising 10-day — sustained institutional accumulation');
    }
  }

  // Volume expansion: recent 5d vs prior 20d avg (1 pt)
  if (volumes.length >= 25) {
    const recentVol = volumes.slice(-5).reduce((a, b) => a + (b || 0), 0) / 5;
    const avgVol    = volumes.slice(-25, -5).reduce((a, b) => a + (b || 0), 0) / 20;
    if (avgVol > 0 && recentVol > avgVol * 1.15) {
      score += 1;
      signals.push('Volume expanding above 20-day average — participation growing');
    }
  }

  // Relative strength vs SPY over 20 days (2 pts / −1 pt)
  try {
    const spyData = await fetchStockData('SPY', '3mo'); // cached after first call
    if (spyData?.closes?.length >= 20) {
      const sc = spyData.closes.filter(Boolean);
      const spyRet = (sc[sc.length - 1] - sc[sc.length - 20]) / sc[sc.length - 20] * 100;
      const tkrRet = closes.length >= 20
        ? (closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20] * 100
        : null;
      if (tkrRet !== null && tkrRet > spyRet + 3) {
        score += 2;
        signals.push(`Outperforming SPY by ${(tkrRet - spyRet).toFixed(1)}% over 20 days`);
      } else if (tkrRet !== null && tkrRet < spyRet - 5) {
        score -= 1;
        signals.push('Underperforming SPY — relative weakness');
      }
    }
  } catch (_) {}

  // Bollinger position: between mean and upper = constructive (1 pt); above upper = short-term extended (−1 pt)
  if (price > bb.mean && price < bb.upper) {
    score += 1;
    signals.push('Between BB mean and upper band — constructive trend position');
  } else if (price > bb.upper) {
    score -= 1;
    signals.push('Above BB upper band — short-term overextended');
  }

  // Max possible score ≈ 18 (3+2+3+2+2+2+1+2+1)
  // Golden Bull requires ≥10 (≥56% of max) — multiple strong signals required
  const isGoldenBull = score >= 10;
  const conviction   = Math.min(100, Math.max(0, Math.round(score / 18 * 100)));

  return { ticker, price, signals, conviction, isGoldenBull, topSignal: signals[0] || null };
}

async function quickAnalyzeForScanV2(ticker) {
  const data = await fetchStockData(ticker, '6mo|3mo');
  if (!data) return null;
  const { closes, volumes } = data;
  if (closes.length < 50) return null;

  const price = closes[closes.length - 1];
  if (!price || price < 2) return null;

  const ema9   = calcEMA(closes, 9);
  const ema21  = calcEMA(closes, 21);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi    = calcRSI(closes);
  const macd   = calcMACD(closes);
  const bb     = calcBB(closes);
  const obv    = calcOBV(closes, volumes);

  if (!ema9 || !ema21 || !ema50 || !rsi || !bb) return null;

  // Bull Pen uses same hard gates as Golden Bull scanner
  if (price < ema50) return null;
  if (rsi > 78) return null; // slightly looser overbought gate for Bull Pen

  if (closes.length >= 70) {
    const ema50Prior = calcEMA(closes.slice(0, -20), 50);
    if (ema50Prior && ema50 < ema50Prior * 0.998) return null;
  }

  let score = 0;
  const signals = [];

  if (ema9 > ema21 && ema21 > ema50) {
    score += 3;
    signals.push('Full EMA stack aligned (9 > 21 > 50) — confirmed uptrend');
  } else if (ema9 > ema21) {
    score += 1;
    signals.push('EMA9 > EMA21 — short-term bullish momentum');
  }

  if (ema200 && price > ema200) {
    score += 2;
    signals.push(`Above EMA200 ($${ema200.toFixed(2)}) — long-term bull market structure`);
  }

  if (rsi >= 45 && rsi <= 68) {
    score += 3;
    signals.push(`RSI ${rsi.toFixed(0)} — momentum zone`);
  } else if (rsi >= 35 && rsi < 45) {
    score += 1;
    signals.push(`RSI ${rsi.toFixed(0)} — oversold bounce zone`);
  }

  if (macd && macd > 0) {
    score += 2;
    signals.push('MACD positive — bull momentum confirmed');
  }

  const extPct = (price - ema50) / ema50 * 100;
  if (extPct <= 18) {
    score += 2;
    signals.push(`${extPct.toFixed(1)}% above EMA50 — healthy extension`);
  } else if (extPct > 28) {
    score -= 2;
    signals.push(`${extPct.toFixed(1)}% above EMA50 — overextended`);
  }

  if (obv.length >= 10) {
    const o = obv.slice(-10);
    if (o[o.length - 1] > o[0]) {
      score += 2;
      signals.push('OBV rising 10-day — accumulation confirmed');
    }
  }

  if (volumes.length >= 25) {
    const recentVol = volumes.slice(-5).reduce((a, b) => a + (b || 0), 0) / 5;
    const avgVol    = volumes.slice(-25, -5).reduce((a, b) => a + (b || 0), 0) / 20;
    if (avgVol > 0 && recentVol > avgVol * 1.15) {
      score += 1;
      signals.push('Volume expanding above 20-day average');
    }
  }

  try {
    const spyData = await fetchStockData('SPY', '3mo');
    if (spyData?.closes?.length >= 20) {
      const sc = spyData.closes.filter(Boolean);
      const spyRet = (sc[sc.length - 1] - sc[sc.length - 20]) / sc[sc.length - 20] * 100;
      const tkrRet = closes.length >= 20
        ? (closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20] * 100
        : null;
      if (tkrRet !== null && tkrRet > spyRet + 3) {
        score += 2;
        signals.push(`Outperforming SPY by ${(tkrRet - spyRet).toFixed(1)}% over 20 days`);
      } else if (tkrRet !== null && tkrRet < spyRet - 5) {
        score -= 1;
      }
    }
  } catch (_) {}

  if (price > bb.mean && price < bb.upper) {
    score += 1;
    signals.push('Between BB mean and upper band — constructive position');
  } else if (price > bb.upper) {
    score -= 1;
  }

  // Bull Pen threshold is slightly lower (≥8 vs ≥10) — catches earlier-stage setups
  const isGoldenBull = score >= 8;
  const conviction   = Math.min(100, Math.max(0, Math.round(score / 18 * 100)));

  return { ticker, price, signals, conviction, isGoldenBull, topSignal: signals[0] || null };
}

// ── Ticker analysis (full chart) ────────────────────────────────────────────

let _currentTicker = null;
let _chartInstance = null;

async function loadTickerAndAnalyze(ticker) {
  _currentTicker = ticker;
  document.getElementById('tickerInput').value = ticker;
  await runAnalysis();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function runAnalysis() {
  const input  = document.getElementById('tickerInput');
  const ticker = (input?.value || '').trim().toUpperCase();
  if (!ticker) return;
  _currentTicker = ticker;

  const resultDiv  = document.getElementById('result');
  const loadingDiv = document.getElementById('loading');
  if (resultDiv)  resultDiv.style.display  = 'none';
  if (loadingDiv) loadingDiv.style.display = 'block';

  try {
    const data = await fetchStockData(ticker, '6mo|3mo|1mo');
    if (!data || data.closes.length < 20) {
      if (loadingDiv) loadingDiv.style.display = 'none';
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `<div style="color:var(--accent2);padding:20px;">Could not load data for ${ticker}. Try a different symbol.</div>`;
      }
      return;
    }

    const { closes, volumes, timestamps } = data;
    const price   = closes[closes.length - 1];
    const ema9    = calcEMA(closes, 9);
    const ema21   = calcEMA(closes, 21);
    const ema50   = calcEMA(closes, 50);
    const ema200  = calcEMA(closes, 200);
    const rsi     = calcRSI(closes);
    const macd    = calcMACD(closes);
    const bb      = calcBB(closes);
    const atr     = calcATR(closes);
    const obv     = calcOBV(closes, volumes);
    const vwap    = calcVWAP(closes, volumes);

    const signals = [];
    if (ema9 && ema21 && ema9 > ema21)                       signals.push({ text: 'EMA 9 crossed above EMA 21 — short-term bullish momentum', strength: 'strong' });
    if (ema50 && price > ema50)                               signals.push({ text: 'Price trading above EMA 50 — medium-term uptrend intact', strength: 'strong' });
    if (ema9 && ema21 && ema50 && ema9 > ema21 && ema21 > ema50) signals.push({ text: 'Full EMA stack aligned bullish (9 > 21 > 50)', strength: 'strong' });
    if (ema200 && price > ema200)                             signals.push({ text: 'Price above EMA 200 — long-term bull market structure', strength: 'moderate' });
    if (rsi && rsi > 55 && rsi < 75)                         signals.push({ text: `RSI at ${rsi.toFixed(1)} — in momentum zone, not yet overbought`, strength: 'strong' });
    if (rsi && rsi > 50 && macd && macd > 0)                 signals.push({ text: 'RSI > 50 with positive MACD — dual momentum confirmation', strength: 'strong' });
    if (rsi && rsi < 35)                                     signals.push({ text: `RSI at ${rsi.toFixed(1)} — oversold, potential reversal zone`, strength: 'moderate' });
    if (bb && price < bb.mean * 1.01 && price > bb.lower)    signals.push({ text: 'Price near Bollinger Band mean — mean reversion opportunity', strength: 'moderate' });
    if (bb && price > bb.upper)                              signals.push({ text: 'Price above upper Bollinger Band — strong breakout momentum', strength: 'moderate' });
    if (vwap && price > vwap)                                signals.push({ text: 'Price above VWAP — institutional buying bias', strength: 'moderate' });
    if (obv.length >= 10) {
      const obvTrend = obv[obv.length - 1] - obv[obv.length - 10];
      if (obvTrend > 0)                                      signals.push({ text: 'On-Balance Volume rising — accumulation detected', strength: 'moderate' });
    }
    if (atr && price > 0) {
      const atrPct = atr / price * 100;
      if (atrPct < 2)                                        signals.push({ text: `ATR ${atrPct.toFixed(1)}% of price — low volatility, coiling for a move`, strength: 'weak' });
      if (atrPct > 5)                                        signals.push({ text: `ATR ${atrPct.toFixed(1)}% of price — high volatility, wide swings expected`, strength: 'weak' });
    }

    const strongCount = signals.filter(s => s.strength === 'strong').length;
    const totalCount  = signals.length;
    const conviction  = Math.min(100, Math.round((strongCount * 2 + totalCount) / 15 * 100));

    const isGoldenBull = strongCount >= 3 && conviction >= 50;
    const isBullish    = conviction >= 30;

    if (loadingDiv) loadingDiv.style.display = 'none';
    if (resultDiv)  resultDiv.style.display  = 'block';

    const priceStr = price < 10 ? price.toFixed(4) : price.toFixed(2);
    const signalColor = isGoldenBull ? 'var(--accent)' : (isBullish ? 'var(--gold)' : 'var(--accent2)');
    const signalLabel = isGoldenBull ? '⚡ GOLDEN BULL' : (isBullish ? '📈 BULLISH' : '⚠ NEUTRAL / BEARISH');

    resultDiv.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
        <div>
          <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:22px;letter-spacing:2px;">${ticker}</div>
          <div style="font-size:13px;color:var(--muted);margin-top:2px;">$${priceStr}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;font-size:14px;color:${signalColor};letter-spacing:1px;">${signalLabel}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px;">CONVICTION: <span style="color:var(--gold);font-weight:700;">${conviction}%</span></div>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <canvas id="priceChart" height="220"></canvas>
      </div>
      ${signals.length ? `
      <div style="font-size:10px;letter-spacing:1.5px;color:var(--muted);margin-bottom:10px;">SIGNALS DETECTED (${signals.length})</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${signals.map(s => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border-left:2px solid ${
            s.strength === 'strong' ? 'var(--accent)' : s.strength === 'moderate' ? 'var(--gold)' : 'var(--muted)'
          };">
            <span style="font-size:10px;color:${
              s.strength === 'strong' ? 'var(--accent)' : s.strength === 'moderate' ? 'var(--gold)' : 'var(--muted)'
            };flex-shrink:0;margin-top:1px;">${s.strength === 'strong' ? '●' : s.strength === 'moderate' ? '◐' : '○'}</span>
            <span style="font-size:11px;line-height:1.5;">${s.text}</span>
          </div>`).join('')}
      </div>` : '<div style="color:var(--muted);font-size:11px;">No strong signals detected.</div>'}
    `;

    // Draw chart
    const ctx = document.getElementById('priceChart')?.getContext('2d');
    if (ctx && closes.length > 1) {
      if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null; }
      const labels = timestamps.map(t => {
        const d = new Date(t * 1000);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
      const ema9Arr  = closes.map((_, i) => i >= 8  ? calcEMA(closes.slice(0, i + 1), 9)  : null);
      const ema21Arr = closes.map((_, i) => i >= 20 ? calcEMA(closes.slice(0, i + 1), 21) : null);
      _chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Price',  data: closes,   borderColor: '#00ff88', borderWidth: 2,   pointRadius: 0, tension: 0.3, fill: false },
            { label: 'EMA 9', data: ema9Arr,  borderColor: '#f5a623', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false, borderDash: [4,2] },
            { label: 'EMA 21',data: ema21Arr, borderColor: '#4d9fff', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false, borderDash: [4,2] },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: true, labels: { color: '#aaa', font: { size: 10 }, boxWidth: 20 } },
            zoom: {
              pan:  { enabled: true,  mode: 'x' },
              zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
            },
          },
          scales: {
            x: { ticks: { color: '#666', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: '#666', font: { size: 9 } },                   grid: { color: 'rgba(255,255,255,0.04)' } },
          },
        },
      });
    }
  } catch (err) {
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `<div style="color:var(--accent2);padding:20px;">Error analyzing ${ticker}: ${err.message}</div>`;
    }
  }
}

// ── Bull Pen scanner (V2) ───────────────────────────────────────────────

let _bpScanRunning = false;
let _spyReturn     = null;

async function getSpyReturn() {
  if (_spyReturn !== null) return _spyReturn;
  try {
    const data = await fetchStockData('SPY', '3mo');
    if (data?.closes?.length >= 2) {
      const c = data.closes.filter(Boolean);
      _spyReturn = (c[c.length - 1] - c[0]) / c[0] * 100;
    }
  } catch (_) {}
  return _spyReturn;
}

function runBullPenScanner() {
  const daily   = getDailyRotation(ROTATION_POOL, 20);
  const tickers = [...new Set([...SCAN_UNIVERSE_CORE, ...daily])];
  return _runScanCore(tickers, {
    btnId: 'bpScanBtn',              progressId: 'bpProgress',          gridId: 'bpResultsGrid',
    emptyId: 'bpEmpty',              headerId: 'bpResultsHeader',        foundMsgId: 'bpFoundMsg',
    statusId: 'bpStatusText',        countId: 'bpProgressCount',         barId: 'bpProgressBar',
    btnLabel: '🔍 SCAN AGAIN',
  }, quickAnalyzeForScanV2, hofRecordBullPen, renderBullPenHoF);
}

async function hofRecordBullPen(bulls) {
  try {
    await fetch('/api/hof/record-bp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signals: bulls.map(b => ({ ticker: b.ticker, price: b.price, conviction: b.conviction })) }),
    });
  } catch (_) {}

  // localStorage fallback
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

// ── Watchlist HOF ticker ───────────────────────────────────────────────

function updateBullPenTicker() {
  const tickerEl = document.getElementById('bpHofTicker');
  if (!tickerEl) return;
  try {
    const raw = localStorage.getItem(BP_HOF_KEY);
    if (!raw) return;
    const store = JSON.parse(raw);
    if (!store.signals?.length) return;
    const items = store.signals.slice().reverse().map(s =>
      `<span style="margin-right:24px;">${s.ticker} <span style="color:var(--gold);">$${s.price < 10 ? s.price.toFixed(4) : s.price.toFixed(2)}</span></span>`
    ).join('');
    tickerEl.innerHTML = items + items;
  } catch (_) {}
}

function updateGoldenBullTicker() {
  const tickerEl = document.getElementById('hofTicker');
  if (!tickerEl) return;
  try {
    const raw = localStorage.getItem(HOF_KEY);
    if (!raw) return;
    const store = JSON.parse(raw);
    if (!store.signals?.length) return;
    const items = store.signals.slice().reverse().map(s =>
      `<span style="margin-right:24px;">${s.ticker} <span style="color:var(--gold);">$${s.price < 10 ? s.price.toFixed(4) : s.price.toFixed(2)}</span></span>`
    ).join('');
    tickerEl.innerHTML = items + items;
  } catch (_) {}
}

// ── How it works ──────────────────────────────────────────────────

function toggleHowItWorks() {
  const el = document.getElementById('howItWorks');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ── Theme toggle ─────────────────────────────────────────────────

function toggleTheme() {
  const isDark = document.body.classList.toggle('light-mode');
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  try { localStorage.setItem('signalscan_theme', isDark ? 'light' : 'dark'); } catch (_) {}
}

(function() {
  try {
    if (localStorage.getItem('signalscan_theme') === 'light') {
      document.body.classList.add('light-mode');
      const btn = document.getElementById('themeToggleBtn');
      if (btn) btn.textContent = '☀️';
    }
  } catch (_) {}
})();

document.addEventListener('DOMContentLoaded', () => {
  // Pre-load NVDA so new visitors see the analysis tool in action
  const input = document.getElementById('tickerInput');
  if (input && !input.value.trim()) {
    input.value = 'NVDA';
    setTimeout(runAnalysis, 700);
  }
});
