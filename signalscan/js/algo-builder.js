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

// ── Signal mini-chart SVGs ────────────────────────────────────────────────────

const V2_CHARTS = {
  ema_full_stack: `<svg viewBox="0 0 220 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="0,46 28,40 56,32 84,26 112,18 140,13 168,9 196,5 220,3" stroke="#00ff88" stroke-width="2" opacity="0.95"/>
    <polyline points="0,50 28,45 56,38 84,31 112,23 140,17 168,13 196,9 220,7" stroke="#4d9fff" stroke-width="1.5" opacity="0.75"/>
    <polyline points="0,53 28,49 56,45 84,40 112,34 140,28 168,23 196,18 220,15" stroke="#ff9055" stroke-width="1.3" opacity="0.65"/>
    <polyline points="0,56 28,54 56,51 84,48 112,44 140,40 168,36 196,32 220,29" stroke="#ffcc44" stroke-width="1" opacity="0.5" stroke-dasharray="4,3"/>
    <text x="4" y="11" font-size="7" fill="rgba(0,255,136,0.5)" font-family="monospace">9</text>
    <text x="4" y="23" font-size="7" fill="rgba(77,159,255,0.5)" font-family="monospace">21</text>
    <text x="4" y="35" font-size="7" fill="rgba(255,144,85,0.5)" font-family="monospace">50</text></svg>`,
  ema_partial: `<svg viewBox="0 0 220 56" fill="none">
    <polyline points="0,50 56,38 112,22 168,14 220,8" stroke="#00ff88" stroke-width="2" opacity="0.9"/>
    <polyline points="0,53 56,44 112,32 168,23 220,16" stroke="#4d9fff" stroke-width="1.5" opacity="0.7"/>
    <polyline points="0,55 56,52 112,47 168,43 220,39" stroke="#ffcc44" stroke-width="1" stroke-dasharray="4,3" opacity="0.45"/>
    <text x="4" y="16" font-size="7" fill="rgba(0,255,136,0.5)" font-family="monospace">EMA9</text>
    <text x="4" y="28" font-size="7" fill="rgba(77,159,255,0.5)" font-family="monospace">EMA21</text></svg>`,
  ema200_above: `<svg viewBox="0 0 220 56" fill="none">
    <polyline points="0,50 55,47 110,43 165,40 220,37" stroke="#ffcc44" stroke-width="1.2" stroke-dasharray="5,3" opacity="0.55"/>
    <polyline points="0,40 55,30 110,20 165,22 220,15" stroke="#00ff88" stroke-width="2" opacity="0.9"/>
    <text x="130" y="52" font-size="7" fill="rgba(255,204,68,0.6)" font-family="monospace">EMA200</text></svg>`,
  rsi_momentum: `<svg viewBox="0 0 220 56" fill="none">
    <rect x="0" y="18" width="220" height="18" fill="rgba(0,255,136,0.1)" rx="1"/>
    <line x1="0" y1="18" x2="220" y2="18" stroke="rgba(0,255,136,0.35)" stroke-width="0.8" stroke-dasharray="4,3"/>
    <line x1="0" y1="36" x2="220" y2="36" stroke="rgba(0,255,136,0.35)" stroke-width="0.8" stroke-dasharray="4,3"/>
    <text x="3" y="16" font-size="7" fill="rgba(0,255,136,0.55)" font-family="monospace">65</text>
    <text x="3" y="44" font-size="7" fill="rgba(0,255,136,0.55)" font-family="monospace">48</text>
    <polyline points="0,44 28,32 56,26 84,30 112,24 140,28 168,25 196,29 220,26" stroke="#00ff88" stroke-width="2" opacity="0.9"/></svg>`,
  rsi_dip: `<svg viewBox="0 0 220 56" fill="none">
    <rect x="0" y="28" width="220" height="14" fill="rgba(77,159,255,0.1)" rx="1"/>
    <line x1="0" y1="28" x2="220" y2="28" stroke="rgba(77,159,255,0.35)" stroke-width="0.8" stroke-dasharray="4,3"/>
    <line x1="0" y1="42" x2="220" y2="42" stroke="rgba(77,159,255,0.35)" stroke-width="0.8" stroke-dasharray="4,3"/>
    <text x="3" y="26" font-size="7" fill="rgba(77,159,255,0.55)" font-family="monospace">48</text>
    <text x="3" y="51" font-size="7" fill="rgba(77,159,255,0.55)" font-family="monospace">38</text>
    <polyline points="0,14 40,22 80,36 100,38 120,35 150,32 180,38 220,34" stroke="#4d9fff" stroke-width="2" opacity="0.9"/></svg>`,
  macd_positive: `<svg viewBox="0 0 220 56" fill="none">
    <line x1="0" y1="38" x2="220" y2="38" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>
    <rect x="6"   y="28" width="13" height="10" fill="rgba(0,255,136,0.45)" rx="1"/>
    <rect x="26"  y="22" width="13" height="16" fill="rgba(0,255,136,0.55)" rx="1"/>
    <rect x="46"  y="16" width="13" height="22" fill="rgba(0,255,136,0.65)" rx="1"/>
    <rect x="66"  y="19" width="13" height="19" fill="rgba(0,255,136,0.60)" rx="1"/>
    <rect x="86"  y="13" width="13" height="25" fill="rgba(0,255,136,0.70)" rx="1"/>
    <rect x="106" y="17" width="13" height="21" fill="rgba(0,255,136,0.62)" rx="1"/>
    <rect x="126" y="10" width="13" height="28" fill="rgba(0,255,136,0.75)" rx="1"/>
    <rect x="146" y="7"  width="13" height="31" fill="rgba(0,255,136,0.80)" rx="1"/>
    <rect x="166" y="4"  width="13" height="34" fill="rgba(0,255,136,0.85)" rx="1"/>
    <rect x="186" y="2"  width="13" height="36" fill="rgba(0,255,136,0.90)" rx="1"/>
    <polyline points="12,32 32,25 52,18 72,22 92,15 112,20 132,12 152,9 172,6 192,4" stroke="#ffcc44" stroke-width="1.3" opacity="0.7"/></svg>`,
  extension_healthy: `<svg viewBox="0 0 220 56" fill="none">
    <rect x="0" y="8" width="220" height="30" fill="rgba(0,255,136,0.07)" rx="1"/>
    <line x1="0" y1="8" x2="220" y2="8" stroke="rgba(0,255,136,0.3)" stroke-width="0.8" stroke-dasharray="4,3"/>
    <polyline points="0,52 55,46 110,38 165,28 220,20" stroke="#ffcc44" stroke-width="1.2" stroke-dasharray="4,3" opacity="0.5"/>
    <polyline points="0,48 55,40 110,30 165,22 220,16" stroke="#00ff88" stroke-width="2" opacity="0.9"/>
    <text x="3" y="16" font-size="7" fill="rgba(0,255,136,0.5)" font-family="monospace">≤15% ext</text></svg>`,
  extension_over: `<svg viewBox="0 0 220 56" fill="none">
    <rect x="0" y="2" width="220" height="14" fill="rgba(255,61,107,0.08)" rx="1"/>
    <line x1="0" y1="16" x2="220" y2="16" stroke="rgba(255,61,107,0.35)" stroke-width="0.8" stroke-dasharray="4,3"/>
    <polyline points="0,52 55,46 110,38 165,28 220,20" stroke="#ffcc44" stroke-width="1.2" stroke-dasharray="4,3" opacity="0.5"/>
    <polyline points="0,46 55,35 110,20 165,9 220,4" stroke="#ff3d6b" stroke-width="2" opacity="0.9"/>
    <text x="3" y="14" font-size="7" fill="rgba(255,61,107,0.6)" font-family="monospace">>25%</text></svg>`,
  obv_rising: `<svg viewBox="0 0 220 56" fill="none">
    <rect x="4"   y="42" width="14" height="13" fill="rgba(77,159,255,0.22)" rx="1"/>
    <rect x="24"  y="38" width="14" height="17" fill="rgba(77,159,255,0.27)" rx="1"/>
    <rect x="44"  y="40" width="14" height="15" fill="rgba(77,159,255,0.22)" rx="1"/>
    <rect x="64"  y="35" width="14" height="20" fill="rgba(77,159,255,0.32)" rx="1"/>
    <rect x="84"  y="28" width="14" height="27" fill="rgba(77,159,255,0.38)" rx="1"/>
    <rect x="104" y="22" width="14" height="33" fill="rgba(77,159,255,0.44)" rx="1"/>
    <rect x="124" y="18" width="14" height="37" fill="rgba(77,159,255,0.50)" rx="1"/>
    <rect x="144" y="12" width="14" height="43" fill="rgba(77,159,255,0.56)" rx="1"/>
    <polyline points="0,54 30,47 60,42 90,35 120,27 150,20 180,12 220,6" stroke="#4d9fff" stroke-width="2" opacity="0.9"/></svg>`,
  volume_expanding: `<svg viewBox="0 0 220 56" fill="none">
    <rect x="4"   y="40" width="16" height="15" fill="rgba(155,107,255,0.30)" rx="1"/>
    <rect x="26"  y="36" width="16" height="19" fill="rgba(155,107,255,0.30)" rx="1"/>
    <rect x="48"  y="38" width="16" height="17" fill="rgba(155,107,255,0.30)" rx="1"/>
    <rect x="70"  y="35" width="16" height="20" fill="rgba(155,107,255,0.30)" rx="1"/>
    <rect x="92"  y="37" width="16" height="18" fill="rgba(155,107,255,0.30)" rx="1"/>
    <rect x="114" y="39" width="16" height="16" fill="rgba(155,107,255,0.30)" rx="1"/>
    <rect x="136" y="40" width="16" height="15" fill="rgba(155,107,255,0.30)" rx="1"/>
    <rect x="160" y="5"  width="20" height="50" fill="rgba(155,107,255,0.85)" rx="1"/>
    <text x="160" y="13" font-size="8" fill="#9b6bff" font-family="monospace" font-weight="700">↑×</text></svg>`,
  spy_outperform: `<svg viewBox="0 0 220 56" fill="none">
    <polyline points="0,44 55,40 110,36 165,34 220,32" stroke="#4d9fff" stroke-width="1.5" opacity="0.6"/>
    <polyline points="0,44 55,34 110,22 165,14 220,7" stroke="#00ff88" stroke-width="2" opacity="0.9"/>
    <text x="148" y="25" font-size="7" fill="rgba(0,255,136,0.7)" font-family="monospace">STOCK</text>
    <text x="148" y="44" font-size="7" fill="rgba(77,159,255,0.7)" font-family="monospace">SPY</text></svg>`,
  spy_underperform: `<svg viewBox="0 0 220 56" fill="none">
    <polyline points="0,44 55,40 110,36 165,34 220,32" stroke="#4d9fff" stroke-width="1.5" opacity="0.6"/>
    <polyline points="0,44 55,47 110,50 165,49 220,54" stroke="#ff3d6b" stroke-width="2" opacity="0.9"/>
    <text x="148" y="38" font-size="7" fill="rgba(77,159,255,0.7)" font-family="monospace">SPY</text>
    <text x="148" y="53" font-size="7" fill="rgba(255,61,107,0.7)" font-family="monospace">STOCK</text></svg>`,
  bb_constructive: `<svg viewBox="0 0 220 56" fill="none">
    <polyline points="0,10 55,9 110,11 165,8 220,10" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="3,3"/>
    <polyline points="0,46 55,48 110,46 165,49 220,47" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="3,3"/>
    <line x1="0" y1="28" x2="220" y2="28" stroke="rgba(255,255,255,0.1)" stroke-width="0.7"/>
    <polyline points="0,34 44,26 88,19 110,22 140,16 175,20 220,17" stroke="#00ff88" stroke-width="2" opacity="0.9"/>
    <text x="3" y="9" font-size="7" fill="rgba(255,255,255,0.3)" font-family="monospace">upper</text></svg>`,
  bb_extended: `<svg viewBox="0 0 220 56" fill="none">
    <polyline points="0,12 55,10 110,12 165,9 220,8" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="3,3"/>
    <polyline points="0,46 55,48 110,46 165,49 220,47" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="3,3"/>
    <line x1="0" y1="29" x2="220" y2="29" stroke="rgba(255,255,255,0.1)" stroke-width="0.7"/>
    <polyline points="0,36 44,24 88,13 110,7 140,4 175,3 220,2" stroke="#ff3d6b" stroke-width="2" opacity="0.9"/>
    <text x="3" y="9" font-size="7" fill="rgba(255,61,107,0.5)" font-family="monospace">↑ above</text></svg>`,
};

// ── Slider helpers ────────────────────────────────────────────────────────────

function _v2Fill(input) {
  const min = parseFloat(input.min), max = parseFloat(input.max), val = parseFloat(input.value);
  const pct = Math.round(((val - min) / (max - min)) * 100);
  const isPts = input.classList.contains('v2-range-pts');
  const c = isPts ? 'rgba(255,204,68,0.85)' : '#9b6bff';
  input.style.background = `linear-gradient(to right,${c} ${pct}%,rgba(255,255,255,0.07) ${pct}%)`;
}

function _v2Disp(key, param, value, isFloat) {
  const el = document.getElementById(`v2-val-${key}-${param}`);
  if (el) { const v = parseFloat(value); el.textContent = isFloat ? v.toFixed(2) : Math.round(v); }
}

function _v2Pts(key, value) {
  const v = parseFloat(value);
  const str = (v > 0 ? '+' : '') + (v % 1 === 0 ? v : v.toFixed(1)) + ' pts';
  const valEl = document.getElementById(`v2-pts-val-${key}`);
  const badge = document.getElementById(`v2-pts-badge-${key}`);
  if (valEl) valEl.textContent = str;
  if (badge) badge.textContent = str;
}

// ── Live strategy preview ─────────────────────────────────────────────────────
// A real chart: candlesticks + indicator series computed with the same math the
// scanner uses. Each signal owns a layer (id v2-prev-<key>) that fades in/out
// with its toggle. Starts on deterministic sample data; testing a ticker swaps
// in real market data and scores it against the current builder config.

let _v2PrevData   = null;   // {closes, opens, highs, lows, volumes, label}
let _v2PrevSpy    = null;   // SPY closes for the relative-strength layer
let _v2TestedTicker = null; // last live-tested ticker

function _v2SampleData() {
  let s = 42;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const closes = [], opens = [], highs = [], lows = [], volumes = [];
  let p = 84;
  for (let i = 0; i < 260; i++) {
    const chg = 0.0016 + Math.sin(i / 17) * 0.004 + Math.sin(i / 41) * 0.003 + (rnd() - 0.5) * 0.02;
    const o = p; p = Math.max(3, p * (1 + chg));
    opens.push(o); closes.push(p);
    highs.push(Math.max(o, p) * (1 + rnd() * 0.008));
    lows.push(Math.min(o, p) * (1 - rnd() * 0.008));
    volumes.push(Math.round(800000 + rnd() * 900000 + (chg > 0.013 ? 700000 : 0)));
  }
  // gentle market line for the SPY layer
  const spy = closes.map((_, i) => 100 * (1 + 0.0009 * i) + Math.sin(i / 9));
  return { closes, opens, highs, lows, volumes, spy, label: 'SAMPLE' };
}

// Rolling indicator series (calc.js's calcEMA supplies EMA arrays)
function _v2RsiSeries(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

function _v2BbSeries(closes, period = 20) {
  const upper = [], lower = [], mid = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(null); lower.push(null); mid.push(null); continue; }
    const sl = closes.slice(i - period + 1, i + 1);
    const m  = sl.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    upper.push(m + 2 * sd); lower.push(m - 2 * sd); mid.push(m);
  }
  return { upper, lower, mid };
}

function _v2MacdSeries(closes) {
  const e12 = calcEMA(closes, 12), e26 = calcEMA(closes, 26);
  const line = e12.map((v, i) => v - e26[i]);
  const sig  = calcEMA(line, 9);
  return { line, sig, hist: line.map((v, i) => v - sig[i]) };
}

function _v2ObvSeries(closes, volumes) {
  const out = [0];
  for (let i = 1; i < closes.length; i++) {
    let v = out[i - 1];
    if (closes[i] > closes[i - 1]) v += (volumes[i] || 0);
    else if (closes[i] < closes[i - 1]) v -= (volumes[i] || 0);
    out.push(v);
  }
  return out;
}

function _v2ParamVal(key, param, def) {
  const el = document.querySelector(`input[data-key="${key}"][data-param="${param}"]`);
  const v = parseFloat(el?.value);
  return isNaN(v) ? def : v;
}

function _v2Poly(xs, ys) {
  const pts = [];
  for (let i = 0; i < xs.length; i++) if (ys[i] != null && isFinite(ys[i])) pts.push(`${xs[i].toFixed(1)},${ys[i].toFixed(1)}`);
  return pts.join(' ');
}

function _v2RenderPreview() {
  const host = document.getElementById('v2PrevChart');
  if (!host) return;
  const d = _v2PrevData || (_v2PrevData = _v2SampleData());

  const N = Math.min(130, d.closes.length);          // visible window
  const off = d.closes.length - N;                    // full history still feeds the math
  const W = 760, PH = 210, VH = 34, RH = 62, MH = 62, PAD = 44; // price/vol/rsi/macd pane heights, right axis pad
  const bw = (W - PAD) / N;                           // bar slot width
  const cx = i => (i + 0.5) * bw;                     // center x for window index i

  const win = arr => arr.slice(off);
  const closes = win(d.closes), opens = win(d.opens || d.closes), highs = win(d.highs), lows = win(d.lows), vols = win(d.volumes);

  // indicator series on FULL history, then windowed
  const e9   = win(calcEMA(d.closes, 9)),  e21 = win(calcEMA(d.closes, 21));
  const e50  = win(calcEMA(d.closes, 50)), e200 = d.closes.length >= 200 ? win(calcEMA(d.closes, 200)) : null;
  const bb   = _v2BbSeries(d.closes);
  const bbU  = win(bb.upper), bbL = win(bb.lower);
  const rsiS = win(_v2RsiSeries(d.closes));
  const mac  = _v2MacdSeries(d.closes);
  const macH = win(mac.hist), macL = win(mac.line), macSg = win(mac.sig);
  const obvS = win(_v2ObvSeries(d.closes, d.volumes));
  const spyS = d.spy ? win(d.spy) : null;

  // price scale (include bands & EMAs so nothing clips)
  let pMin = Infinity, pMax = -Infinity;
  const consider = v => { if (v != null && isFinite(v)) { if (v < pMin) pMin = v; if (v > pMax) pMax = v; } };
  lows.forEach(consider); highs.forEach(consider); bbU.forEach(consider); bbL.forEach(consider);
  if (e200) e200.forEach(consider);
  const pSpan = (pMax - pMin) || 1; pMin -= pSpan * 0.04; pMax += pSpan * 0.04;
  const py = v => PH - ((v - pMin) / (pMax - pMin)) * PH;

  const xs = closes.map((_, i) => cx(i));

  // ── price pane ──
  let g = '';
  // gridlines + right axis labels
  for (let k = 1; k <= 4; k++) {
    const gy = (PH / 5) * k, gv = pMax - (pMax - pMin) * (gy / PH);
    g += `<line x1="0" y1="${gy}" x2="${W - PAD}" y2="${gy}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
          <text x="${W - PAD + 6}" y="${gy + 3}" font-size="9" fill="rgba(255,255,255,0.35)" font-family="monospace">${gv >= 1000 ? gv.toFixed(0) : gv.toFixed(2)}</text>`;
  }

  // BB layer (fill + bands)
  const bbTop = _v2Poly(xs, bbU.map(v => v && py(v)));
  const bbBotR = [];
  for (let i = xs.length - 1; i >= 0; i--) if (bbL[i] != null) bbBotR.push(`${xs[i].toFixed(1)},${py(bbL[i]).toFixed(1)}`);
  g += `<g id="v2-prev-bb_constructive" class="v2-prev-layer">
    <polygon points="${bbTop} ${bbBotR.join(' ')}" fill="rgba(77,159,255,0.06)"/>
    <polyline points="${bbTop}" stroke="rgba(120,170,255,0.45)" stroke-width="1" fill="none"/>
    <polyline points="${_v2Poly(xs, bbL.map(v => v && py(v)))}" stroke="rgba(120,170,255,0.45)" stroke-width="1" fill="none"/>
    <text x="4" y="12" font-size="9" fill="rgba(120,170,255,0.7)" font-family="monospace">BB(20,2)</text></g>`;
  g += `<g id="v2-prev-bb_extended" class="v2-prev-layer">
    <polyline points="${bbTop}" stroke="rgba(255,61,107,0.8)" stroke-width="1.2" stroke-dasharray="3,3" fill="none"/>
    <text x="${W - PAD - 118}" y="12" font-size="9" fill="rgba(255,61,107,0.85)" font-family="monospace">close &gt; upper = flag</text></g>`;

  // extension lines off EMA50 (positions follow the sliders)
  const extMax = _v2ParamVal('extension_healthy', 'extMax', 15);
  const extMin = _v2ParamVal('extension_over',   'extMin', 25);
  g += `<g id="v2-prev-extension_healthy" class="v2-prev-layer">
    <polyline points="${_v2Poly(xs, e50.map(v => v && py(v * (1 + extMax / 100))))}" stroke="rgba(0,255,136,0.55)" stroke-width="1" stroke-dasharray="5,4" fill="none"/>
    <text x="4" y="${(py(e50[8] * (1 + extMax / 100)) || 20) - 4}" font-size="9" fill="rgba(0,255,136,0.7)" font-family="monospace">+${extMax}% ext</text></g>`;
  g += `<g id="v2-prev-extension_over" class="v2-prev-layer">
    <polyline points="${_v2Poly(xs, e50.map(v => v && py(v * (1 + extMin / 100))))}" stroke="rgba(255,61,107,0.65)" stroke-width="1" stroke-dasharray="5,4" fill="none"/>
    <text x="4" y="${(py(e50[8] * (1 + extMin / 100)) || 12) - 4}" font-size="9" fill="rgba(255,61,107,0.8)" font-family="monospace">+${extMin}% over</text></g>`;

  // SPY relative line (normalized to first visible close)
  if (spyS && spyS[0]) {
    const norm = spyS.map(v => v * (closes[0] / spyS[0]));
    const spyLine = _v2Poly(xs, norm.map(v => py(v)));
    g += `<g id="v2-prev-spy_outperform" class="v2-prev-layer">
      <polyline points="${spyLine}" stroke="rgba(160,170,190,0.7)" stroke-width="1.2" fill="none"/>
      <text x="${xs[Math.floor(N * 0.72)]}" y="${py(norm[Math.floor(N * 0.72)]) - 5}" font-size="9" fill="rgba(160,170,190,0.8)" font-family="monospace">SPY</text></g>`;
    g += `<g id="v2-prev-spy_underperform" class="v2-prev-layer">
      <polyline points="${spyLine}" stroke="rgba(255,61,107,0.4)" stroke-width="1.2" stroke-dasharray="2,3" fill="none"/></g>`;
  }

  // EMA layers
  g += `<g id="v2-prev-ema200_above" class="v2-prev-layer">${e200
    ? `<polyline points="${_v2Poly(xs, e200.map(v => v && py(v)))}" stroke="#ffcc44" stroke-width="1.4" stroke-dasharray="7,4" fill="none" opacity="0.8"/>
       <text x="${W - PAD - 52}" y="${(py(e200[N - 1]) || PH - 6) - 5}" font-size="9" fill="rgba(255,204,68,0.85)" font-family="monospace">EMA200</text>`
    : ''}</g>`;
  g += `<g id="v2-prev-ema_full_stack" class="v2-prev-layer">
    <polyline points="${_v2Poly(xs, e21.map(v => py(v)))}" stroke="#4d9fff" stroke-width="1.4" fill="none" opacity="0.9"/>
    <polyline points="${_v2Poly(xs, e50.map(v => py(v)))}" stroke="#ff9055" stroke-width="1.4" fill="none" opacity="0.85"/>
    <text x="${W - PAD - 46}" y="${py(e21[N - 1]) - 5}" font-size="9" fill="#4d9fff" font-family="monospace">EMA21</text>
    <text x="${W - PAD - 46}" y="${py(e50[N - 1]) + 11}" font-size="9" fill="#ff9055" font-family="monospace">EMA50</text></g>`;
  g += `<g id="v2-prev-ema_partial" class="v2-prev-layer">
    <polyline points="${_v2Poly(xs, e9.map(v => py(v)))}" stroke="#00ff88" stroke-width="1.4" fill="none" opacity="0.9"/>
    <text x="${W - PAD - 40}" y="${py(e9[N - 1]) - 5}" font-size="9" fill="#00ff88" font-family="monospace">EMA9</text></g>`;

  // volume bars (bottom strip of price pane)
  const vMax = Math.max(...vols) || 1;
  let volBars = '', volAvgPts = [];
  for (let i = 0; i < N; i++) {
    const h = (vols[i] / vMax) * VH;
    const up = closes[i] >= opens[i];
    volBars += `<rect x="${(cx(i) - bw * 0.32).toFixed(1)}" y="${(PH - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" fill="${up ? 'rgba(0,255,136,0.22)' : 'rgba(255,61,107,0.22)'}"/>`;
    if (i >= 20) {
      const avg = vols.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
      volAvgPts.push(`${cx(i).toFixed(1)},${(PH - (avg / vMax) * VH).toFixed(1)}`);
    }
  }
  g += `<g id="v2-prev-volume_expanding" class="v2-prev-layer">${volBars}
    <polyline points="${volAvgPts.join(' ')}" stroke="rgba(255,204,68,0.6)" stroke-width="1" fill="none"/>
    <text x="4" y="${PH - VH - 2}" font-size="9" fill="rgba(255,255,255,0.35)" font-family="monospace">VOL / 20d avg</text></g>`;

  // candlesticks (always on top)
  let candles = '';
  for (let i = 0; i < N; i++) {
    const up = closes[i] >= opens[i];
    const col = up ? '#00d977' : '#ff3d6b';
    const bodyT = py(Math.max(opens[i], closes[i])), bodyB = py(Math.min(opens[i], closes[i]));
    candles += `<line x1="${cx(i).toFixed(1)}" y1="${py(highs[i]).toFixed(1)}" x2="${cx(i).toFixed(1)}" y2="${py(lows[i]).toFixed(1)}" stroke="${col}" stroke-width="1"/>
      <rect x="${(cx(i) - bw * 0.3).toFixed(1)}" y="${bodyT.toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" height="${Math.max(1, bodyB - bodyT).toFixed(1)}" fill="${col}"/>`;
  }
  g += `<g>${candles}</g>`;
  // last price tag
  const lp = closes[N - 1];
  g += `<rect x="${W - PAD + 2}" y="${py(lp) - 8}" width="${PAD - 4}" height="15" rx="2" fill="rgba(0,255,136,0.16)"/>
        <text x="${W - PAD + 6}" y="${py(lp) + 3.5}" font-size="9" fill="#00ff88" font-family="monospace">${lp >= 1000 ? lp.toFixed(0) : lp.toFixed(2)}</text>`;

  // ── RSI pane ──
  const ry = v => RH - (v / 100) * RH;
  const rmMin = _v2ParamVal('rsi_momentum', 'rsiMin', 48), rmMax = _v2ParamVal('rsi_momentum', 'rsiMax', 65);
  const rdMin = _v2ParamVal('rsi_dip', 'rsiMin', 38),      rdMax = _v2ParamVal('rsi_dip', 'rsiMax', 48);
  let rg = `<line x1="0" y1="${ry(70)}" x2="${W - PAD}" y2="${ry(70)}" stroke="rgba(255,255,255,0.10)" stroke-width="1" stroke-dasharray="3,3"/>
    <line x1="0" y1="${ry(30)}" x2="${W - PAD}" y2="${ry(30)}" stroke="rgba(255,255,255,0.10)" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="${W - PAD + 6}" y="${ry(70) + 3}" font-size="9" fill="rgba(255,255,255,0.3)" font-family="monospace">70</text>
    <text x="${W - PAD + 6}" y="${ry(30) + 3}" font-size="9" fill="rgba(255,255,255,0.3)" font-family="monospace">30</text>`;
  rg += `<g id="v2-prev-rsi_momentum" class="v2-prev-layer">
    <rect x="0" y="${ry(rmMax)}" width="${W - PAD}" height="${ry(rmMin) - ry(rmMax)}" fill="rgba(0,255,136,0.10)"/>
    <text x="4" y="${ry(rmMax) + 10}" font-size="9" fill="rgba(0,255,136,0.75)" font-family="monospace">momentum ${rmMin}–${rmMax}</text></g>`;
  rg += `<g id="v2-prev-rsi_dip" class="v2-prev-layer">
    <rect x="0" y="${ry(rdMax)}" width="${W - PAD}" height="${ry(rdMin) - ry(rdMax)}" fill="rgba(77,159,255,0.12)"/>
    <text x="${W - PAD - 96}" y="${ry(rdMin) - 3}" font-size="9" fill="rgba(77,159,255,0.8)" font-family="monospace">dip ${rdMin}–${rdMax}</text></g>`;
  rg += `<polyline points="${_v2Poly(xs, rsiS.map(v => v == null ? null : ry(v)))}" stroke="#b48cff" stroke-width="1.5" fill="none"/>
    <text x="4" y="10" font-size="9" fill="rgba(180,140,255,0.8)" font-family="monospace">RSI 14</text>`;

  // ── MACD + OBV pane ──
  const hMax = Math.max(...macH.map(Math.abs).filter(isFinite)) || 1;
  const my = v => MH / 2 - (v / hMax) * (MH / 2 - 4);
  let mg = `<line x1="0" y1="${MH / 2}" x2="${W - PAD}" y2="${MH / 2}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`;
  let bars = '';
  for (let i = 0; i < N; i++) {
    if (!isFinite(macH[i])) continue;
    const y0 = my(Math.max(macH[i], 0)), y1 = my(Math.min(macH[i], 0));
    bars += `<rect x="${(cx(i) - bw * 0.3).toFixed(1)}" y="${y0.toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" fill="${macH[i] >= 0 ? 'rgba(0,255,136,0.5)' : 'rgba(255,61,107,0.5)'}"/>`;
  }
  const mScale = Math.max(...macL.map(Math.abs).filter(isFinite)) || 1;
  const mly = v => MH / 2 - (v / mScale) * (MH / 2 - 4);
  mg += `<g id="v2-prev-macd_positive" class="v2-prev-layer">${bars}
    <polyline points="${_v2Poly(xs, macL.map(v => isFinite(v) ? mly(v) : null))}" stroke="#4d9fff" stroke-width="1.2" fill="none" opacity="0.9"/>
    <polyline points="${_v2Poly(xs, macSg.map(v => isFinite(v) ? mly(v) : null))}" stroke="#ffcc44" stroke-width="1.2" fill="none" opacity="0.8"/>
    <text x="4" y="10" font-size="9" fill="rgba(0,255,136,0.7)" font-family="monospace">MACD 12,26,9</text></g>`;
  const oMin = Math.min(...obvS), oMax = Math.max(...obvS);
  const oy = v => MH - 4 - ((v - oMin) / ((oMax - oMin) || 1)) * (MH - 8);
  mg += `<g id="v2-prev-obv_rising" class="v2-prev-layer">
    <polyline points="${_v2Poly(xs, obvS.map(oy))}" stroke="rgba(155,107,255,0.9)" stroke-width="1.4" fill="none"/>
    <text x="${W - PAD - 34}" y="${oy(obvS[N - 1]) - 5}" font-size="9" fill="rgba(155,107,255,0.85)" font-family="monospace">OBV</text></g>`;

  host.innerHTML = `
    <div class="v2-prev-pane-lbl">PRICE · ${(_v2PrevData.label || 'SAMPLE')} · 1D</div>
    <svg viewBox="0 0 ${W} ${PH}" class="v2-prev-svg" style="height:${PH}px" preserveAspectRatio="none">${g}</svg>
    <div class="v2-prev-pane-lbl" style="margin-top:6px;">RSI</div>
    <svg viewBox="0 0 ${W} ${RH}" class="v2-prev-svg" style="height:${RH}px" preserveAspectRatio="none">${rg}</svg>
    <div class="v2-prev-pane-lbl" style="margin-top:6px;">MACD · OBV</div>
    <svg viewBox="0 0 ${W} ${MH}" class="v2-prev-svg" style="height:${MH}px" preserveAspectRatio="none">${mg}</svg>`;

  _v2PrevSync();
}

let _v2RefreshTimer = null;
function _v2QueuePreviewRefresh() {
  clearTimeout(_v2RefreshTimer);
  _v2RefreshTimer = setTimeout(() => {
    _v2RenderPreview();
    if (_v2TestedTicker) runV2TickerTest(true);
  }, 220);
}

// ── Live single-ticker test ───────────────────────────────────────────────────

async function runV2TickerTest(silent) {
  const input = document.getElementById('v2TestTickerInput');
  const modeEl = document.getElementById('v2PrevMode');
  const verdictEl = document.getElementById('v2TestVerdict');
  let ticker = (silent ? _v2TestedTicker : input?.value || '').trim().toUpperCase();
  if (!ticker) return;
  if (typeof normalizeTicker === 'function') ticker = normalizeTicker(ticker);

  if (!silent && modeEl) modeEl.textContent = '⏳ LOADING ' + ticker;
  try {
    const [data, spyData] = await Promise.all([
      _fetchScanData(ticker, '1y|6mo'),
      _fetchScanData('SPY', '1y|6mo'),
    ]);
    if (!data || (data.closes || []).filter(Boolean).length < 30) {
      if (modeEl) modeEl.textContent = '⚠ NO DATA FOR ' + ticker;
      return;
    }
    // clean & align
    const okIdx = [];
    data.closes.forEach((c, i) => { if (c != null) okIdx.push(i); });
    const pick = (arr, fb) => okIdx.map(i => (arr || [])[i] ?? fb?.[i]);
    _v2PrevData = {
      closes: pick(data.closes), opens: pick(data.opens, data.closes),
      highs: pick(data.highs, data.closes), lows: pick(data.lows, data.closes),
      volumes: okIdx.map(i => (data.volumes || [])[i] || 0),
      spy: spyData ? okIdx.map(i => (spyData.closes || [])[i]).map(v => v ?? null) : null,
      label: ticker,
    };
    _v2TestedTicker = ticker;
    _v2RenderPreview();
    if (modeEl) modeEl.textContent = '● LIVE ' + ticker;

    // score against the CURRENT builder config — identical math to the full scan
    const config = getBuilderConfig();
    const res = await analyzeWithConfig(ticker, config, spyData?.closes || null, true);
    if (!verdictEl) return;
    verdictEl.style.display = 'block';
    if (res?.gateFail) {
      verdictEl.innerHTML = `<div class="v2-verdict v2-verdict-fail">
        <span class="v2-verdict-badge">✕ GATED OUT</span>
        <span class="v2-verdict-detail">${res.gateFail}</span></div>`;
      return;
    }
    if (!res) { verdictEl.innerHTML = ''; verdictEl.style.display = 'none'; return; }
    const pass = res.qualifies;
    const chips = V2_SIGNAL_DEFS.map(def => {
      const cfgSig = (config.signals || []).find(s => s.key === def.key);
      if (!cfgSig || cfgSig.enabled === false) return '';
      const hit = res.hitKeys.includes(def.key);
      const neg = cfgSig.points < 0;
      const cls = hit ? (neg ? 'v2-chip-neg' : 'v2-chip-hit') : 'v2-chip-miss';
      const pts = hit ? ` ${cfgSig.points > 0 ? '+' : ''}${cfgSig.points}` : '';
      return `<span class="v2-chip ${cls}">${hit ? (neg ? '⚠' : '✓') : '·'} ${def.label.replace(/ ⚠$/, '')}${pts}</span>`;
    }).join('');
    verdictEl.innerHTML = `<div class="v2-verdict ${pass ? 'v2-verdict-pass' : 'v2-verdict-fail'}">
      <span class="v2-verdict-badge">${pass ? '✓ QUALIFIES' : '✕ BELOW THRESHOLD'}</span>
      <span class="v2-verdict-score">${res.score.toFixed(1)} / ${res.threshold} pts needed</span>
      <span class="v2-verdict-detail">$${res.price.toFixed(2)} · conviction ${res.conviction}%</span>
    </div><div class="v2-chip-row">${chips}</div>`;
  } catch (e) {
    if (modeEl) modeEl.textContent = '⚠ FETCH FAILED';
  }
}

function _v2PreviewHTML() {
  return `<div id="v2PreviewPanel" class="v2-preview">
    <div class="v2-preview-hdr">
      <span>LIVE STRATEGY PREVIEW</span>
      <div class="v2-test-controls">
        <input id="v2TestTickerInput" class="v2-test-input" placeholder="TICKER — e.g. NVDA" maxlength="12"
          onkeydown="if(event.key==='Enter')runV2TickerTest()">
        <button class="v2-test-btn" onclick="runV2TickerTest()">⚡ TEST</button>
        <span id="v2PrevMode" class="v2-prev-count">SAMPLE DATA</span>
        <span id="v2PrevCount" class="v2-prev-count"></span>
      </div>
    </div>
    <div id="v2TestVerdict" style="display:none;"></div>
    <div id="v2PrevChart"></div>
  </div>`;
}

function _v2PrevSync() {
  let n = 0;
  V2_SIGNAL_DEFS.forEach(def => {
    const chk   = document.querySelector(`input[type="checkbox"][data-sig-key="${def.key}"]`);
    const layer = document.getElementById(`v2-prev-${def.key}`);
    const on = chk ? chk.checked : false;
    if (on) n++;
    if (layer) layer.style.opacity = on ? '1' : '0';
  });
  const cnt = document.getElementById('v2PrevCount');
  if (cnt) cnt.textContent = `${n} SIGNAL${n === 1 ? '' : 'S'} ACTIVE`;
}

// ── Builder UI ────────────────────────────────────────────────────────────────

function initV2Builder() {
  const container = document.getElementById('v2SignalRows');
  if (!container || container.dataset.built) return;
  container.dataset.built = '1';

  document.getElementById('v2PreviewPanel')?.remove();
  container.insertAdjacentHTML('beforebegin', _v2PreviewHTML());

  const card = def => {
    const isNeg = def.points < 0;
    const ptsStr = (def.points > 0 ? '+' : '') + def.points + ' pts';
    const chart = V2_CHARTS[def.key] || '';

    const paramSliders = def.params.map(p => {
      const isFloat = p.step < 1;
      const dispVal = isFloat ? p.default.toFixed(2) : p.default;
      return `<div class="v2-sl-line">
        <span class="v2-sl-lbl">${p.label.toUpperCase()}</span>
        <input type="range" class="v2-range"
          data-key="${def.key}" data-param="${p.id}"
          value="${p.default}" min="${p.min}" max="${p.max}" step="${p.step}"
          oninput="_v2Disp('${def.key}','${p.id}',this.value,${isFloat});_v2Fill(this);_v2QueuePreviewRefresh()">
        <span class="v2-sl-val" id="v2-val-${def.key}-${p.id}">${dispVal}</span>
      </div>`;
    }).join('');

    const ptsMin = isNeg ? -15 : -8, ptsMax = isNeg ? 8 : 15;
    return `<div class="v2-sig-card${isNeg ? ' v2-sig-neg-card' : ''}">
      <div class="v2-sig-hdr">
        <label class="v2-toggle">
          <input type="checkbox" data-sig-key="${def.key}" ${def.points > 0 ? 'checked' : ''} onchange="_v2PrevSync();_v2QueuePreviewRefresh()">
          <span class="v2-toggle-track"></span>
        </label>
        <span class="v2-sig-name${isNeg ? ' v2-sig-neg-name' : ''}">${def.label}</span>
        <span class="v2-sig-badge${isNeg ? ' v2-sig-neg-badge' : ''}" id="v2-pts-badge-${def.key}">${ptsStr}</span>
      </div>
      <div class="v2-sig-chart">${chart}</div>
      ${paramSliders}
      <div class="v2-sl-line v2-wt-line">
        <span class="v2-sl-lbl">WEIGHT</span>
        <input type="range" class="v2-range v2-range-pts"
          data-pts-for="${def.key}"
          value="${def.points}" min="${ptsMin}" max="${ptsMax}" step="0.5"
          oninput="_v2Pts('${def.key}',this.value);_v2Fill(this);_v2QueuePreviewRefresh()">
        <span class="v2-sl-val v2-wt-val" id="v2-pts-val-${def.key}">${ptsStr}</span>
      </div>
    </div>`;
  };

  const pos = V2_SIGNAL_DEFS.filter(d => d.points > 0);
  const neg = V2_SIGNAL_DEFS.filter(d => d.points < 0);
  container.innerHTML =
    `<div class="v2-sec-hdr">✚ SCORE BUILDERS <span class="v2-sec-sub">add points when true</span></div>` +
    pos.map(card).join('') +
    `<div class="v2-sec-hdr v2-sec-neg">⚠ RISK FLAGS <span class="v2-sec-sub">subtract points when true</span></div>` +
    neg.map(card).join('');

  container.querySelectorAll('.v2-range').forEach(_v2Fill);
  _v2RenderPreview();
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
    scoreThreshold: parseFloat(document.getElementById('v2ScoreThreshold')?.value ?? 13),
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
      if (pts) { pts.value = s.points; _v2Fill(pts); _v2Pts(s.key, s.points); }
      for (const [param, val] of Object.entries(s)) {
        if (['key','enabled','points'].includes(param)) continue;
        const def = V2_SIGNAL_DEFS.find(d => d.key === s.key);
        const pDef = def?.params.find(p => p.id === param);
        const el = document.querySelector(`input[data-key="${s.key}"][data-param="${param}"]`);
        if (el) {
          el.value = val;
          _v2Fill(el);
          _v2Disp(s.key, param, val, pDef ? pDef.step < 1 : false);
        }
      }
    }
  }
  _v2RenderPreview();
}

function resetV2Builder() {
  const container = document.getElementById('v2SignalRows');
  if (container) delete container.dataset.built;
  initV2Builder();
  const defaults = {
    scoreThreshold: 13,
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

async function analyzeWithConfig(ticker, config, spyCloses, detail) {
  const gateFail = reason => detail ? { ticker, gateFail: reason } : null;

  const data = await _fetchScanData(ticker, '6mo|3mo');
  if (!data) return gateFail('No market data available for this ticker');
  const { closes, volumes } = data;
  if (closes.length < 50) return gateFail('Not enough price history (<50 bars)');

  const price = closes[closes.length - 1];
  const g = config.gates || {};
  if (!price || price < (g.minPrice ?? 2)) return gateFail(`Price $${(price ?? 0).toFixed(2)} below min price gate`);

  const ema9   = _emaScalar(closes, 9);
  const ema21  = _emaScalar(closes, 21);
  const ema50  = _emaScalar(closes, 50);
  const ema200 = _emaScalar(closes, 200);
  const rsi    = _rsiScan(closes);
  const macd   = _macdScan(closes);
  const bb     = _bbScan(closes);
  const obv    = _obvScan(closes, volumes);

  if (!ema9 || !ema21 || !ema50 || !rsi || !bb) return gateFail('Could not compute indicators');

  if (g.requireAboveEMA50 !== false && price < ema50) return gateFail(`Price $${price.toFixed(2)} below EMA50 $${ema50.toFixed(2)} — hard gate`);
  if (rsi > (g.maxRSI ?? 76)) return gateFail(`RSI ${rsi.toFixed(0)} above max RSI gate (${g.maxRSI ?? 76}) — overbought`);
  if (g.requireRisingEMA50Slope !== false && closes.length >= 70) {
    const prior = _emaScalar(closes.slice(0, -20), 50);
    if (prior && ema50 < prior * 0.998) return gateFail('EMA50 slope falling — hard gate');
  }

  const sm = {};
  for (const s of (config.signals || [])) sm[s.key] = s;

  let score = 0;
  const signals = [];
  const hitKeys = [];
  const _hit = k => hitKeys.push(k);

  // EMA alignment
  const sf = sm['ema_full_stack'], sp = sm['ema_partial'];
  if (sf?.enabled && ema9 > ema21 && ema21 > ema50) {
    score += sf.points; _hit('ema_full_stack'); signals.push('Full EMA stack aligned (9>21>50)');
  } else if (sp?.enabled && ema9 > ema21) {
    score += sp.points; _hit('ema_partial'); signals.push('EMA9>EMA21 — short-term momentum');
  }

  // EMA200
  const s200 = sm['ema200_above'];
  if (s200?.enabled && ema200 && price > ema200) {
    score += s200.points; _hit('ema200_above'); signals.push(`Above EMA200 ($${ema200.toFixed(2)})`);
  }

  // RSI zones
  const srm = sm['rsi_momentum'], srd = sm['rsi_dip'];
  if (srm?.enabled && rsi >= (srm.rsiMin ?? 48) && rsi <= (srm.rsiMax ?? 65)) {
    score += srm.points; _hit('rsi_momentum'); signals.push(`RSI ${rsi.toFixed(0)} — momentum zone`);
  } else if (srd?.enabled && rsi >= (srd.rsiMin ?? 38) && rsi < (srd.rsiMax ?? 48)) {
    score += srd.points; _hit('rsi_dip'); signals.push(`RSI ${rsi.toFixed(0)} — dip zone`);
  }

  // MACD
  const smc = sm['macd_positive'];
  if (smc?.enabled && macd != null && macd > 0) {
    score += smc.points; _hit('macd_positive'); signals.push('MACD positive');
  }

  // Extension from EMA50
  const extPct = (price - ema50) / ema50 * 100;
  const seh = sm['extension_healthy'], seo = sm['extension_over'];
  if (seh?.enabled && extPct <= (seh.extMax ?? 15)) {
    score += seh.points; _hit('extension_healthy'); signals.push(`${extPct.toFixed(1)}% above EMA50 — healthy`);
  } else if (seo?.enabled && extPct > (seo.extMin ?? 25)) {
    score += seo.points; _hit('extension_over'); signals.push(`${extPct.toFixed(1)}% above EMA50 — overextended`);
  }

  // OBV
  const sobv = sm['obv_rising'];
  const obvPer = sobv?.obvPeriod ?? 10;
  if (sobv?.enabled && obv.length >= obvPer) {
    const o = obv.slice(-obvPer);
    if (o[o.length - 1] > o[0]) { score += sobv.points; _hit('obv_rising'); signals.push(`OBV rising ${obvPer}-day`); }
  }

  // Volume
  const svol = sm['volume_expanding'];
  if (svol?.enabled && volumes.length >= 25) {
    const rv = volumes.slice(-5).reduce((a, b) => a + (b || 0), 0) / 5;
    const av = volumes.slice(-25, -5).reduce((a, b) => a + (b || 0), 0) / 20;
    if (av > 0 && rv > av * (svol.volThreshold ?? 1.15)) {
      score += svol.points; _hit('volume_expanding'); signals.push('Volume expanding');
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
        score += sout.points; _hit('spy_outperform'); signals.push(`Outperforming SPY by ${(tkrRet - spyRet).toFixed(1)}%`);
      } else if (sund?.enabled && tkrRet < spyRet - (sund.spyLag ?? 5)) {
        score += sund.points; _hit('spy_underperform'); signals.push('Underperforming SPY');
      }
    }
  }

  // Bollinger Bands
  const sbc = sm['bb_constructive'], sbe = sm['bb_extended'];
  if (sbc?.enabled && price > bb.mean && price < bb.upper) {
    score += sbc.points; _hit('bb_constructive'); signals.push('BB constructive position');
  } else if (sbe?.enabled && price > bb.upper) {
    score += sbe.points; _hit('bb_extended'); signals.push('BB overextended');
  }

  const maxScore = (config.signals || [])
    .filter(s => s.enabled && s.points > 0)
    .reduce((sum, s) => sum + s.points, 0) || 18;

  const threshold  = config.scoreThreshold ?? 13;
  const conviction = Math.min(100, Math.max(0, Math.round(score / maxScore * 100)));

  return { ticker, price, signals, conviction, score, qualifies: score >= threshold,
           topSignal: signals[0] || null, hitKeys, threshold, maxScore, gateFail: null };
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

  const spyData   = await _fetchScanData('SPY', '3mo');
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
