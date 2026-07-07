// 5-day performance report — triggered by Vercel cron
// GET /api/scan/report
//
// Required env vars:
//   SUPABASE_SERVICE_ROLE_KEY  — read golden_bull_hof, scan_run_log
//   CRON_SECRET                — same secret as scan/run.js
//
// Optional:
//   RESEND_API_KEY             — send HTML email via resend.com (free tier: 3000/mo)
//   REPORT_TO_EMAIL            — recipient address (defaults to camilotapia75@gmail.com)

const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://bhykfnuljzzimzmdjcia.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON    = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoeWtmbnVsanp6aW16bWRqY2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTU0NDcsImV4cCI6MjA5MzA3MTQ0N30.Bl1Bigqc6iD8Pi1OTaMPNhRnrP6l4-vzcDoAo_acOUE';
const CRON_SECRET      = process.env.CRON_SECRET;
const RESEND_KEY       = process.env.RESEND_API_KEY;
const REPORT_TO        = process.env.REPORT_TO_EMAIL   || 'camilotapia75@gmail.com';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
let _crumb = '', _cookie = '', _crumbAt = 0;

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
  try {
    const crumbParam = _crumb ? `&crumb=${encodeURIComponent(_crumb)}` : '';
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=regularMarketPrice${crumbParam}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://finance.yahoo.com/', ...(_cookie ? { Cookie: _cookie } : {}) },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return {};
    const json   = await res.json();
    const quotes = json.quoteResponse?.result || [];
    const prices = {};
    for (const q of quotes) {
      if (q.symbol && q.regularMarketPrice) prices[q.symbol] = q.regularMarketPrice;
    }
    return prices;
  } catch (_) { return {}; }
}

async function getHofRecords(days = 35) {
  const key    = SUPABASE_SERVICE || SUPABASE_ANON;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const res    = await fetch(
    `${SUPABASE_URL}/rest/v1/golden_bull_hof?select=ticker,detected_at,signal_price,conviction,source&detected_at=gte.${cutoff}&order=detected_at.desc&limit=5000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

async function getRecentScanLogs(days = 6) {
  const key    = SUPABASE_SERVICE || SUPABASE_ANON;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_run_log?select=ran_at,tickers_scanned,gb_found,gb_new,gb_tickers&ran_at=gte.${cutoff}&order=ran_at.desc&limit=10`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) }
    );
    return res.ok ? await res.json() : [];
  } catch (_) { return []; }
}

function buildEmailHtml(stats, scanLogs) {
  const { totalTracked, withPrice, winners, losers, avgReturn, bestTicker, worstTicker, winRate, topGainers } = stats;
  const scanSummaryRows = scanLogs.slice(0, 5).map(l => {
    const d  = new Date(l.ran_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const ts = l.gb_tickers || [];
    return `<tr><td style="padding:4px 8px;color:#aaa;">${d}</td><td style="padding:4px 8px;">${l.gb_found ?? '—'}</td><td style="padding:4px 8px;color:#00ff88;">${l.gb_new ?? '—'}</td><td style="padding:4px 8px;font-size:10px;color:#888;">${ts.slice(0,6).join(', ')}${ts.length > 6 ? '…' : ''}</td></tr>`;
  }).join('');

  const topRows = topGainers.slice(0, 10).map(t => {
    const color = t.pct >= 0 ? '#00ff88' : '#ff4d4d';
    const pct   = `${t.pct >= 0 ? '+' : ''}${t.pct.toFixed(1)}%`;
    const date  = new Date(t.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<tr><td style="padding:4px 8px;color:#00ff88;font-weight:600;">${t.ticker}</td><td style="padding:4px 8px;color:#aaa;">${date}</td><td style="padding:4px 8px;">$${parseFloat(t.signal_price).toFixed(2)}</td><td style="padding:4px 8px;font-weight:700;color:${color};">${pct}</td></tr>`;
  }).join('');

  const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0a0a0a;color:#e0e0e0;font-family:'Courier New',monospace;margin:0;padding:0;">
<div style="max-width:600px;margin:0 auto;padding:24px;">
  <div style="border-bottom:1px solid #333;padding-bottom:16px;margin-bottom:24px;">
    <div style="font-size:10px;color:#666;letter-spacing:2px;">SIGNALSCAN AUTONOMOUS REPORT</div>
    <div style="font-size:22px;font-weight:700;color:#00ff88;margin-top:4px;">📊 5-DAY PERFORMANCE UPDATE</div>
    <div style="font-size:11px;color:#888;margin-top:4px;">${reportDate}</div>
  </div>

  <!-- Stats grid -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px;">
    <div style="background:#111;border:1px solid #1a1a1a;padding:12px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#00ff88;">${winRate}%</div>
      <div style="font-size:9px;color:#666;letter-spacing:1px;margin-top:2px;">WIN RATE</div>
    </div>
    <div style="background:#111;border:1px solid #1a1a1a;padding:12px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:${avgReturn >= 0 ? '#00ff88' : '#ff4d4d'};">${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(1)}%</div>
      <div style="font-size:9px;color:#666;letter-spacing:1px;margin-top:2px;">AVG RETURN</div>
    </div>
    <div style="background:#111;border:1px solid #1a1a1a;padding:12px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#ffcc44;">${totalTracked}</div>
      <div style="font-size:9px;color:#666;letter-spacing:1px;margin-top:2px;">TRACKED</div>
    </div>
  </div>

  <div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:4px;">TOP PERFORMERS (LAST 35 DAYS)</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px;">
    <tr style="border-bottom:1px solid #222;">
      <th style="padding:6px 8px;text-align:left;color:#555;font-weight:400;font-size:9px;letter-spacing:1px;">TICKER</th>
      <th style="padding:6px 8px;text-align:left;color:#555;font-weight:400;font-size:9px;letter-spacing:1px;">DETECTED</th>
      <th style="padding:6px 8px;text-align:left;color:#555;font-weight:400;font-size:9px;letter-spacing:1px;">ENTRY</th>
      <th style="padding:6px 8px;text-align:left;color:#555;font-weight:400;font-size:9px;letter-spacing:1px;">RETURN</th>
    </tr>
    ${topRows || '<tr><td colspan="4" style="padding:8px;color:#555;font-size:10px;">No data available</td></tr>'}
  </table>

  ${bestTicker ? `<div style="font-size:10px;color:#aaa;margin-bottom:4px;">BEST PICK: <span style="color:#00ff88;font-weight:700;">${bestTicker.ticker}</span> → <span style="color:#00ff88;">+${bestTicker.pct.toFixed(1)}%</span></div>` : ''}
  ${worstTicker ? `<div style="font-size:10px;color:#aaa;margin-bottom:16px;">WORST PICK: <span style="color:#ff4d4d;">${worstTicker.ticker}</span> → <span style="color:#ff4d4d;">${worstTicker.pct.toFixed(1)}%</span></div>` : ''}

  ${scanSummaryRows ? `
  <div style="font-size:9px;color:#555;letter-spacing:1px;margin-bottom:4px;margin-top:16px;">RECENT SCANS</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px;">
    <tr style="border-bottom:1px solid #222;">
      <th style="padding:6px 8px;text-align:left;color:#555;font-weight:400;font-size:9px;letter-spacing:1px;">DATE</th>
      <th style="padding:6px 8px;text-align:left;color:#555;font-weight:400;font-size:9px;letter-spacing:1px;">FOUND</th>
      <th style="padding:6px 8px;text-align:left;color:#555;font-weight:400;font-size:9px;letter-spacing:1px;">NEW</th>
      <th style="padding:6px 8px;text-align:left;color:#555;font-weight:400;font-size:9px;letter-spacing:1px;">TICKERS</th>
    </tr>
    ${scanSummaryRows}
  </table>` : ''}

  <div style="border-top:1px solid #1a1a1a;padding-top:16px;font-size:9px;color:#444;letter-spacing:1px;">
    SIGNALSCAN AUTONOMOUS SYSTEM · SCANS DAILY 9AM EST · REPORTS EVERY 5 DAYS<br>
    signalscan.vercel.app
  </div>
</div>
</body>
</html>`;
}

async function sendEmail(subject, html) {
  if (!RESEND_KEY) {
    console.log('[scan/report] RESEND_API_KEY not set — skipping email. Set it in Vercel dashboard.');
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
    if (!res.ok) {
      console.error('[scan/report] Resend error:', data);
      return false;
    }
    console.log('[scan/report] Email sent:', data.id);
    return true;
  } catch (e) {
    console.error('[scan/report] sendEmail failed:', e.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (!auth || auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  try {
    const [records, scanLogs] = await Promise.all([
      getHofRecords(35),
      getRecentScanLogs(6),
    ]);

    if (!records?.length) {
      return res.status(200).json({ message: 'No HOF records to report on yet', sent: false });
    }

    // Deduplicate: one entry per ticker (oldest detection = entry price)
    const byTicker = new Map();
    for (const r of [...records].reverse()) byTicker.set(r.ticker, r);
    const unique = [...byTicker.values()];

    // Fetch current prices for all tracked tickers
    const symbols = unique.map(r => r.ticker).filter(t => !t.endsWith('-USD'));
    const prices  = await fetchCurrentPrices(symbols);

    // Compute performance
    const withPct = unique.map(r => {
      const cur = prices[r.ticker];
      if (!cur) return null;
      const pct = (cur - parseFloat(r.signal_price)) / parseFloat(r.signal_price) * 100;
      return { ...r, pct, currentPrice: cur };
    }).filter(Boolean);

    const winners = withPct.filter(r => r.pct >= 0);
    const losers  = withPct.filter(r => r.pct < 0);
    const winRate = withPct.length ? Math.round(winners.length / withPct.length * 100) : 0;
    const avgReturn = withPct.length
      ? withPct.reduce((sum, r) => sum + r.pct, 0) / withPct.length
      : 0;
    const topGainers = [...withPct].sort((a, b) => b.pct - a.pct);
    const bestTicker  = topGainers[0]   || null;
    const worstTicker = topGainers[topGainers.length - 1] || null;

    const stats = {
      totalTracked: unique.length, withPrice: withPct.length,
      winners: winners.length, losers: losers.length,
      winRate, avgReturn, bestTicker, worstTicker, topGainers,
    };

    const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const subject    = `Signalscan Report ${reportDate} — ${winRate}% win rate, avg ${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(1)}%`;
    const html       = buildEmailHtml(stats, scanLogs);
    const sent       = await sendEmail(subject, html);

    return res.status(200).json({
      message:      'Report generated',
      sent,
      totalTracked: unique.length,
      winRate,
      avgReturn:    parseFloat(avgReturn.toFixed(2)),
      bestTicker:   bestTicker?.ticker,
      bestPct:      bestTicker?.pct?.toFixed(1),
    });
  } catch (e) {
    console.error('[scan/report] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
