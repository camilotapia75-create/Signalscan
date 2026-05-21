// Consolidates: admin-insert, admin-batch-insert, delete
// Body must include: { action: 'insert' | 'batch-insert' | 'delete', ...params }
const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://bhykfnuljzzimzmdjcia.supabase.co';
const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoeWtmbnVsanp6aW16bWRqY2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTU0NDcsImV4cCI6MjA5MzA3MTQ0N30.Bl1Bigqc6iD8Pi1OTaMPNhRnrP6l4-vzcDoAo_acOUE';
const ADMIN_EMAIL   = 'camilotapia75@gmail.com';
const ALLOWED_TABLES = new Set(['golden_bull_hof', 'bull_pen_hof', 'bull_pen_strict_hof', 'minervini_hof']);

async function verifyAdmin(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: authHeader },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const user = await res.json();
  return user.email === ADMIN_EMAIL ? user : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const admin = await verifyAdmin(req.headers.authorization);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.body || {};
  const svcKey  = SUPABASE_SVC;
  const svcAuth = `Bearer ${SUPABASE_SVC}`;

  // ── WIPE ALL HOF TABLES ───────────────────────────────────────────────────
  if (action === 'wipe-all') {
    const wiped = [], failed = [];
    for (const table of ALLOWED_TABLES) {
      try {
        // detected_at=gte.1970-01-01 matches every row; more reliable than id=gte.1
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/${table}?detected_at=gte.1970-01-01`,
          { method: 'DELETE', headers: { apikey: svcKey, Authorization: svcAuth, Prefer: 'return=minimal' }, signal: AbortSignal.timeout(12000) }
        );
        if (r.ok || r.status === 204) wiped.push(table);
        else { const body = await r.text().catch(() => r.status); failed.push({ table, error: body }); }
      } catch (e) {
        failed.push({ table, error: e.message });
      }
    }
    if (!wiped.length) return res.status(500).json({ error: 'All tables failed', failed });
    return res.status(200).json({ wiped, failed });
  }

  // ── DELETE BY ID (precise — used by purge to avoid wiping all ticker entries) ──
  if (action === 'delete-by-id') {
    const { table, id } = req.body;
    if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
      { method: 'DELETE', headers: { apikey: svcKey, Authorization: svcAuth }, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return res.status(500).json({ error: `Delete failed: ${r.status}` });
    return res.status(200).json({ deleted: id, table });
  }

  // ── DELETE (all entries for a ticker) ─────────────────────────────────────
  if (action === 'delete') {
    const { table, ticker } = req.body;
    if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });
    const tickerUpper = (typeof ticker === 'string' ? ticker : '').trim().toUpperCase();
    if (!tickerUpper || !/^[A-Z0-9.\-]{1,12}$/.test(tickerUpper))
      return res.status(400).json({ error: 'Invalid ticker' });

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?ticker=eq.${encodeURIComponent(tickerUpper)}`,
      { method: 'DELETE', headers: { apikey: svcKey, Authorization: svcAuth }, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return res.status(500).json({ error: `Delete failed: ${r.status}` });
    return res.status(200).json({ deleted: tickerUpper, table });
  }

  // ── BATCH INSERT (no dedup, admin force) ──────────────────────────────────
  if (action === 'batch-insert') {
    const { signals } = req.body;
    if (!Array.isArray(signals) || !signals.length)
      return res.status(400).json({ error: 'No signals' });
    const allowedSources = ['scanner', 'watchlist', 'manual'];
    const records = signals
      .filter(s => s.ticker && /^[A-Z0-9.\-]{1,12}$/.test((s.ticker || '').toUpperCase()) &&
        typeof s.price === 'number' && s.price > 0 && s.price < 1e7 &&
        typeof s.conviction === 'number' && s.conviction >= 0 && s.conviction <= 100)
      .map(s => ({
        ticker: s.ticker.trim().toUpperCase(), signal_price: s.price,
        conviction: Math.round(s.conviction),
        source: allowedSources.includes(s.source) ? s.source : 'scanner',
      }));
    if (!records.length) return res.status(400).json({ error: 'No valid signals' });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/golden_bull_hof`, {
      method: 'POST',
      headers: { apikey: svcKey, Authorization: svcAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify(records), signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(500).json({ error: 'Insert failed' });
    return res.status(200).json({ inserted: records.length, tickers: records.map(r => r.ticker) });
  }

  // ── SINGLE INSERT ─────────────────────────────────────────────────────────
  if (action === 'insert') {
    const { ticker, price, conviction, detectedAt, source, table: insertTable } = req.body;
    const targetTable = ALLOWED_TABLES.has(insertTable) ? insertTable : 'golden_bull_hof';
    const tickerUpper = (typeof ticker === 'string' ? ticker : '').trim().toUpperCase();
    if (!tickerUpper || !/^[A-Z0-9.\-]{1,12}$/.test(tickerUpper))
      return res.status(400).json({ error: 'Invalid ticker' });
    if (typeof price !== 'number' || price <= 0 || price >= 1e7)
      return res.status(400).json({ error: 'Invalid price' });
    if (typeof conviction !== 'number' || conviction < 0 || conviction > 100)
      return res.status(400).json({ error: 'Invalid conviction' });
    const allowedSources = ['scanner', 'watchlist', 'manual'];
    const record = {
      ticker: tickerUpper, signal_price: price, conviction: Math.round(conviction),
      source: allowedSources.includes(source) ? source : 'manual',
    };
    if (detectedAt) { const d = new Date(detectedAt); if (!isNaN(d.getTime())) record.detected_at = d.toISOString(); }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${targetTable}`, {
      method: 'POST',
      headers: { apikey: svcKey, Authorization: svcAuth, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify([record]), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(500).json({ error: `Insert failed: ${r.status}` });
    return res.status(200).json({ inserted: 1, record });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
