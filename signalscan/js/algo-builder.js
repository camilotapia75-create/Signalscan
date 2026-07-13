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
// Two stacked panes. Each signal owns an SVG layer (id v2-prev-<key>) that
// fades in/out as its toggle changes, so the chart always shows exactly what
// the current strategy is looking for.

function _v2PreviewHTML() {
  return `<div id="v2PreviewPanel" class="v2-preview">
    <div class="v2-preview-hdr">
      <span>LIVE STRATEGY PREVIEW</span>
      <span id="v2PrevCount" class="v2-prev-count"></span>
    </div>
    <div class="v2-prev-pane-lbl">PRICE</div>
    <svg viewBox="0 0 440 160" fill="none" class="v2-prev-svg" preserveAspectRatio="none">
      <g id="v2-prev-extension_over" class="v2-prev-layer">
        <polyline points="0,84 110,68 220,48 330,28 440,12" stroke="#ff3d6b" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.75"/>
        <text x="6" y="80" font-size="9" fill="rgba(255,61,107,0.8)" font-family="monospace">&gt;25% over EMA50 — overextended</text>
      </g>
      <g id="v2-prev-extension_healthy" class="v2-prev-layer">
        <polyline points="0,104 60,100 120,88 180,78 240,72 300,56 360,44 440,32" stroke="#00ff88" stroke-width="1.1" stroke-dasharray="5,4" opacity="0.6"/>
        <text x="6" y="100" font-size="9" fill="rgba(0,255,136,0.7)" font-family="monospace">+15% ext ceiling — healthy below</text>
      </g>
      <g id="v2-prev-bb_constructive" class="v2-prev-layer">
        <polyline points="0,100 110,84 220,64 330,44 440,26" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="3,3"/>
        <polyline points="0,140 110,128 220,112 330,96 440,80" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="3,3"/>
        <text x="360" y="98" font-size="9" fill="rgba(255,255,255,0.4)" font-family="monospace">BB</text>
      </g>
      <g id="v2-prev-bb_extended" class="v2-prev-layer">
        <circle cx="390" cy="32" r="7" stroke="#ff3d6b" stroke-width="1.5" fill="rgba(255,61,107,0.15)"/>
        <text x="316" y="20" font-size="9" fill="rgba(255,61,107,0.85)" font-family="monospace">above upper band</text>
      </g>
      <g id="v2-prev-ema_full_stack" class="v2-prev-layer">
        <polyline points="0,128 60,122 120,106 180,94 240,88 300,68 360,56 440,44" stroke="#4d9fff" stroke-width="1.4" opacity="0.85"/>
        <polyline points="0,134 60,130 120,118 180,108 240,102 300,86 360,74 440,62" stroke="#ff9055" stroke-width="1.4" opacity="0.8"/>
        <text x="6" y="126" font-size="9" fill="rgba(77,159,255,0.8)" font-family="monospace">EMA21</text>
        <text x="6" y="141" font-size="9" fill="rgba(255,144,85,0.8)" font-family="monospace">EMA50</text>
      </g>
      <g id="v2-prev-ema_partial" class="v2-prev-layer">
        <polyline points="0,124 60,118 120,98 180,86 240,80 300,58 360,46 440,34" stroke="#00ff88" stroke-width="1.4" opacity="0.85"/>
        <text x="60" y="112" font-size="9" fill="rgba(0,255,136,0.8)" font-family="monospace">EMA9</text>
      </g>
      <g id="v2-prev-ema200_above" class="v2-prev-layer">
        <polyline points="0,150 110,147 220,144 330,141 440,138" stroke="#ffcc44" stroke-width="1.3" stroke-dasharray="6,4" opacity="0.7"/>
        <text x="360" y="149" font-size="9" fill="rgba(255,204,68,0.8)" font-family="monospace">EMA200</text>
      </g>
      <g id="v2-prev-spy_outperform" class="v2-prev-layer">
        <polyline points="0,118 110,112 220,108 330,104 440,100" stroke="#4d9fff" stroke-width="1.2" opacity="0.45"/>
        <text x="200" y="118" font-size="9" fill="rgba(77,159,255,0.65)" font-family="monospace">SPY (stock above = outperforming)</text>
      </g>
      <g id="v2-prev-spy_underperform" class="v2-prev-layer">
        <polyline points="0,118 110,124 220,130 330,134 440,140" stroke="#ff3d6b" stroke-width="1.2" opacity="0.55" stroke-dasharray="2,3"/>
        <text x="230" y="152" font-size="9" fill="rgba(255,61,107,0.7)" font-family="monospace">lagging SPY</text>
      </g>
      <polyline points="0,120 30,112 60,116 90,100 120,92 150,98 180,80 210,72 240,78 270,60 300,52 330,58 360,42 390,34 420,38 440,30"
        stroke="#e8edf2" stroke-width="2" opacity="0.95"/>
    </svg>
    <div class="v2-prev-pane-lbl" style="margin-top:8px;">MOMENTUM &amp; VOLUME</div>
    <svg viewBox="0 0 440 80" fill="none" class="v2-prev-svg v2-prev-svg-sm" preserveAspectRatio="none">
      <g id="v2-prev-rsi_momentum" class="v2-prev-layer">
        <rect x="0" y="22" width="440" height="20" fill="rgba(0,255,136,0.09)"/>
        <line x1="0" y1="22" x2="440" y2="22" stroke="rgba(0,255,136,0.4)" stroke-width="0.8" stroke-dasharray="4,3"/>
        <line x1="0" y1="42" x2="440" y2="42" stroke="rgba(0,255,136,0.4)" stroke-width="0.8" stroke-dasharray="4,3"/>
        <text x="4" y="19" font-size="9" fill="rgba(0,255,136,0.7)" font-family="monospace">RSI momentum zone</text>
        <polyline points="0,52 40,38 80,30 120,36 160,28 200,33 240,29 280,35 320,30 360,34 400,28 440,31" stroke="#00ff88" stroke-width="1.5" opacity="0.9"/>
      </g>
      <g id="v2-prev-rsi_dip" class="v2-prev-layer">
        <rect x="0" y="44" width="440" height="14" fill="rgba(77,159,255,0.10)"/>
        <line x1="0" y1="44" x2="440" y2="44" stroke="rgba(77,159,255,0.4)" stroke-width="0.8" stroke-dasharray="4,3"/>
        <line x1="0" y1="58" x2="440" y2="58" stroke="rgba(77,159,255,0.4)" stroke-width="0.8" stroke-dasharray="4,3"/>
        <text x="4" y="70" font-size="9" fill="rgba(77,159,255,0.7)" font-family="monospace">RSI dip-buy zone</text>
      </g>
      <g id="v2-prev-macd_positive" class="v2-prev-layer">
        <rect x="4"   y="66" width="12" height="10" fill="rgba(0,255,136,0.4)"/>
        <rect x="22"  y="61" width="12" height="15" fill="rgba(0,255,136,0.5)"/>
        <rect x="40"  y="57" width="12" height="19" fill="rgba(0,255,136,0.55)"/>
        <rect x="58"  y="60" width="12" height="16" fill="rgba(0,255,136,0.5)"/>
        <rect x="76"  y="53" width="12" height="23" fill="rgba(0,255,136,0.6)"/>
        <rect x="94"  y="48" width="12" height="28" fill="rgba(0,255,136,0.68)"/>
        <rect x="112" y="44" width="12" height="32" fill="rgba(0,255,136,0.75)"/>
        <text x="130" y="74" font-size="9" fill="rgba(0,255,136,0.7)" font-family="monospace">MACD+</text>
      </g>
      <g id="v2-prev-volume_expanding" class="v2-prev-layer">
        <rect x="250" y="66" width="14" height="10" fill="rgba(155,107,255,0.35)"/>
        <rect x="270" y="63" width="14" height="13" fill="rgba(155,107,255,0.35)"/>
        <rect x="290" y="65" width="14" height="11" fill="rgba(155,107,255,0.35)"/>
        <rect x="310" y="62" width="14" height="14" fill="rgba(155,107,255,0.35)"/>
        <rect x="330" y="64" width="14" height="12" fill="rgba(155,107,255,0.35)"/>
        <rect x="350" y="42" width="14" height="34" fill="rgba(155,107,255,0.8)"/>
        <text x="370" y="52" font-size="9" fill="rgba(155,107,255,0.85)" font-family="monospace">vol ↑</text>
      </g>
      <g id="v2-prev-obv_rising" class="v2-prev-layer">
        <polyline points="180,72 230,66 280,58 330,48 380,38 440,24" stroke="#4d9fff" stroke-width="1.5" opacity="0.85"/>
        <text x="182" y="62" font-size="9" fill="rgba(77,159,255,0.8)" font-family="monospace">OBV</text>
      </g>
    </svg>
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
          oninput="_v2Disp('${def.key}','${p.id}',this.value,${isFloat});_v2Fill(this)">
        <span class="v2-sl-val" id="v2-val-${def.key}-${p.id}">${dispVal}</span>
      </div>`;
    }).join('');

    const ptsMin = isNeg ? -15 : -8, ptsMax = isNeg ? 8 : 15;
    return `<div class="v2-sig-card${isNeg ? ' v2-sig-neg-card' : ''}">
      <div class="v2-sig-hdr">
        <label class="v2-toggle">
          <input type="checkbox" data-sig-key="${def.key}" ${def.points > 0 ? 'checked' : ''} onchange="_v2PrevSync()">
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
          oninput="_v2Pts('${def.key}',this.value);_v2Fill(this)">
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
  _v2PrevSync();
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
  _v2PrevSync();
}

function resetV2Builder() {
  const container = document.getElementById('v2SignalRows');
  if (container) delete container.dataset.built;
  initV2Builder();
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
  const data = await _fetchScanData(ticker, '6mo|3mo');
  if (!data) return null;
  const { closes, volumes } = data;
  if (closes.length < 50) return null;

  const price = closes[closes.length - 1];
  const g = config.gates || {};
  if (!price || price < (g.minPrice ?? 2)) return null;

  const ema9   = _emaScalar(closes, 9);
  const ema21  = _emaScalar(closes, 21);
  const ema50  = _emaScalar(closes, 50);
  const ema200 = _emaScalar(closes, 200);
  const rsi    = _rsiScan(closes);
  const macd   = _macdScan(closes);
  const bb     = _bbScan(closes);
  const obv    = _obvScan(closes, volumes);

  if (!ema9 || !ema21 || !ema50 || !rsi || !bb) return null;

  if (g.requireAboveEMA50 !== false && price < ema50) return null;
  if (rsi > (g.maxRSI ?? 76)) return null;
  if (g.requireRisingEMA50Slope !== false && closes.length >= 70) {
    const prior = _emaScalar(closes.slice(0, -20), 50);
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
