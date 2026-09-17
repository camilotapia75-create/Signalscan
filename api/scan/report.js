// 5-day autonomous report + algorithm self-improvement
// GET /api/scan/report  (Vercel cron or manual trigger)
//
// What this does automatically every 5 days:
//  1. Reads all HOF picks with known outcomes (entry price vs current price)
//  2. Computes which signals fired on winners vs losers
//  3. Updates signal_weights table — no human approval needed
//  4. Emails you a summary of what changed and why
//
// Required env vars: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
// Optional:          RESEND_API_KEY (email), REPORT_TO_EMAIL

const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://bhykfnuljzzimzmdjcia.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON    = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoeWtmbnVsanp6aW16bWRqY2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTU0NDcsImV4cCI6MjA5MzA3MTQ0N30.Bl1Bigqc6iD8Pi1OTaMPNhRnrP6l4-vzcDoAo_acOUE';
const CRON_SECRET      = process.env.CRON_SECRET;
const RESEND_KEY       = process.env.RESEND_API_KEY;
const REPORT_TO        = process.env.REPORT_TO_EMAIL || 'camilotapia75@gmail.com';
const REPORT_FROM      = process.env.REPORT_FROM_EMAIL || 'Signalscan <reports@signalscan.io>';

// Learning guardrails
const MIN_SAMPLES   = 15;     // per signal, and per comparison group
const WEIGHT_DECAY  = 0.03;   // pull toward default each cycle
const HORIZON_DAYS  = 14;     // fixed holding period for cohort scoring
const WIN_THRESHOLD = 0;      // a "win" = beat the market over the same window

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
let _crumb = '', _cookie = '', _crumbAt = 0;

// Signal defaults — same as run.js
const SIGNAL_DEFAULTS = {
  ema_full_stack:    3.0,
  ema_partial:       1.0,
  ema200_above:      2.0,
  rsi_momentum:      3.0,
  rsi_dip:           1.0,
  macd_positive:     2.0,
  extension_healthy: 2.0,
  extension_over:   -2.0,
  obv_rising:        2.0,
  volume_expanding:  1.0,
  spy_outperform:    2.0,
  spy_underperform: -1.0,
  bb_constructive:   1.0,
  bb_extended:      -1.0,
};

const SIGNAL_LABELS = {
  ema_full_stack:    'EMA Full Stack (9>21>50)',
  ema_partial:       'EMA Partial (9>21)',
  ema200_above:      'Above EMA200',
  rsi_momentum:      'RSI Momentum (48-65)',
  rsi_dip:           'RSI Dip (38-48)',
  macd_positive:     'MACD Positive',
  extension_healthy: 'Extension Healthy (≤15%)',
  extension_over:    'Overextended (>25%)',
  obv_rising:        'OBV Rising 10-day',
  volume_expanding:  'Volume Expanding',
  spy_outperform:    'Outperforming SPY',
  spy_underperform:  'Underperforming SPY',
  bb_constructive:   'BB Constructive',
  bb_extended:       'BB Overextended',
};

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

async function refreshCrumb() {
  try {
    const home = await fetch('https://finance.yahoo.com/', {
      headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(8000),
    });
    const rawCookies = home.headers.getSetCookie
      ? home.headers.getSetCookie()
      : (home.headers.get('set-cookie') || '').split(/,(?=[^ ])/);
    _cookie = rawCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
    const cr = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: _cookie }, signal: AbortSignal.timeout(5000),
    });
    const t = await cr.text();
    if (t && t.length < 20 && !t.includes('<')) { _crumb = t.trim(); _crumbAt = Date.now(); }
  } catch (_) {}
}

// A ticker's daily closes via the v8 chart endpoint — no crumb required, and it
// is not IP-blocked the way v7/quote is. Returning the whole series rather than
// just the last price costs nothing extra and is what makes benchmarking and
// fixed-horizon cohorts possible.
async function fetchOneSeries(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json   = await res.json();
    const result = json?.chart?.result?.[0];
    const rawTs  = result?.timestamp || [];
    const rawCl  = result?.indicators?.quote?.[0]?.close || [];
    const ts = [], closes = [];
    for (let i = 0; i < rawTs.length; i++) {
      if (rawCl[i] != null) { ts.push(rawTs[i]); closes.push(rawCl[i]); }
    }
    if (!closes.length) return null;
    return { ts, closes };
  } catch (_) { return null; }
}

async function fetchSeries(symbols, budgetMs = 6000) {
  const out = {};
  if (!symbols.length) return out;
  const startMs = Date.now();
  let idx = 0;
  const worker = async () => {
    while (idx < symbols.length) {
      if (Date.now() - startMs > budgetMs) return;
      const sym = symbols[idx++];
      const s = await fetchOneSeries(sym);
      if (s) out[sym] = s;
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  const got = Object.keys(out).length;
  if (got < symbols.length) {
    console.warn(`[scan/report] priced ${got}/${symbols.length} tickers (budget ${budgetMs}ms)`);
  }
  return out;
}

// Last close at or before a moment. Picks are detected intraday and markets
// close on weekends, so an exact date match would miss most of the time.
function closeAt(series, epochSec) {
  if (!series?.ts?.length) return null;
  let lo = 0, hi = series.ts.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.ts[mid] <= epochSec) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return best >= 0 ? series.closes[best] : null;
}

function lastClose(series) {
  return series?.closes?.length ? series.closes[series.closes.length - 1] : null;
}

const pctChange = (from, to) =>
  (from && to && isFinite(from) && isFinite(to)) ? (to - from) / from * 100 : null;

// ── Mock portfolio ───────────────────────────────────────────────────────────
// Replays every Golden Bull the scanner recorded as if a fixed amount had been
// invested in each and held for a fixed number of days, under real capital
// constraints. Deliberately mechanical — the published entry price, the same
// holding period on every trade, no discretion and no hindsight. That is what
// makes it comparable to putting identical cash into the S&P over identical
// days, and what would let the same rules drive real orders later.
//
// Assumptions (they flatter the result, so read it accordingly): fills at the
// recorded signal price and at the closing price on the exit date, no
// commissions, no slippage, no dividends, no taxes.

const PORTFOLIO_START = 10000;   // starting capital
const PORTFOLIO_SLOTS = 10;      // max concurrent positions -> $1,000 per trade

function simulatePortfolio(picks, series, spy) {
  const DAY = 86400;
  const positionSize = PORTFOLIO_START / PORTFOLIO_SLOTS;
  const nowSec  = Math.floor(Date.now() / 1000);
  const holdSec = HORIZON_DAYS * DAY;

  const valid = picks
    .filter(p => series[p.ticker] && parseFloat(p.signal_price) > 0 && p.detSec)
    .sort((a, b) => a.detSec - b.detSec);
  if (!valid.length) return null;

  const startDay = Math.floor(valid[0].detSec / DAY) * DAY;
  const endDay   = Math.floor(nowSec / DAY) * DAY;

  let cash = PORTFOLIO_START;
  const open = [];        // { ticker, shares, entry, exitSec }
  const closed = [];
  const curve  = [];      // daily { t, equity }
  let skipped = 0, pi = 0;

  for (let d = startDay; d <= endDay; d += DAY) {
    // Settle anything that has reached the end of its holding period
    for (let i = open.length - 1; i >= 0; i--) {
      const o  = open[i];
      if (o.exitSec > d) continue;
      const px = closeAt(series[o.ticker], o.exitSec) ?? closeAt(series[o.ticker], d) ?? o.entry;
      cash += o.shares * px;
      closed.push({ ticker: o.ticker, ret: (px - o.entry) / o.entry });
      open.splice(i, 1);
    }

    // Enter any Golden Bulls detected on this day, capital permitting
    while (pi < valid.length && valid[pi].detSec < d + DAY) {
      const p = valid[pi++];
      const entry = parseFloat(p.signal_price);
      // No free capital means the signal is genuinely missed. Taking it anyway
      // would model a portfolio with unlimited money, which is not a portfolio.
      if (cash + 1e-9 < positionSize) { skipped++; continue; }
      cash -= positionSize;
      open.push({ ticker: p.ticker, shares: positionSize / entry, entry, exitSec: p.detSec + holdSec });
    }

    // Mark open positions to that day's close
    let mv = 0;
    for (const o of open) mv += o.shares * (closeAt(series[o.ticker], d) ?? o.entry);
    curve.push({ t: d, equity: cash + mv });
  }

  const equity     = curve[curve.length - 1].equity;
  const totalEarned = equity - PORTFOLIO_START;

  // Day-over-day change in account value — what the account actually made or
  // lost each day, including open positions moving.
  const daily = [];
  for (let i = 1; i < curve.length; i++) {
    daily.push({ t: curve[i].t, pnl: curve[i].equity - curve[i - 1].equity });
  }
  // Days with no open position are flat, not losing days — counting them would
  // make an idle account look like a losing one.
  const active  = daily.filter(x => Math.abs(x.pnl) > 0.005);
  const upDays  = active.filter(x => x.pnl > 0).length;
  const sortedD = [...daily].sort((a, b) => b.pnl - a.pnl);
  const avgDaily = daily.length ? daily.reduce((a, x) => a + x.pnl, 0) / daily.length : 0;

  // Simplest honest benchmark: the same money in the index over the same span.
  const spyStart = spy ? closeAt(spy, startDay) : null;
  const spyEnd   = spy ? lastClose(spy) : null;
  const spyEquity = (spyStart && spyEnd) ? PORTFOLIO_START * (spyEnd / spyStart) : null;

  const wins   = closed.filter(t => t.ret > 0).length;
  const byRet  = [...closed].sort((a, b) => b.ret - a.ret);
  const fmtDay = t => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    start:         PORTFOLIO_START,
    equity:        parseFloat(equity.toFixed(2)),
    totalEarned:   parseFloat(totalEarned.toFixed(2)),
    totalReturn:   parseFloat((totalEarned / PORTFOLIO_START * 100).toFixed(2)),
    spyEquity:     spyEquity === null ? null : parseFloat(spyEquity.toFixed(2)),
    spyEarned:     spyEquity === null ? null : parseFloat((spyEquity - PORTFOLIO_START).toFixed(2)),
    days:          daily.length,
    avgDaily:      parseFloat(avgDaily.toFixed(2)),
    upDayRate:     active.length ? Math.round(upDays / active.length * 100) : 0,
    activeDays:    active.length,
    slots:         PORTFOLIO_SLOTS,
    bestDay:       sortedD[0] ? { date: fmtDay(sortedD[0].t), pnl: parseFloat(sortedD[0].pnl.toFixed(2)) } : null,
    worstDay:      sortedD.length ? { date: fmtDay(sortedD[sortedD.length - 1].t), pnl: parseFloat(sortedD[sortedD.length - 1].pnl.toFixed(2)) } : null,
    recentDaily:   daily.slice(-10).reverse().map(x => ({ date: fmtDay(x.t), pnl: parseFloat(x.pnl.toFixed(2)) })),
    tradesClosed:  closed.length,
    openPositions: open.length,
    skipped,
    winRate:       closed.length ? Math.round(wins / closed.length * 100) : 0,
    positionSize,
    holdDays:      HORIZON_DAYS,
    best:          byRet[0] ? { ticker: byRet[0].ticker, pct: parseFloat((byRet[0].ret * 100).toFixed(1)) } : null,
    worst:         byRet.length ? { ticker: byRet[byRet.length - 1].ticker, pct: parseFloat((byRet[byRet.length - 1].ret * 100).toFixed(1)) } : null,
  };
}

// ── Supabase reads ────────────────────────────────────────────────────────────

async function getHofRecords(days = 60) {
  const key    = SUPABASE_SERVICE || SUPABASE_ANON;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const res    = await fetch(
    `${SUPABASE_URL}/rest/v1/golden_bull_hof?select=ticker,detected_at,signal_price,conviction,signal_keys&detected_at=gte.${cutoff}&order=detected_at.asc&limit=5000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`Supabase HOF ${res.status}`);
  return res.json();
}

async function getCurrentWeights() {
  const key = SUPABASE_SERVICE || SUPABASE_ANON;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/signal_weights?select=signal_key,base_points,sample_count,win_count,avg_return`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return {};
    const rows = await res.json();
    const w = {};
    for (const r of (Array.isArray(rows) ? rows : [])) w[r.signal_key] = r;
    return w;
  } catch (_) { return {}; }
}

async function getScanLogs(days = 6) {
  const key    = SUPABASE_SERVICE || SUPABASE_ANON;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_run_log?select=ran_at,tickers_scanned,gb_found,gb_new,gb_tickers&ran_at=gte.${cutoff}&order=ran_at.desc&limit=10`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) }
    );
    return res.ok ? (await res.json()) : [];
  } catch (_) { return []; }
}

// ── Autonomous weight update — core of the feedback loop ─────────────────────

async function analyzeAndUpdateWeights(hofWithOutcomes, currentWeights) {
  // Only use records where:
  //   a) signal_keys are recorded (new-style entries from updated scanner)
  //   b) outcome is known (price fetched successfully)
  //   c) pick is at least 7 days old (give it time to move)
  // Outcome used for learning is the fixed-horizon, market-adjusted result:
  // what the pick did over its first HORIZON_DAYS relative to SPY over exactly
  // the same days. Raw mark-to-market would let a rising or falling market move
  // every weight at once, and would score old and new picks over different
  // lengths of time.
  const eligible = hofWithOutcomes
    .filter(r => Array.isArray(r.signal_keys) && r.signal_keys.length > 0 && r.maturedAlpha != null)
    .map(r => ({ ...r, outcome: r.maturedAlpha }));

  if (eligible.length < MIN_SAMPLES * 2) {
    console.log(`[scan/report] Only ${eligible.length} matured outcomes (need ${MIN_SAMPLES * 2}+) — skipping weight update`);
    return { changes: [], eligibleCount: eligible.length, skipped: 'not enough matured outcomes' };
  }

  console.log(`[scan/report] Running weight analysis on ${eligible.length} outcomes`);

  // Aggregate: for each signal key, collect win/loss stats
  const stats = {};
  for (const record of eligible) {
    for (const key of record.signal_keys) {
      if (!stats[key]) stats[key] = { wins: 0, losses: 0, totalReturn: 0, count: 0, returns: [] };
      stats[key].count++;
      stats[key].totalReturn += record.outcome;
      stats[key].returns.push(record.outcome);
      if (record.outcome >  WIN_THRESHOLD) stats[key].wins++;
      if (record.outcome < -WIN_THRESHOLD) stats[key].losses++;
    }
  }

  const changes  = [];
  const upserts  = [];

  // Baselines across every eligible pick, used to measure a signal against the
  // picks it did NOT fire on. Judging a signal on its own absolute return just
  // tracks the market: in a good month every signal looks brilliant and every
  // weight inflates, including signals that fire on everything and predict
  // nothing. Edge over the rest of the field is what actually carries
  // information, so that is what drives the weights.
  const totalAll = eligible.reduce((a, r) => a + r.outcome, 0);
  const winsAll  = eligible.filter(r => r.outcome > WIN_THRESHOLD).length;
  const countAll = eligible.length;

  for (const [key, s] of Object.entries(stats)) {
    // 15, not 5. At single-digit sample counts the edge estimate is mostly
    // noise, and a weight nudged every 5 days by noise random-walks away from
    // its default instead of converging on anything.
    if (s.count < MIN_SAMPLES) continue;

    const current     = currentWeights[key];
    const currentPts  = current?.base_points !== undefined
      ? parseFloat(current.base_points)
      : (SIGNAL_DEFAULTS[key] ?? 1);

    const winRate   = s.wins / s.count;
    const avgReturn = s.totalReturn / s.count;

    // Comparison group: eligible picks where this signal did NOT fire.
    const outCount = countAll - s.count;
    let effectiveness = 0, edge = 0, winEdge = 0, significant = false;
    if (outCount >= MIN_SAMPLES) {
      const outReturns = [];
      for (const r of eligible) if (!r.signal_keys.includes(key)) outReturns.push(r.outcome);
      const outAvg     = outReturns.reduce((a, b) => a + b, 0) / outCount;
      const outWinRate = (winsAll - s.wins) / outCount;
      edge    = avgReturn - outAvg;   // percentage points of outperformance
      winEdge = winRate - outWinRate;

      // Is that edge bigger than the spread in the data would produce by chance?
      // Standard error of the difference between two means; require the edge to
      // clear it before moving any weight.
      const variance = arr => {
        if (arr.length < 2) return 0;
        const m = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1);
      };
      const se = Math.sqrt(variance(s.returns) / s.count + variance(outReturns) / outCount);
      significant = se > 0 ? Math.abs(edge) >= se : false;
      if (significant) effectiveness = winEdge * 1.5 + (edge / 25);
    }
    // Too few picks without the signal means it fired on nearly everything, so
    // there is nothing to compare against — leave its weight alone.

    // Conservative learning rate (8%), scales with evidence strength (caps at 30 samples)
    const evidenceStrength = Math.min(1.0, s.count / 30);
    const adjustment = 0.08 * effectiveness * evidenceStrength * Math.abs(currentPts || 1);

    // Pull gently back toward the default every cycle. A signal that keeps
    // earning real edge easily out-earns this; drift that was never justified
    // decays away instead of compounding forever.
    const defPts  = SIGNAL_DEFAULTS[key] ?? 1;
    const decayed = currentPts + (defPts - currentPts) * WEIGHT_DECAY;

    const rawNew    = decayed + adjustment;
    const defAbs    = Math.abs(defPts || 1);
    // Clamp: signals can move at most 2.5× their default magnitude in either direction
    const newPts    = Math.max(-defAbs * 2.5, Math.min(defAbs * 2.5, rawNew));

    const delta = newPts - currentPts;
    if (Math.abs(delta) > 0.005) {
      changes.push({
        key,
        label:     SIGNAL_LABELS[key] || key,
        from:      parseFloat(currentPts.toFixed(2)),
        to:        parseFloat(newPts.toFixed(2)),
        delta:     parseFloat(delta.toFixed(2)),
        winRate:   Math.round(winRate * 100),
        avgReturn: parseFloat(avgReturn.toFixed(1)),
        edge:      parseFloat(edge.toFixed(1)),
        significant,
        count:     s.count,
        direction: delta > 0 ? 'up' : 'down',
      });
    }

    upserts.push({
      signal_key:   key,
      base_points:  parseFloat(newPts.toFixed(4)),
      sample_count: s.count,
      win_count:    s.wins,
      avg_return:   parseFloat(avgReturn.toFixed(2)),
      updated_at:   new Date().toISOString(),
    });
  }

  // Write updated weights to Supabase — no human in the loop
  if (upserts.length && SUPABASE_SERVICE) {
    try {
      const writeRes = await fetch(`${SUPABASE_URL}/rest/v1/signal_weights`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE, Authorization: `Bearer ${SUPABASE_SERVICE}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(upserts),
      });
      if (!writeRes.ok) {
        console.error('[scan/report] weight write failed:', await writeRes.text());
      } else {
        console.log(`[scan/report] Updated ${upserts.length} signal weights automatically`);
      }
    } catch (e) {
      console.error('[scan/report] weight write error:', e.message);
    }
  }

  return { changes, eligibleCount: eligible.length, signalsAnalyzed: Object.keys(stats).length };
}

// ── Email ─────────────────────────────────────────────────────────────────────

function buildEmail(perfStats, weightResult, scanLogs) {
  const { totalTracked, withPrice, winRate, avgReturn, topGainers, bestTicker, worstTicker,
          avgAlpha = 0, beatSpyRate = 0, avgSpy = 0, cohorts = [], control = null, maturedCount = 0,
          portfolio = null } = perfStats;
  const { changes, eligibleCount, signalsAnalyzed } = weightResult;
  const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const changedRows = changes.length
    ? changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8).map(c => {
        const arrow = c.direction === 'up' ? '↑' : '↓';
        const col   = c.direction === 'up' ? '#00ff88' : '#ff4d4d';
        return `<tr>
          <td style="padding:4px 8px;">${c.label}</td>
          <td style="padding:4px 8px;color:#aaa;">${c.from}</td>
          <td style="padding:4px 8px;font-weight:700;color:${col};">${c.to} ${arrow}</td>
          <td style="padding:4px 8px;">${c.winRate}%</td>
          <td style="padding:4px 8px;font-weight:700;color:${c.edge >= 0 ? '#00ff88' : '#ff4d4d'};">${c.edge >= 0 ? '+' : ''}${c.edge}pp</td>
          <td style="padding:4px 8px;color:#666;">${c.count}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6" style="padding:8px;color:#555;">No weights moved this cycle. ${weightResult.skipped
         ? 'Not enough matured outcomes yet (' + eligibleCount + ' of ' + (MIN_SAMPLES * 2) + ' needed).'
         : 'No signal showed an edge large enough to separate it from chance — holding steady is the correct result, not a failure.'}</td></tr>`;

  const topRows = topGainers.slice(0, 8).map(t => {
    const color = t.pct >= 0 ? '#00ff88' : '#ff4d4d';
    return `<tr>
      <td style="padding:4px 8px;color:#00ff88;font-weight:600;">${t.ticker}</td>
      <td style="padding:4px 8px;color:#aaa;">${new Date(t.detected_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
      <td style="padding:4px 8px;">$${parseFloat(t.signal_price).toFixed(2)}</td>
      <td style="padding:4px 8px;font-weight:700;color:${color};">${t.pct >= 0 ? '+' : ''}${t.pct.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  const money = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const portfolioBlock = portfolio ? `
    <div style="background:#0b1410;border:1px solid ${portfolio.totalEarned >= 0 ? '#1d4f33' : '#4f1d1d'};padding:16px;margin-bottom:20px;">
      <div style="font-size:8px;color:#666;letter-spacing:2px;margin-bottom:10px;">💼 MOCK PORTFOLIO — ${money(portfolio.start)} FOLLOWING EVERY GOLDEN BULL</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div>
          <div style="font-size:26px;font-weight:700;color:${portfolio.totalEarned >= 0 ? '#00ff88' : '#ff4d4d'};">${portfolio.totalEarned >= 0 ? '+' : ''}${money(portfolio.totalEarned)}</div>
          <div style="font-size:8px;color:#666;letter-spacing:1px;">TOTAL EARNED · ${portfolio.totalReturn >= 0 ? '+' : ''}${portfolio.totalReturn}%</div>
        </div>
        <div>
          <div style="font-size:26px;font-weight:700;color:${portfolio.avgDaily >= 0 ? '#00ff88' : '#ff4d4d'};">${portfolio.avgDaily >= 0 ? '+' : ''}${money(portfolio.avgDaily)}</div>
          <div style="font-size:8px;color:#666;letter-spacing:1px;">AVERAGE PER DAY · ${portfolio.days} DAYS</div>
        </div>
      </div>
      <div style="font-size:10px;color:#888;line-height:1.8;border-top:1px solid #1a1a1a;padding-top:10px;">
        Account value <strong style="color:#e0e0e0;">${money(portfolio.equity)}</strong>
        ${portfolio.spyEquity !== null ? `· same money in the S&amp;P would be <strong style="color:#e0e0e0;">${money(portfolio.spyEquity)}</strong>` : ''}<br>
        ${portfolio.tradesClosed} trades closed · ${portfolio.openPositions} open · ${portfolio.winRate}% profitable · ${portfolio.upDayRate}% of ${portfolio.activeDays} active days up
        ${portfolio.skipped ? `· ${portfolio.skipped} signals skipped (no free capital)` : ''}<br>
        ${portfolio.best ? `Best ${portfolio.best.ticker} ${portfolio.best.pct >= 0 ? '+' : ''}${portfolio.best.pct}%` : ''}
        ${portfolio.worst ? `· Worst ${portfolio.worst.ticker} ${portfolio.worst.pct >= 0 ? '+' : ''}${portfolio.worst.pct}%` : ''}
      </div>
      <div style="font-size:8px;color:#666;letter-spacing:1px;margin:12px 0 4px;">LAST 10 DAYS</div>
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        ${portfolio.recentDaily.map(d => `<tr>
          <td style="padding:2px 6px;color:#888;">${d.date}</td>
          <td style="padding:2px 6px;text-align:right;font-weight:700;color:${d.pnl >= 0 ? '#00ff88' : '#ff4d4d'};">${d.pnl >= 0 ? '+' : ''}${money(d.pnl)}</td>
        </tr>`).join('')}
      </table>
      <div style="font-size:9px;color:#555;line-height:1.6;margin-top:10px;">
        Simulation only. ${money(portfolio.positionSize)} per pick, ${portfolio.slots || PORTFOLIO_SLOTS} positions max, held ${portfolio.holdDays} days,
        filled at the published signal price and the closing price on exit. No commissions, slippage,
        dividends or taxes — real trading would return less.
      </div>
    </div>` : '';

  const cohortRows = cohorts.length
    ? cohorts.map(c => {
        const rc = c.avgPct >= 0 ? '#00ff88' : '#ff4d4d';
        const ac = c.avgAlpha === null ? '#666' : (c.avgAlpha >= 0 ? '#00ff88' : '#ff4d4d');
        return `<tr>
          <td style="padding:4px 8px;color:#aaa;">${c.label}</td>
          <td style="padding:4px 8px;color:#666;">${c.n}</td>
          <td style="padding:4px 8px;">${c.winRate}%</td>
          <td style="padding:4px 8px;font-weight:700;color:${rc};">${c.avgPct >= 0 ? '+' : ''}${c.avgPct}%</td>
          <td style="padding:4px 8px;font-weight:700;color:${ac};">${c.avgAlpha === null ? '—' : (c.avgAlpha >= 0 ? '+' : '') + c.avgAlpha + '%'}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="padding:8px;color:#555;">No picks have reached the ${HORIZON_DAYS}-day mark yet — first cohort lands soon</td></tr>`;

  const controlBlock = control
    ? `<div style="color:${control.better ? '#00ff88' : '#ff9055'};font-weight:700;margin-bottom:4px;">
         ${!control.diverged ? '· No divergence yet' : (control.better ? '✓ Tuning is helping' : '⚠ Tuning is not helping yet')}
       </div>
       <div style="color:#888;">
         ${!control.diverged ? 'The learned weights still match the defaults exactly, so both rank the picks the same way. ' : ''}Ranking the same ${control.n} picks by the learned weights puts
         <strong style="color:#e0e0e0;">${control.learnedTop >= 0 ? '+' : ''}${control.learnedTop}%</strong>
         vs-market in the top half, against
         <strong style="color:#e0e0e0;">${control.defaultTop >= 0 ? '+' : ''}${control.defaultTop}%</strong>
         for the original untuned weights.
       </div>`
    : '<div style="color:#555;">Not enough scored picks yet to compare learned weights against the defaults.</div>';

  const scanRows = scanLogs.slice(0, 5).map(l => {
    const ts = l.gb_tickers || [];
    return `<tr>
      <td style="padding:4px 8px;color:#aaa;">${new Date(l.ran_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
      <td style="padding:4px 8px;">${l.gb_found ?? '—'}</td>
      <td style="padding:4px 8px;color:#00ff88;">${l.gb_new ?? '—'}</td>
      <td style="padding:4px 8px;font-size:10px;color:#888;">${ts.slice(0,5).join(', ')}${ts.length > 5 ? `+${ts.length - 5}` : ''}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0a0a0a;color:#e0e0e0;font-family:'Courier New',monospace;margin:0;padding:0;">
<div style="max-width:620px;margin:0 auto;padding:24px;">

  <div style="border-bottom:1px solid #222;padding-bottom:16px;margin-bottom:24px;">
    <div style="font-size:9px;color:#555;letter-spacing:2px;">SIGNALSCAN · AUTONOMOUS REPORT</div>
    <div style="font-size:20px;font-weight:700;color:#00ff88;margin-top:4px;">📊 5-DAY SYSTEM UPDATE</div>
    <div style="font-size:10px;color:#666;margin-top:4px;">${reportDate} · Algorithm self-adjusted based on ${eligibleCount} tracked outcomes</div>
  </div>

  ${portfolioBlock}

  <!-- Benchmark first: the only number that separates skill from market drift -->
  <div style="background:#0d1a12;border:1px solid ${avgAlpha >= 0 ? '#1d4f33' : '#4f1d1d'};padding:14px;margin-bottom:12px;text-align:center;">
    <div style="font-size:28px;font-weight:700;color:${avgAlpha >= 0 ? '#00ff88' : '#ff4d4d'};">${avgAlpha >= 0 ? '+' : ''}${avgAlpha.toFixed(2)}%</div>
    <div style="font-size:9px;color:#888;letter-spacing:1px;margin-top:4px;">VS S&amp;P 500 OVER THE SAME DAYS</div>
    <div style="font-size:10px;color:#666;margin-top:6px;">
      picks ${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(1)}% · market ${avgSpy >= 0 ? '+' : ''}${avgSpy.toFixed(1)}% · ${beatSpyRate}% of picks beat it
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px;">
    <div style="background:#111;border:1px solid #1a1a1a;padding:12px;text-align:center;">
      <div style="font-size:20px;font-weight:700;color:#00ff88;">${winRate}%</div>
      <div style="font-size:8px;color:#555;letter-spacing:1px;margin-top:2px;">ABOVE ENTRY</div>
    </div>
    <div style="background:#111;border:1px solid #1a1a1a;padding:12px;text-align:center;">
      <div style="font-size:20px;font-weight:700;color:${avgReturn >= 0 ? '#00ff88' : '#ff4d4d'};">${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(1)}%</div>
      <div style="font-size:8px;color:#555;letter-spacing:1px;margin-top:2px;">AVG RETURN</div>
    </div>
    <div style="background:#111;border:1px solid #1a1a1a;padding:12px;text-align:center;">
      <div style="font-size:20px;font-weight:700;color:#ffcc44;">${totalTracked}</div>
      <div style="font-size:8px;color:#555;letter-spacing:1px;margin-top:2px;">TRACKED</div>
    </div>
  </div>

  <div style="font-size:9px;color:#555;line-height:1.6;margin-bottom:22px;padding:8px 10px;background:#0d0d0d;border-left:2px solid #222;">
    ABOVE ENTRY and AVG RETURN mark every pick from the last 60 days to today, so they move with the
    market and lag any algorithm change by weeks. Judge the system on VS S&amp;P 500 and on the cohort
    table below, which score every pick over the same ${HORIZON_DAYS}-day window.
  </div>

  <!-- Algorithm weight changes -->
  <div style="font-size:8px;color:#555;letter-spacing:1px;margin-bottom:6px;">⚙️ ALGORITHM WEIGHT CHANGES (AUTO-APPLIED)</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:10px;">
    <tr style="border-bottom:1px solid #1a1a1a;">
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;letter-spacing:1px;">SIGNAL</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">OLD PTS</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">NEW PTS</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">WIN%</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">EDGE</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">N</th>
    </tr>
    ${changedRows}
  </table>

  <!-- Fixed-horizon cohorts: the series that actually shows learning -->
  <div style="font-size:8px;color:#555;letter-spacing:1px;margin-bottom:6px;">📈 ${HORIZON_DAYS}-DAY OUTCOME BY WHEN THE PICK WAS MADE</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;font-size:10px;">
    <tr style="border-bottom:1px solid #1a1a1a;">
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;letter-spacing:1px;">PICKED</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">N</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">WIN%</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">AVG ${HORIZON_DAYS}D</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">VS SPY</th>
    </tr>
    ${cohortRows}
  </table>
  <div style="font-size:9px;color:#555;margin-bottom:24px;">
    Newest cohort first. Every row is measured the same way, so this is the honest
    like-for-like trend — rising VS SPY means the algorithm is genuinely improving.
  </div>

  <!-- Control arm -->
  <div style="font-size:8px;color:#555;letter-spacing:1px;margin-bottom:6px;">🧪 LEARNED WEIGHTS vs UNTOUCHED DEFAULTS</div>
  <div style="background:#111;border:1px solid #1a1a1a;padding:12px;margin-bottom:24px;font-size:10px;line-height:1.7;">
    ${controlBlock}
  </div>

  <!-- Top performers -->
  <div style="font-size:8px;color:#555;letter-spacing:1px;margin-bottom:6px;">🏆 TOP PERFORMERS</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:10px;">
    <tr style="border-bottom:1px solid #1a1a1a;">
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">TICKER</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">DETECTED</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">ENTRY</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">RETURN</th>
    </tr>
    ${topRows || '<tr><td colspan="4" style="padding:8px;color:#555;font-size:9px;">No data yet</td></tr>'}
  </table>

  <!-- Recent scan runs -->
  ${scanRows ? `
  <div style="font-size:8px;color:#555;letter-spacing:1px;margin-bottom:6px;">🔍 RECENT SCANS</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:10px;">
    <tr style="border-bottom:1px solid #1a1a1a;">
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">DATE</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">FOUND</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">NEW</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">TICKERS</th>
    </tr>
    ${scanRows}
  </table>` : ''}

  ${bestTicker  ? `<div style="font-size:9px;color:#aaa;margin-bottom:3px;">BEST: <span style="color:#00ff88;font-weight:700;">${bestTicker.ticker}</span> → <span style="color:#00ff88;">+${bestTicker.pct.toFixed(1)}%</span></div>` : ''}
  ${worstTicker ? `<div style="font-size:9px;color:#aaa;margin-bottom:16px;">WORST: <span style="color:#ff4d4d;">${worstTicker.ticker}</span> → <span style="color:#ff4d4d;">${worstTicker.pct.toFixed(1)}%</span></div>` : ''}

  <div style="border-top:1px solid #1a1a1a;padding-top:14px;font-size:8px;color:#333;letter-spacing:1px;">
    SYSTEM SCANS DAILY 9AM EST · SELF-ADJUSTS EVERY 5 DAYS · NO HUMAN INPUT REQUIRED<br>
    ${changes.length} WEIGHTS UPDATED · ${signalsAnalyzed || 0} SIGNALS ANALYZED
  </div>
</div>
</body>
</html>`;
}

async function postEmail(from, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from, to: [REPORT_TO], subject, html }),
    signal: AbortSignal.timeout(10000),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

async function sendEmail(subject, html) {
  if (!RESEND_KEY) {
    console.error('[scan/report] RESEND_API_KEY is not set — no report can be delivered. Add it in Vercel project settings.');
    return false;
  }
  // Sending from a custom domain requires that domain to be verified in Resend.
  // If it is not, fall back to Resend's shared sender, which always delivers to
  // the account owner — better a report from an odd address than silence.
  const primary  = REPORT_FROM;
  const fallback = 'Signalscan <onboarding@resend.dev>';
  try {
    let { ok, data } = await postEmail(primary, subject, html);
    if (!ok && primary !== fallback) {
      console.error(`[scan/report] Resend rejected sender ${primary}:`, data,
        '— retrying with onboarding@resend.dev. Verify signalscan.io in Resend to use your own domain.');
      ({ ok, data } = await postEmail(fallback, subject, html));
    }
    if (!ok) { console.error('[scan/report] Resend:', data); return false; }
    console.log('[scan/report] Email sent:', data.id);
    return true;
  } catch (e) {
    console.error('[scan/report] sendEmail:', e.message);
    return false;
  }
}

// Plain-language alert used when the pipeline has nothing to report, so a
// broken link in the chain is never indistinguishable from silence.
function buildAlertEmail(diag, note) {
  const row = (k, ok, detail) =>
    `<tr><td style="padding:6px 10px;">${ok ? '✅' : '❌'}</td>
         <td style="padding:6px 10px;font-family:monospace;">${k}</td>
         <td style="padding:6px 10px;color:#666;">${detail}</td></tr>`;
  return `<div style="font-family:system-ui,sans-serif;max-width:640px;">
    <h2 style="color:#b45309;">⚠ Signalscan — self-improvement pipeline needs attention</h2>
    <p style="color:#444;line-height:1.6;">${note}</p>
    <table style="border-collapse:collapse;font-size:14px;margin:16px 0;">
      ${row('SUPABASE_SERVICE_ROLE_KEY', diag.hasServiceKey, diag.hasServiceKey ? 'set — scans can be saved' : 'MISSING — the daily scan cannot write results')}
      ${row('RESEND_API_KEY',            diag.hasResendKey,  'email delivery')}
      ${row('HOF records (60d)',         diag.hofRecords > 0, `${diag.hofRecords} found`)}
      ${row('Scan runs logged (6d)',     diag.scanRuns  > 0, `${diag.scanRuns} runs — daily cron ${diag.scanRuns ? 'is firing' : 'may not be firing or is timing out'}`)}
      ${row('Records ready to learn from', diag.eligible >= 5, `${diag.eligible} of 5 needed (must be 7+ days old with signals recorded)`)}
    </table>
    <p style="color:#666;font-size:13px;line-height:1.6;">
      Weight tuning begins automatically once 5 picks are at least 7 days old.
      Until then this alert confirms the report job itself is alive and running on schedule.
    </p>
  </div>`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);

export default async function handler(req, res) {
  // Never let an edge or browser cache serve a stale run of this job.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  if (CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (!auth || auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  try {
    // Fetch everything in parallel
    const [records, currentWeights, scanLogs] = await Promise.all([
      getHofRecords(60),
      getCurrentWeights(),
      getScanLogs(6),
    ]);

    if (!records?.length) {
      // Previously this returned silently, which is why a broken upstream step
      // looked exactly like "nothing interesting happened". Always report.
      const diag = {
        hasServiceKey: !!SUPABASE_SERVICE,
        hasResendKey:  !!RESEND_KEY,
        hofRecords:    0,
        scanRuns:      scanLogs?.length || 0,
        eligible:      0,
      };
      const note = !SUPABASE_SERVICE
        ? 'The daily scanner has no Supabase service-role key, so nothing it finds is being saved. Nothing can be learned until that is set.'
        : (scanLogs?.length
            ? 'The daily scan is running, but no Golden Bull picks have been recorded in the last 60 days. Either the market gave none, or the scan is being cut short before it can save.'
            : 'No scan runs have been logged in the last 6 days — the daily cron is either not firing or timing out before it finishes.');
      console.warn('[scan/report] No HOF records —', note);
      const sent = await sendEmail('Signalscan — pipeline needs attention (no picks recorded)', buildAlertEmail(diag, note));
      return res.status(200).json({ build: BUILD, message: 'No HOF records yet', note, diagnostics: diag, sent });
    }

    // Deduplicate to first detection per ticker (entry price = oldest record)
    const byTicker = new Map();
    for (const r of records) {
      if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, r);
    }
    const unique = [...byTicker.values()];

    // One series per ticker, plus SPY as the benchmark
    const symbols = unique.map(r => r.ticker);
    const series  = await fetchSeries([...new Set([...symbols, 'SPY'])]);
    const spy     = series['SPY'] || null;
    const spyNow  = lastClose(spy);

    const nowSec    = Math.floor(Date.now() / 1000);
    const horizonSec = HORIZON_DAYS * 86400;

    const withPct = unique.map(r => {
      const s     = series[r.ticker];
      const entry = parseFloat(r.signal_price);
      const detSec = Math.floor(new Date(r.detected_at).getTime() / 1000);
      const cur   = lastClose(s);
      const pct   = pctChange(entry, cur);

      // Market over the identical window. Without this a falling win rate is
      // indistinguishable from a falling market.
      const spyThen = spy ? closeAt(spy, detSec) : null;
      const spyPct  = pctChange(spyThen, spyNow);
      const alpha   = (pct != null && spyPct != null) ? pct - spyPct : null;

      // Fixed-horizon outcome: what this pick did in its first HORIZON_DAYS,
      // regardless of when it was picked. Marking everything to today instead
      // means old and new picks are scored over different lengths of time and
      // no two reports are comparable.
      let maturedPct = null, maturedAlpha = null;
      if (nowSec - detSec >= horizonSec) {
        const atH    = closeAt(s, detSec + horizonSec);
        maturedPct   = pctChange(entry, atH);
        const spyAtH = spy ? closeAt(spy, detSec + horizonSec) : null;
        const spyH   = pctChange(spyThen, spyAtH);
        if (maturedPct != null && spyH != null) maturedAlpha = maturedPct - spyH;
      }

      return { ...r, currentPrice: cur, pct, spyPct, alpha, maturedPct, maturedAlpha, detSec };
    });

    // ── Auto-update signal weights ───────────────────────────────────────────
    // This runs automatically, no human step needed
    const weightResult = await analyzeAndUpdateWeights(withPct, currentWeights);

    // ── Compute performance stats ─────────────────────────────────────────────
    const withKnownPct = withPct.filter(r => r.pct !== null);
    const winners      = withKnownPct.filter(r => r.pct >= 0);
    const winRate      = withKnownPct.length ? Math.round(winners.length / withKnownPct.length * 100) : 0;
    const avgReturn    = withKnownPct.length
      ? withKnownPct.reduce((s, r) => s + r.pct, 0) / withKnownPct.length : 0;
    const topGainers   = [...withKnownPct].sort((a, b) => b.pct - a.pct);

    // Benchmark: are the picks beating the market they were picked in?
    const withAlpha   = withKnownPct.filter(r => r.alpha !== null);
    const avgAlpha    = withAlpha.length
      ? withAlpha.reduce((s, r) => s + r.alpha, 0) / withAlpha.length : 0;
    const beatSpyRate = withAlpha.length
      ? Math.round(withAlpha.filter(r => r.alpha > 0).length / withAlpha.length * 100) : 0;
    const avgSpy      = withAlpha.length
      ? withAlpha.reduce((s, r) => s + r.spyPct, 0) / withAlpha.length : 0;

    // Cohorts: picks bucketed by when they were made, each scored over the same
    // fixed holding period. This is the series that actually shows whether the
    // algorithm is improving, because every bucket is measured the same way.
    const BUCKET_DAYS = 10;
    const matured  = withPct.filter(r => r.maturedPct !== null);
    const buckets  = new Map();
    for (const r of matured) {
      const ageDays = Math.floor((nowSec - r.detSec) / 86400);
      const b = Math.floor(ageDays / BUCKET_DAYS);
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b).push(r);
    }
    const cohorts = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, rows]) => rows.length >= 3)
      .slice(0, 5)
      .map(([b, rows]) => {
        const avg   = rows.reduce((s, r) => s + r.maturedPct, 0) / rows.length;
        const withA = rows.filter(r => r.maturedAlpha !== null);
        const alpha = withA.length ? withA.reduce((s, r) => s + r.maturedAlpha, 0) / withA.length : null;
        return {
          label:   `${b * BUCKET_DAYS}-${(b + 1) * BUCKET_DAYS}d ago`,
          n:       rows.length,
          winRate: Math.round(rows.filter(r => r.maturedPct > 0).length / rows.length * 100),
          avgPct:  parseFloat(avg.toFixed(2)),
          avgAlpha: alpha === null ? null : parseFloat(alpha.toFixed(2)),
        };
      });

    // Control: do the learned weights rank picks better than the untouched
    // defaults would have? Same picks, two scorings, compare the top half.
    const learnedMap = {};
    for (const k of Object.keys(SIGNAL_DEFAULTS)) {
      const v = currentWeights[k]?.base_points;
      learnedMap[k] = v !== undefined ? parseFloat(v) : SIGNAL_DEFAULTS[k];
    }
    const scoreBy = (keys, map) => (keys || []).reduce((s, k) => s + (map[k] ?? 0), 0);
    const ctrlPool = withPct.filter(r => Array.isArray(r.signal_keys) && r.signal_keys.length && r.alpha !== null);
    let control = null;
    if (ctrlPool.length >= 10) {
      const half = Math.max(1, Math.floor(ctrlPool.length / 2));
      const topAvg = (map) => {
        const ranked = [...ctrlPool].sort((a, b) => scoreBy(b.signal_keys, map) - scoreBy(a.signal_keys, map));
        const top = ranked.slice(0, half);
        return top.reduce((s, r) => s + r.alpha, 0) / top.length;
      };
      const learnedTop = topAvg(learnedMap);
      const defaultTop = topAvg(SIGNAL_DEFAULTS);
      // Before any weight has moved the two scorings are the same function, so
      // they rank identically. Say that, rather than reporting "not helping".
      const diverged = Object.keys(SIGNAL_DEFAULTS)
        .some(k => Math.abs(learnedMap[k] - SIGNAL_DEFAULTS[k]) > 0.001);
      control = {
        n:          ctrlPool.length,
        learnedTop: parseFloat(learnedTop.toFixed(2)),
        defaultTop: parseFloat(defaultTop.toFixed(2)),
        diverged,
        better:     diverged && learnedTop > defaultTop,
      };
    }

    // Mock portfolio replayed over the real pick history
    const portfolio = simulatePortfolio(withPct, series, spy);

    const perfStats = {
      portfolio,
      totalTracked: unique.length,
      withPrice:    withKnownPct.length,
      winRate, avgReturn, topGainers,
      avgAlpha, beatSpyRate, avgSpy,
      cohorts, control,
      maturedCount: matured.length,
      bestTicker:  topGainers[0]  || null,
      worstTicker: topGainers[topGainers.length - 1] || null,
    };

    // ── Send email ────────────────────────────────────────────────────────────
    const date    = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const subject = `Signalscan ${date} — ${avgAlpha >= 0 ? '+' : ''}${avgAlpha.toFixed(1)}% vs S&P · ${weightResult.changes.length} signals adjusted`;
    const html    = buildEmail(perfStats, weightResult, scanLogs);
    const sent    = await sendEmail(subject, html);

    return res.status(200).json({
      build:            BUILD,
      message:          sent
        ? `Report complete — ${weightResult.changes.length} weights auto-updated, email sent`
        : `Report complete — ${weightResult.changes.length} weights auto-updated, but EMAIL FAILED (check RESEND_API_KEY and sender domain)`,
      sent,
      diagnostics: {
        hasServiceKey: !!SUPABASE_SERVICE,
        hasResendKey:  !!RESEND_KEY,
        hofRecords:    unique.length,
        scanRuns:      scanLogs?.length || 0,
        eligible:      weightResult.eligibleCount,
      },
      winRate,
      avgReturn:        parseFloat(avgReturn.toFixed(2)),
      vsMarket:         parseFloat(avgAlpha.toFixed(2)),
      marketReturn:     parseFloat(avgSpy.toFixed(2)),
      beatMarketRate:   beatSpyRate,
      cohorts,
      control,
      portfolio,
      maturedOutcomes:  matured.length,
      totalTracked:     unique.length,
      eligibleOutcomes: weightResult.eligibleCount,
      weightsUpdated:   weightResult.changes.length,
      changes:          weightResult.changes,
    });
  } catch (e) {
    // A crash here (bad Supabase read, missing column, RLS block) used to end in
    // a 500 nobody would ever see. Report it the same way as any other outcome.
    console.error('[scan/report] error:', e.message);
    const sent = await sendEmail(
      'Signalscan — report job FAILED',
      buildAlertEmail(
        { hasServiceKey: !!SUPABASE_SERVICE, hasResendKey: !!RESEND_KEY,
          hofRecords: 0, scanRuns: 0, eligible: 0 },
        `The report job threw an error and could not complete: <code>${e.message}</code>`
      )
    ).catch(() => false);
    return res.status(500).json({ build: BUILD, error: e.message, sent });
  }
}
