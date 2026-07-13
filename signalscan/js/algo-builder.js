// ── V2 Algo Lab — builder, community, and custom scan engine ─────────────────

const V2_SIGNAL_DEFS = [
  { key: 'ema_full_stack',    label: 'Full EMA Stack (9>21>50)', points:  3, params: [] },
  { key: 'ema_partial',       label: 'EMA9 > EMA21',             points:  1, params: [] },
  { key: 'ema200_above',      label: 'Price above EMA200',        points:  2, params: [] },
  { key: 'rsi_momentum',      label: 'RSI Momentum Zone',         points:  3, params: [
      { id: 'rsiMin', label: 'min', default: 48, min: 20, max: 80, step: 1 },
      { id: 'rsiMax', label: 'max', default: 65, min: 40, max: 95, step: 1 },
    ]},
  { key: 'rsi_dip',           label: 'RSI Dip Zone',             points:  1, params: [
      { id: 'rsiMin', label: 'min', default: 38, min: 10, max: 60, step: 1 },
      { id: 'rsiMax', label: 'max', default: 48, min: 20, max: 70, step: 1 },
    ]},
  { key: 'macd_positive',     label: 'MACD Positive',            points:  2, params: [] },
  { key: 'extension_healthy', label: 'Extension Healthy (≤X%)',  points:  2, params: [
      { id: 'extMax', label: 'max%', default: 15, min: 5, max: 80, step: 1 },
    ]},
  { key: 'extension_over',    label: 'Overextended (>X%) ⚠',    points: -2, params: [
      { id: 'extMin', label: 'min%', default: 25, min: 10, max: 100, step: 1 },
    ]},
  { key: 'obv_rising',        label: 'OBV Rising',               points:  2, params: [
      { id: 'obvPeriod', label: 'bars', default: 10, min: 3, max: 30, step: 1 },
    ]},
  { key: 'volume_expanding',  label: 'Volume Expanding',         points:  1, params: [
      { id: 'volThreshold', label: '×avg', default: 1.15, min: 1.0, max: 3.0, step: 0.05 },
    ]},
  { key: 'spy_outperform',    label: 'Outperforming SPY',        points:  2, params: [
      { id: 'spyAlpha', label: '+%', default: 3, min: 0, max: 20, step: 0.5 },
    ]},
  { key: 'spy_underperform',  label: 'Underperforming SPY ⚠',   points: -1, params: [
      { id: 'spyLag', label: '-%', default: 5, min: 0, max: 20, step: 0.5 },
    ]},
  { key: 'bb_constructive',   label: 'BB Constructive',          points:  1, params: [] },
  { key: 'bb_extended',       label: 'BB Overextended ⚠',       points: -1, params: [] },
];

// ── Builder UI ────────────────────────────────────────────────────────────────

function initV2Builder() {
  const container = document.getElementById('v2SignalRows');
  if (!container) return;

  container.innerHTML = V2_SIGNAL_DEFS.map(def => {
    const isNeg = def.points < 0;
    const paramInputs = def.params.map(p =>
      `<span class="v2-param-group">
        <span class="v2-param-label">${p.label}</span>
        <input class="v2-param-input" type="number"
          data-key="${def.key}" data-param="${p.id}"
          value="${p.default}" min="${p.min}" max="${p.max}" step="${p.step}">
      </span>`
    ).join('');

    return `<div class="v2-signal-row${isNeg ? ' v2-signal-neg' : ''}">
      <label class="v2-toggle">
        <input type="checkbox" data-sig-key="${def.key}" ${def.points > 0 ? 'checked' : ''}>
        <span class="v2-toggle-track"></span>
      </label>
      <span class="v2-signal-label">${def.label}</span>
      <span class="v2-pts-group">
        <input class="v2-pts-input" type="number" data-pts-for="${def.key}"
          value="${def.points}" min="-15" max="15" step="0.5">
        <span class="v2-pts-label">pts</span>
      </span>
      ${paramInputs}
    </div>`;
  }).join('');

  loadCommunityAlgos();
}

function getBuilderConfig() {
  const signals = V2_SIGNAL_DEFS.map(def => {
    const enabledEl = document.querySelector(`input[type="checkbox"][data-sig-key="${def.key}"]`);
    const ptsEl     = document.querySelector(`input[data-pts-for="${def.key}"]`);
    const entry = {
      key:     def.key,
      enabled: enabledEl ? enabledEl.checked : def.points > 0,
      points:  parseFloat(ptsEl?.value ?? def.points),
    };
    for (const p of def.params) {
      const el = document.querySelector(`input[data-key="${def.key}"][data-param="${p.id}"]`);
      entry[p.id] = parseFloat(el?.value ?? p.default);
    }
    return entry;
  });

  return {
    version:        2,
    scoreThreshold: parseFloat(document.getElementById('v2ScoreThreshold')?.value ?? 10),
    gates: {
      minPrice:                parseFloat(document.getElementById('v2GateMinPrice')?.value ?? 2),
      maxRSI:                  parseFloat(document.getElementById('v2GateMaxRSI')?.value   ?? 76),
      requireAboveEMA50:       document.getElementById('v2GateAboveEMA50')?.checked !== false,
      requireRisingEMA50Slope: document.getElementById('v2GateEMA50Slope')?.checked !== false,
    },
    signals,
  };
}

function loadConfigIntoBuilder(config) {
  if (!config) return;
  if (config.scoreThreshold != null) {
    const el = document.getElementById('v2ScoreThreshold');
    if (el) el.value = config.scoreThreshold;
  }
  const g = config.gates || {};
  if (g.minPrice   != null) { const el = document.getElementById('v2GateMinPrice');  if (el) el.value   = g.minPrice; }
  if (g.maxRSI     != null) { const el = document.getElementById('v2GateMaxRSI');    if (el) el.value   = g.maxRSI; }
  if (g.requireAboveEMA50       != null) { const el = document.getElementById('v2GateAboveEMA50'); if (el) el.checked = g.requireAboveEMA50; }
  if (g.requireRisingEMA50Slope != null) { const el = document.getElementById('v2GateEMA50Slope'); if (el) el.checked = g.requireRisingEMA50Slope; }
  if (Array.isArray(config.signals)) {
    for (const s of config.signals) {
      const chk = document.querySelector(`input[type="checkbox"][data-sig-key="${s.key}"]`);
      const pts = document.querySelector(`input[data-pts-for="${s.key}"]`);
      if (chk) chk.checked = s.enabled !== false;
      if (pts) pts.value   = s.points;
      for (const [param, val] of Object.entries(s)) {
        if (['key','enabled','points'].includes(param)) continue;
        const el = document.querySelector(`input[data-key="${s.key}"][data-param="${param}"]`);
        if (el) el.value = val;
      }
    }
  }
}

function resetV2Builder() {
  const defaults = {
    scoreThreshold: 10,
    gates: { minPrice: 2, maxRSI: 76, requireAboveEMA50: true, requireRisingEMA50Slope: true },
    signals: V2_SIGNAL_DEFS.map(d => {
      const e = { key: d.key, enabled: d.points > 0, points: d.points };
      for (const p of d.params) e[p.id] = p.default;
      return e;
    }),
  };
  loadConfigIntoBuilder(defaults);
  const nameEl = document.getElementById('v2AlgoName');
  const descEl = document.getElementById('v2AlgoDesc');
  if (nameEl) nameEl.value = '';
  if (descEl) descEl.value = '';
}

// ── Custom scan engine ────────────────────────────────────────────────────────

async function analyzeWithConfig(ticker, config, spyCloses) {
  const data = await fetchStockData(ticker, '6mo|3mo');
  if (!data) return null;
  const { closes, volumes } = data;
  if (closes.length < 50) return null;

  const price = closes[closes.length - 1];
  const g = config.gates || {};
  if (!price || price < (g.minPrice ?? 2)) return null;

  const ema9   = calcEMA(closes, 9);
  const ema21  = calcEMA(closes, 21);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi    = calcRSI(closes);
  const macd   = calcMACD(closes);
  const bb     = calcBB(closes);
  const obv    = calcOBV(closes, volumes);

  if (!ema9 || !ema21 || !ema50 || !rsi || !bb) return null;

  if (g.requireAboveEMA50 !== false && price < ema50) return null;
  if (rsi > (g.maxRSI ?? 76)) return null;
  if (g.requireRisingEMA50Slope !== false && closes.length >= 70) {
    const prior = calcEMA(closes.slice(0, -20), 50);
    if (prior && ema50 < prior * 0.998) return null;
  }

  const sm = {};
  for (const s of (config.signals || [])) sm[s.key] = s;

  let score = 0;
  const signals = [];

  // EMA alignment
  const sf = sm['ema_full_stack'], sp = sm['ema_partial'];
  if (sf?.enabled && ema9 > ema21 && ema21 > ema50) {
    score += sf.points; signals.push('Full EMA stack aligned (9>21>50)');
  } else if (sp?.enabled && ema9 > ema21) {
    score += sp.points; signals.push('EMA9>EMA21 — short-term momentum');
  }

  // EMA200
  const s200 = sm['ema200_above'];
  if (s200?.enabled && ema200 && price > ema200) {
    score += s200.points; signals.push(`Above EMA200 ($${ema200.toFixed(2)})`);
  }

  // RSI zones
  const srm = sm['rsi_momentum'], srd = sm['rsi_dip'];
  if (srm?.enabled && rsi >= (srm.rsiMin ?? 48) && rsi <= (srm.rsiMax ?? 65)) {
    score += srm.points; signals.push(`RSI ${rsi.toFixed(0)} — momentum zone`);
  } else if (srd?.enabled && rsi >= (srd.rsiMin ?? 38) && rsi < (srd.rsiMax ?? 48)) {
    score += srd.points; signals.push(`RSI ${rsi.toFixed(0)} — dip zone`);
  }

  // MACD
  const smc = sm['macd_positive'];
  if (smc?.enabled && macd != null && macd > 0) {
    score += smc.points; signals.push('MACD positive');
  }

  // Extension from EMA50
  const extPct = (price - ema50) / ema50 * 100;
  const seh = sm['extension_healthy'], seo = sm['extension_over'];
  if (seh?.enabled && extPct <= (seh.extMax ?? 15)) {
    score += seh.points; signals.push(`${extPct.toFixed(1)}% above EMA50 — healthy`);
  } else if (seo?.enabled && extPct > (seo.extMin ?? 25)) {
    score += seo.points; signals.push(`${extPct.toFixed(1)}% above EMA50 — overextended`);
  }

  // OBV
  const sobv = sm['obv_rising'];
  const obvPer = sobv?.obvPeriod ?? 10;
  if (sobv?.enabled && obv.length >= obvPer) {
    const o = obv.slice(-obvPer);
    if (o[o.length - 1] > o[0]) { score += sobv.points; signals.push(`OBV rising ${obvPer}-day`); }
  }

  // Volume
  const svol = sm['volume_expanding'];
  if (svol?.enabled && volumes.length >= 25) {
    const rv = volumes.slice(-5).reduce((a, b) => a + (b || 0), 0) / 5;
    const av = volumes.slice(-25, -5).reduce((a, b) => a + (b || 0), 0) / 20;
    if (av > 0 && rv > av * (svol.volThreshold ?? 1.15)) {
      score += svol.points; signals.push('Volume expanding');
    }
  }

  // SPY relative strength
  const sout = sm['spy_outperform'], sund = sm['spy_underperform'];
  if ((sout?.enabled || sund?.enabled) && spyCloses?.length >= 20) {
    const sc     = spyCloses.filter(Boolean);
    const spyRet = (sc[sc.length - 1] - sc[sc.length - 20]) / sc[sc.length - 20] * 100;
    const tkrRet = closes.length >= 20
      ? (closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20] * 100
      : null;
    if (tkrRet !== null) {
      if (sout?.enabled && tkrRet > spyRet + (sout.spyAlpha ?? 3)) {
        score += sout.points; signals.push(`Outperforming SPY by ${(tkrRet - spyRet).toFixed(1)}%`);
      } else if (sund?.enabled && tkrRet < spyRet - (sund.spyLag ?? 5)) {
        score += sund.points; signals.push('Underperforming SPY');
      }
    }
  }

  // Bollinger Bands
  const sbc = sm['bb_constructive'], sbe = sm['bb_extended'];
  if (sbc?.enabled && price > bb.mean && price < bb.upper) {
    score += sbc.points; signals.push('BB constructive position');
  } else if (sbe?.enabled && price > bb.upper) {
    score += sbe.points; signals.push('BB overextended');
  }

  const maxScore = (config.signals || [])
    .filter(s => s.enabled && s.points > 0)
    .reduce((sum, s) => sum + s.points, 0) || 18;

  const threshold  = config.scoreThreshold ?? 10;
  const conviction = Math.min(100, Math.max(0, Math.round(score / maxScore * 100)));

  return { ticker, price, signals, conviction, score, qualifies: score >= threshold, topSignal: signals[0] || null };
}

let _v2ScanRunning = false;

async function runV2Scan() {
  if (_v2ScanRunning) return;
  _v2ScanRunning = true;

  const config  = getBuilderConfig();
  const btn     = document.getElementById('v2RunBtn');
  const progEl  = document.getElementById('v2ScanProgress');
  const gridEl  = document.getElementById('v2ResultsGrid');
  const emptyEl = document.getElementById('v2Empty');
  const hdrEl   = document.getElementById('v2ResultsHeader');
  const countEl = document.getElementById('v2ProgressCount');
  const barEl   = document.getElementById('v2ProgressBar');
  const statusEl = document.getElementById('v2StatusText');

  if (btn)     { btn.disabled = true; btn.textContent = '⏳ SCANNING...'; }
  if (progEl)  progEl.style.display  = 'block';
  if (gridEl)  gridEl.innerHTML      = '';
  if (emptyEl) emptyEl.style.display = 'none';
  if (hdrEl)   hdrEl.style.display   = 'none';

  const daily   = getDailyRotation(ROTATION_POOL, 20);
  const tickers = [...new Set([...SCAN_UNIVERSE_CORE, ...daily])];
  const total   = tickers.length;
  let done = 0, idx = 0;
  const hits = [];

  const spyData   = await fetchStockData('SPY', '3mo');
  const spyCloses = spyData?.closes || null;

  async function worker() {
    while (idx < tickers.length) {
      const ticker = tickers[idx++];
      try {
        const r = await analyzeWithConfig(ticker, config, spyCloses);
        if (r?.qualifies) {
          hits.push(r);
          if (gridEl) gridEl.insertAdjacentHTML('beforeend', renderV2Card(r));
        }
      } catch (_) {}
      done++;
      if (countEl)  countEl.textContent = `${done}/${total}`;
      if (barEl)    barEl.style.width   = `${Math.round(done / total * 100)}%`;
      if (statusEl) statusEl.textContent = ticker;
    }
  }

  await Promise.all(Array.from({ length: 6 }, worker));

  if (progEl) progEl.style.display = 'none';
  if (hdrEl)  { hdrEl.textContent = `${hits.length} SIGNAL${hits.length !== 1 ? 'S' : ''} FOUND`; hdrEl.style.display = 'block'; }
  if (emptyEl) emptyEl.style.display = hits.length ? 'none' : 'block';
  if (btn)    { btn.disabled = false; btn.textContent = '▶ RUN SCAN'; }

  _v2ScanRunning = false;
}

function renderV2Card(r) {
  const p = r.price < 10 ? r.price.toFixed(4) : r.price.toFixed(2);
  return `<div class="scan-card v2-scan-card" onclick="loadTickerAndAnalyze('${r.ticker}')" style="cursor:pointer;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="font-weight:700;font-size:1.1em;">${r.ticker}</span>
      <span style="font-size:0.85em;color:#aaa;">$${p}</span>
    </div>
    <div class="scan-card-bar" style="background:linear-gradient(90deg,rgba(148,100,255,0.25),rgba(148,100,255,0.03));"></div>
    <div style="font-size:0.8em;margin-bottom:${r.topSignal ? '8px' : '0'};">
      <span style="color:#9b6bff;font-weight:600;">⚗️ ALGO SIGNAL</span>
      <span style="float:right;color:var(--muted);">${r.conviction}%</span>
    </div>
    ${r.topSignal ? `<div style="font-size:0.75em;color:#bbb;line-height:1.4;">${r.topSignal.substring(0,90)}${r.topSignal.length > 90 ? '…' : ''}</div>` : ''}
  </div>`;
}

// ── Save & share ──────────────────────────────────────────────────────────────

async function saveAndShareAlgo() {
  const name = (document.getElementById('v2AlgoName')?.value || '').trim();
  const desc = (document.getElementById('v2AlgoDesc')?.value  || '').trim();
  if (name.length < 2) { alert('Give your algorithm a name (min 2 chars).'); return; }

  const sb = typeof getSupabase === 'function' ? getSupabase() : null;
  if (!sb) { alert('Login required to save algorithms.'); return; }
  const { data: { session } } = await sb.auth.getSession().catch(() => ({ data: {} }));
  if (!session) {
    alert('Please log in to save algorithms.');
    if (typeof showAuthModal === 'function') showAuthModal('login');
    return;
  }

  const saveBtn = document.querySelector('[onclick="saveAndShareAlgo()"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'SAVING...'; }

  try {
    const config = getBuilderConfig();
    config.name  = name;
    const res    = await fetch('/api/algos', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body:    JSON.stringify({ name, description: desc || null, config, is_public: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    alert(`"${name}" published! Other users can now load and run it.`);
    loadCommunityAlgos();
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 SAVE & SHARE'; }
  }
}

// ── Community algos ───────────────────────────────────────────────────────────

async function loadCommunityAlgos() {
  const el = document.getElementById('v2CommunityList');
  if (!el) return;
  el.innerHTML = '<div style="font-size:10px;color:var(--muted);padding:20px 8px;text-align:center;letter-spacing:1px;">LOADING...</div>';

  try {
    const res  = await fetch('/api/algos', { signal: AbortSignal.timeout(8000) });
    const data = res.ok ? await res.json() : [];

    if (!Array.isArray(data) || !data.length) {
      el.innerHTML = '<div style="font-size:10px;color:var(--muted);padding:20px 8px;text-align:center;line-height:1.8;">NO COMMUNITY ALGOS YET.<br>BUILD ONE AND BE THE FIRST.</div>';
      return;
    }

    el.innerHTML = data.map(a => {
      const date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const configJson = JSON.stringify(a.config).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      return `<div class="v2-algo-card" id="v2card-${a.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div class="v2-algo-name">${esc(a.name)}</div>
            <div class="v2-algo-meta">@${esc(a.author_name || 'anon')} · ${date}</div>
            ${a.description ? `<div class="v2-algo-desc">${esc(a.description)}</div>` : ''}
          </div>
          <button class="v2-upvote-btn" onclick="upvoteAlgo('${a.id}',this)" title="Upvote">
            ▲ <span>${a.upvotes || 0}</span>
          </button>
        </div>
        <button class="v2-load-btn" onclick="loadCommunityAlgo('${a.id}','${configJson}')">LOAD INTO BUILDER</button>
      </div>`;
    }).join('');
  } catch (_) {
    el.innerHTML = '<div style="font-size:10px;color:var(--muted);padding:12px 8px;">Could not load community algos.</div>';
  }
}

function loadCommunityAlgo(id, configJson) {
  try {
    const config = JSON.parse(configJson);
    loadConfigIntoBuilder(config);
    const nameEl = document.getElementById('v2AlgoName');
    if (nameEl && config.name) nameEl.value = config.name;

    // Store loaded algo ID
    let tracker = document.getElementById('_v2LoadedId');
    if (!tracker) { tracker = Object.assign(document.createElement('input'), { type:'hidden', id:'_v2LoadedId' }); document.body.appendChild(tracker); }
    tracker.value = id;

    document.getElementById('v2AlgoName')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const notice = document.getElementById('v2LoadedNotice');
    if (notice) { notice.style.display = 'block'; setTimeout(() => { notice.style.display = 'none'; }, 2500); }
  } catch (_) {}
}

async function upvoteAlgo(id, btn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  try {
    await fetch(`/api/algos?action=upvote&id=${id}`, { method: 'POST' });
    const span = btn.querySelector('span');
    if (span) span.textContent = parseInt(span.textContent || '0') + 1;
    btn.style.color = 'var(--accent)';
  } catch (_) { btn.disabled = false; }
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
