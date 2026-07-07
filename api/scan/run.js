// Autonomous daily scanner — triggered by Vercel cron or manual GET/POST
// GET /api/scan/run  (Vercel cron sends Authorization: Bearer <CRON_SECRET>)
//
// Required env vars:
//   SUPABASE_SERVICE_ROLE_KEY  — write to golden_bull_hof, bull_pen_hof, scan_run_log
//   CRON_SECRET                — set in Vercel dashboard (any random string)
//
// Adaptive scoring: loads learned signal weights from signal_weights table.
// Weights start at defaults and drift toward what actually predicts gains.

const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://bhykfnuljzzimzmdjcia.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET      = process.env.CRON_SECRET;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let _crumb = '', _cookie = '', _crumbAt = 0;
const CRUMB_TTL  = 4 * 60 * 1000;
const DATA_CACHE = new Map();
const DATA_TTL   = 15 * 60 * 1000;

// ── Signal definitions — key maps to default base points and text pattern ────

const SIGNAL_DEFS = {
  ema_full_stack:    { base:  3.0 },
  ema_partial:       { base:  1.0 },
  ema200_above:      { base:  2.0 },
  rsi_momentum:      { base:  3.0 },
  rsi_dip:           { base:  1.0 },
  macd_positive:     { base:  2.0 },
  extension_healthy: { base:  2.0 },
  extension_over:    { base: -2.0 },
  obv_rising:        { base:  2.0 },
  volume_expanding:  { base:  1.0 },
  spy_outperform:    { base:  2.0 },
  spy_underperform:  { base: -1.0 },
  bb_constructive:   { base:  1.0 },
  bb_extended:       { base: -1.0 },
};

// ── Yahoo Finance data fetching ───────────────────────────────────────────────

async function refreshCrumb() {
  try {
    const homeRes = await fetch('https://finance.yahoo.com/', {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow', signal: AbortSignal.timeout(8000),
    });
    const rawCookies = homeRes.headers.getSetCookie
      ? homeRes.headers.getSetCookie()
      : (homeRes.headers.get('set-cookie') || '').split(/,(?=[^ ])/);
    _cookie = rawCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
    const cr = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: _cookie }, signal: AbortSignal.timeout(5000),
    });
    const t = await cr.text();
    if (t && t.length < 20 && !t.includes('<')) { _crumb = t.trim(); _crumbAt = Date.now(); }
  } catch (_) {}
}

async function fetchYF(ticker) {
  const hit = DATA_CACHE.get(ticker);
  if (hit && Date.now() - hit.ts < DATA_TTL) return hit.data;

  if (!_crumb || Date.now() - _crumbAt > CRUMB_TTL) await refreshCrumb();

  for (const range of ['6mo', '3mo']) {
    try {
      const crumbParam = _crumb ? `&crumb=${encodeURIComponent(_crumb)}` : '';
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}&includePrePost=false${crumbParam}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://finance.yahoo.com/', ...(_cookie ? { Cookie: _cookie } : {}) },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { _crumb = ''; _crumbAt = 0; }
        continue;
      }
      const json   = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const closes  = result.indicators?.quote?.[0]?.close  || [];
      const volumes = result.indicators?.quote?.[0]?.volume || [];
      if (closes.length < 2) continue;
      const data = { closes, volumes };
      DATA_CACHE.set(ticker, { data, ts: Date.now() });
      return data;
    } catch (_) { continue; }
  }
  return null;
}

// ── Load learned weights from Supabase ────────────────────────────────────────

async function loadSignalWeights() {
  if (!SUPABASE_SERVICE) return {};
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/signal_weights?select=signal_key,base_points`,
      { headers: { apikey: SUPABASE_SERVICE, Authorization: `Bearer ${SUPABASE_SERVICE}` },
        signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return {};
    const rows = await res.json();
    const w = {};
    for (const r of (Array.isArray(rows) ? rows : [])) {
      w[r.signal_key] = parseFloat(r.base_points);
    }
    console.log(`[scan/run] Loaded ${Object.keys(w).length} learned signal weights`);
    return w;
  } catch (_) { return {}; }
}

function pts(key, weights) {
  return weights[key] !== undefined ? weights[key] : (SIGNAL_DEFS[key]?.base ?? 0);
}

// ── Technical indicators ─────────────────────────────────────────────────────

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
  const e12 = calcEMA(closes, 12), e26 = calcEMA(closes, 26);
  if (e12 == null || e26 == null) return null;
  return e12 - e26;
}

function calcBB(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean  = slice.reduce((a, b) => a + b, 0) / period;
  const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return { upper: mean + 2 * std, lower: mean - 2 * std, mean };
}

function calcOBV(closes, volumes) {
  let obv = 0;
  const arr = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1])      obv += (volumes[i] || 0);
    else if (closes[i] < closes[i - 1]) obv -= (volumes[i] || 0);
    arr.push(obv);
  }
  return arr;
}

// ── Core scoring — uses learned weights, records which signals fired ──────────

function _scoreTicker(closes, volumes, spyCloses, rsiGate, weights) {
  const price  = closes[closes.length - 1];
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

  if (price < ema50) return null;
  if (rsi > rsiGate) return null;
  if (closes.length >= 70) {
    const ema50Prior = calcEMA(closes.slice(0, -20), 50);
    if (ema50Prior && ema50 < ema50Prior * 0.998) return null;
  }

  let score = 0;
  const signalTexts = [];
  const signalKeys  = [];

  function add(key, text) {
    const p = pts(key, weights);
    score += p;
    signalTexts.push(text);
    signalKeys.push(key);
  }

  if (ema9 > ema21 && ema21 > ema50) {
    add('ema_full_stack', 'Full EMA stack aligned (9 > 21 > 50) — confirmed uptrend');
  } else if (ema9 > ema21) {
    add('ema_partial', 'EMA9 > EMA21 — short-term bullish momentum');
  }

  if (ema200 && price > ema200) {
    add('ema200_above', `Above EMA200 ($${ema200.toFixed(2)}) — long-term bull market structure`);
  }

  if (rsi >= 48 && rsi <= 65) {
    add('rsi_momentum', `RSI ${rsi.toFixed(0)} — momentum zone, upside room intact`);
  } else if (rsi >= 38 && rsi < 48) {
    add('rsi_dip', `RSI ${rsi.toFixed(0)} — pulling back into support zone`);
  }

  if (macd && macd > 0) {
    add('macd_positive', 'MACD positive — bull momentum building');
  }

  const extPct = (price - ema50) / ema50 * 100;
  if (extPct <= 15) {
    add('extension_healthy', `${extPct.toFixed(1)}% above EMA50 — healthy, room to extend`);
  } else if (extPct > 25) {
    add('extension_over', `${extPct.toFixed(1)}% above EMA50 — overextended, high reversal risk`);
  }

  if (obv.length >= 10) {
    const o = obv.slice(-10);
    if (o[o.length - 1] > o[0]) {
      add('obv_rising', 'OBV rising 10-day — sustained institutional accumulation');
    }
  }

  if (volumes.length >= 25) {
    const recentVol = volumes.slice(-5).reduce((a, b) => a + (b || 0), 0) / 5;
    const avgVol    = volumes.slice(-25, -5).reduce((a, b) => a + (b || 0), 0) / 20;
    if (avgVol > 0 && recentVol > avgVol * 1.15) {
      add('volume_expanding', 'Volume expanding above 20-day average — participation growing');
    }
  }

  if (spyCloses?.length >= 20) {
    const sc     = spyCloses.filter(Boolean);
    const spyRet = (sc[sc.length - 1] - sc[sc.length - 20]) / sc[sc.length - 20] * 100;
    const tkrRet = closes.length >= 20
      ? (closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20] * 100
      : null;
    if (tkrRet !== null && tkrRet > spyRet + 3) {
      add('spy_outperform', `Outperforming SPY by ${(tkrRet - spyRet).toFixed(1)}% over 20 days`);
    } else if (tkrRet !== null && tkrRet < spyRet - 5) {
      add('spy_underperform', 'Underperforming SPY — relative weakness');
    }
  }

  if (price > bb.mean && price < bb.upper) {
    add('bb_constructive', 'Between BB mean and upper band — constructive trend position');
  } else if (price > bb.upper) {
    add('bb_extended', 'Above BB upper band — short-term overextended');
  }

  return { price, score, signalTexts, signalKeys };
}

async function analyzeTickerBoth(ticker, spyCloses, weights) {
  const data = await fetchYF(ticker);
  if (!data) return { golden: null, bullpen: null };
  const { closes, volumes } = data;
  if (closes.length < 50) return { golden: null, bullpen: null };

  // Compute weighted max score so threshold scales with weights
  const weightedMax = Object.entries(SIGNAL_DEFS)
    .filter(([, d]) => d.base > 0)
    .reduce((sum, [key, d]) => sum + Math.max(0, pts(key, weights)), 0);
  const threshold = weightedMax * 0.56; // 56% of max = Golden Bull

  const gbRes = _scoreTicker(closes, volumes, spyCloses, 76, weights);
  const bpRes = _scoreTicker(closes, volumes, spyCloses, 78, weights);

  const toEntry = (r, minScore) => {
    if (!r) return null;
    const conviction = Math.min(100, Math.max(0, Math.round(r.score / weightedMax * 100)));
    return {
      ticker,
      price:      r.price,
      signals:    r.signalTexts,
      signalKeys: r.signalKeys,
      conviction,
      topSignal:  r.signalTexts[0] || null,
      qualifies:  r.score >= minScore,
    };
  };

  return {
    golden:  toEntry(gbRes, threshold),
    bullpen: toEntry(bpRes, threshold * 0.7),
  };
}

// ── Supabase persistence ─────────────────────────────────────────────────────

async function recordBulls(bulls, table) {
  if (!SUPABASE_SERVICE || !bulls.length) return 0;

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=ticker&detected_at=gte.${cutoff}`,
      { headers: { apikey: SUPABASE_SERVICE, Authorization: `Bearer ${SUPABASE_SERVICE}` } }
    );
    const recent = checkRes.ok ? await checkRes.json() : [];
    const seen   = new Set((Array.isArray(recent) ? recent : []).map(r => r.ticker));
    const fresh  = bulls.filter(b => !seen.has(b.ticker));
    if (!fresh.length) return 0;

    const rows = fresh.map(b => ({
      ticker:       b.ticker,
      signal_price: b.price,
      conviction:   b.conviction,
      detected_at:  new Date().toISOString(),
      source:       'scanner',
      signal_keys:  b.signalKeys || [],
    }));

    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE, Authorization: `Bearer ${SUPABASE_SERVICE}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    return fresh.length;
  } catch (e) {
    console.error(`[scan/run] recordBulls(${table}):`, e.message);
    return 0;
  }
}

async function logScanRun(summary) {
  if (!SUPABASE_SERVICE) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/scan_run_log`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE, Authorization: `Bearer ${SUPABASE_SERVICE}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        ran_at:          new Date().toISOString(),
        tickers_scanned: summary.scanned,
        gb_found:        summary.gb_found,
        gb_new:          summary.gb_new,
        bp_found:        summary.bp_found,
        bp_new:          summary.bp_new,
        gb_tickers:      summary.gb_tickers,
        duration_ms:     summary.duration_ms,
      }),
    });
  } catch (_) {}
}

// ── Ticker universe ──────────────────────────────────────────────────────────

const SCAN_UNIVERSE_CORE = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','ORCL','CRM',
  'NFLX','ADBE','AMD','INTC','QCOM',
  'PLTR','AI','ARM','TSM','MRVL','ALAB','VRT','DELL','SOUN','IONQ',
  'CEG','VST','EQIX','SMCI',
  'CRWD','PANW','ZS','OKTA','S','FTNT','CYBR','NET',
  'DDOG','PATH','DOCS','BILL','GTLB','DUOL','MNDY','CFLT','BRZE',
  'SHOP','ZM','SPOT','APP','TTD','PAYC','PCTY',
  'COIN','HOOD','AFRM','SOFI','UPST','DKNG','AXON','TOST',
  'RBLX','U','SNAP','PINS','ROKU',
  'HIMS','CELH','ONON','PODD','TMDX','INSP','IRTC',
  'LULU','ULTA','FIVE','SKX','BROS','CAVA','WING',
  'MELI','NU','SE','RIVN','WOLF',
  'LMT','RTX','NOC','GD','BA','HEI','TDG','LDOS','KTOS','RKLB','ACHR',
  'HON','GE','CAT',
  'V','MA','JPM','BAC','WFC','GS','MS',
  'UNH','JNJ','PFE','MRK','ABBV',
  'WMT','COST','TGT','HD','MCD','SBUX','NKE',
  'DIS','CMCSA','T','VZ',
  'XOM','CVX','COP','ENPH','SEDG','NEE','SO',
  'MARA','RIOT','CLSK',
  'SPY','QQQ','IWM','GLD','SLV',
  'BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','DOGE-USD',
  'ADA-USD','AVAX-USD','POL-USD','LINK-USD','DOT-USD','UNI-USD',
  'ZETA',
];

const ROTATION_POOL = [
  'WDAY','SNOW','MDB','NOW','HUBS','ABNB','UBER','DASH','ASTS','IOT',
  'INTU','CORZ','IREN','RXRX','CRSP','JOBY','LMND','ZI','VEEV','ESTC',
  'PYPL','SQ','TWLO','NTNX','PSTG','MPWR','AMBA','CIEN','CALX','HPE',
  'KEYS','ONTO','SWKS','QRVO','STX','WDC','KKR','APO','BX','MSCI',
  'MCO','ROP','IDXX','ALGN','DXCM','OXY','FANG','MPC','CTRA',
];

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (!auth || auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const startMs = Date.now();
  const tickers = [...new Set([...SCAN_UNIVERSE_CORE, ...ROTATION_POOL])];

  // Load learned weights (falls back to defaults if table empty/missing)
  const weights = await loadSignalWeights();

  // Pre-fetch SPY once — all ticker analyses share this
  const spyData   = await fetchYF('SPY');
  const spyCloses = spyData?.closes || null;

  const golden = [], bullpen = [];
  let idx = 0;

  async function worker() {
    while (idx < tickers.length) {
      const ticker = tickers[idx++];
      try {
        const { golden: gb, bullpen: bp } = await analyzeTickerBoth(ticker, spyCloses, weights);
        if (gb?.qualifies)  golden.push(gb);
        if (bp?.qualifies)  bullpen.push(bp);
      } catch (_) {}
    }
  }

  await Promise.all(Array.from({ length: 8 }, worker));

  const gbNew = await recordBulls(golden,  'golden_bull_hof');
  const bpNew = await recordBulls(bullpen, 'bull_pen_hof');
  const ms    = Date.now() - startMs;

  const summary = {
    scanned:     tickers.length,
    gb_found:    golden.length,  gb_new: gbNew,  gb_tickers: golden.map(b => b.ticker),
    bp_found:    bullpen.length, bp_new: bpNew,  bp_tickers: bullpen.map(b => b.ticker),
    duration_ms: ms,
    weights_used: Object.keys(weights).length,
  };

  await logScanRun(summary);

  console.log(`[scan/run] Done ${ms}ms | GB: ${golden.length} found, ${gbNew} new | BP: ${bullpen.length} found, ${bpNew} new | ${Object.keys(weights).length} learned weights active`);

  return res.status(200).json(summary);
}
