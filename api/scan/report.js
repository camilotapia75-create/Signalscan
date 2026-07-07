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

async function fetchCurrentPrices(symbols) {
  if (!symbols.length) return {};
  if (!_crumb || Date.now() - _crumbAt > 4 * 60 * 1000) await refreshCrumb();
  // Yahoo quote API handles ~100 symbols at once — batch if larger
  const batches = [];
  for (let i = 0; i < symbols.length; i += 80) batches.push(symbols.slice(i, i + 80));
  const prices = {};
  for (const batch of batches) {
    try {
      const crumbParam = _crumb ? `&crumb=${encodeURIComponent(_crumb)}` : '';
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch.join(',')}&fields=regularMarketPrice${crumbParam}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://finance.yahoo.com/', ...(_cookie ? { Cookie: _cookie } : {}) },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const json   = await res.json();
      const quotes = json.quoteResponse?.result || [];
      for (const q of quotes) {
        if (q.symbol && q.regularMarketPrice) prices[q.symbol] = q.regularMarketPrice;
      }
    } catch (_) {}
  }
  return prices;
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
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const eligible = hofWithOutcomes.filter(r =>
    Array.isArray(r.signal_keys) && r.signal_keys.length > 0 &&
    r.pct !== null && r.pct !== undefined &&
    new Date(r.detected_at).getTime() < sevenDaysAgo
  );

  if (eligible.length < 5) {
    console.log(`[scan/report] Only ${eligible.length} eligible records for weight update (need 5+) — skipping`);
    return { changes: [], eligibleCount: eligible.length };
  }

  console.log(`[scan/report] Running weight analysis on ${eligible.length} outcomes`);

  // Aggregate: for each signal key, collect win/loss stats
  const stats = {};
  for (const record of eligible) {
    for (const key of record.signal_keys) {
      if (!stats[key]) stats[key] = { wins: 0, losses: 0, totalReturn: 0, count: 0, returns: [] };
      stats[key].count++;
      stats[key].totalReturn += record.pct;
      stats[key].returns.push(record.pct);
      if (record.pct >= 5)  stats[key].wins++;
      if (record.pct <= -5) stats[key].losses++;
    }
  }

  const changes  = [];
  const upserts  = [];

  for (const [key, s] of Object.entries(stats)) {
    if (s.count < 5) continue; // need min 5 data points per signal

    const current     = currentWeights[key];
    const currentPts  = current?.base_points !== undefined
      ? parseFloat(current.base_points)
      : (SIGNAL_DEFAULTS[key] ?? 1);

    const winRate   = s.wins / s.count;
    const avgReturn = s.totalReturn / s.count;

    // Effectiveness score: win rate above 50% = positive, avg return above 0 = positive
    // Range roughly -2 to +2; positive means signal is good predictor
    const effectiveness = (winRate - 0.5) * 1.5 + (avgReturn / 25);

    // Conservative learning rate (8%), scales with evidence strength (caps at 20 samples)
    const evidenceStrength = Math.min(1.0, s.count / 20);
    const adjustment = 0.08 * effectiveness * evidenceStrength * Math.abs(currentPts || 1);

    const rawNew    = currentPts + adjustment;
    const defAbs    = Math.abs(SIGNAL_DEFAULTS[key] || 1);
    // Clamp: signals can move at most 2× their default magnitude in either direction
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
  const { totalTracked, withPrice, winRate, avgReturn, topGainers, bestTicker, worstTicker } = perfStats;
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
          <td style="padding:4px 8px;color:${c.avgReturn >= 0 ? '#00ff88' : '#ff4d4d'};">${c.avgReturn >= 0 ? '+' : ''}${c.avgReturn}%</td>
          <td style="padding:4px 8px;color:#666;">${c.count}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="6" style="padding:8px;color:#555;">No weight changes this cycle — not enough outcome data yet</td></tr>';

  const topRows = topGainers.slice(0, 8).map(t => {
    const color = t.pct >= 0 ? '#00ff88' : '#ff4d4d';
    return `<tr>
      <td style="padding:4px 8px;color:#00ff88;font-weight:600;">${t.ticker}</td>
      <td style="padding:4px 8px;color:#aaa;">${new Date(t.detected_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
      <td style="padding:4px 8px;">$${parseFloat(t.signal_price).toFixed(2)}</td>
      <td style="padding:4px 8px;font-weight:700;color:${color};">${t.pct >= 0 ? '+' : ''}${t.pct.toFixed(1)}%</td>
    </tr>`;
  }).join('');

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

  <!-- Performance summary -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:24px;">
    <div style="background:#111;border:1px solid #1a1a1a;padding:12px;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#00ff88;">${winRate}%</div>
      <div style="font-size:8px;color:#555;letter-spacing:1px;margin-top:2px;">WIN RATE</div>
    </div>
    <div style="background:#111;border:1px solid #1a1a1a;padding:12px;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:${avgReturn >= 0 ? '#00ff88' : '#ff4d4d'};">${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(1)}%</div>
      <div style="font-size:8px;color:#555;letter-spacing:1px;margin-top:2px;">AVG RETURN</div>
    </div>
    <div style="background:#111;border:1px solid #1a1a1a;padding:12px;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#ffcc44;">${totalTracked}</div>
      <div style="font-size:8px;color:#555;letter-spacing:1px;margin-top:2px;">TRACKED</div>
    </div>
  </div>

  <!-- Algorithm weight changes -->
  <div style="font-size:8px;color:#555;letter-spacing:1px;margin-bottom:6px;">⚙️ ALGORITHM WEIGHT CHANGES (AUTO-APPLIED)</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:10px;">
    <tr style="border-bottom:1px solid #1a1a1a;">
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;letter-spacing:1px;">SIGNAL</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">OLD PTS</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">NEW PTS</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">WIN%</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">AVG RET</th>
      <th style="padding:5px 8px;text-align:left;color:#444;font-weight:400;font-size:8px;">N</th>
    </tr>
    ${changedRows}
  </table>

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

async function sendEmail(subject, html) {
  if (!RESEND_KEY) {
    console.log('[scan/report] RESEND_API_KEY not set — skipping email');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from:    'Signalscan <reports@signalscan.io>',
        to:      [REPORT_TO],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok) { console.error('[scan/report] Resend:', data); return false; }
    console.log('[scan/report] Email sent:', data.id);
    return true;
  } catch (e) {
    console.error('[scan/report] sendEmail:', e.message);
    return false;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
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
      return res.status(200).json({ message: 'No HOF records yet', sent: false });
    }

    // Deduplicate to first detection per ticker (entry price = oldest record)
    const byTicker = new Map();
    for (const r of records) {
      if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, r);
    }
    const unique = [...byTicker.values()];

    // Fetch current prices for all tracked tickers
    const symbols = unique.map(r => r.ticker).filter(t => !t.endsWith('-USD'));
    const prices  = await fetchCurrentPrices(symbols);

    // Attach current price + % gain to each record
    const withPct = unique.map(r => {
      const cur = prices[r.ticker];
      if (!cur) return { ...r, pct: null };
      return { ...r, pct: (cur - parseFloat(r.signal_price)) / parseFloat(r.signal_price) * 100, currentPrice: cur };
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

    const perfStats = {
      totalTracked: unique.length,
      withPrice:    withKnownPct.length,
      winRate, avgReturn, topGainers,
      bestTicker:  topGainers[0]  || null,
      worstTicker: topGainers[topGainers.length - 1] || null,
    };

    // ── Send email ────────────────────────────────────────────────────────────
    const date    = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const subject = `Signalscan ${date} — ${winRate}% win rate · ${weightResult.changes.length} signals auto-adjusted`;
    const html    = buildEmail(perfStats, weightResult, scanLogs);
    const sent    = await sendEmail(subject, html);

    return res.status(200).json({
      message:          'Report complete — weights auto-updated, email sent',
      sent,
      winRate,
      avgReturn:        parseFloat(avgReturn.toFixed(2)),
      totalTracked:     unique.length,
      eligibleOutcomes: weightResult.eligibleCount,
      weightsUpdated:   weightResult.changes.length,
      changes:          weightResult.changes,
    });
  } catch (e) {
    console.error('[scan/report] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
