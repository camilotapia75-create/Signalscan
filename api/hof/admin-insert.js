const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://bhykfnuljzzimzmdjcia.supabase.co';
const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoeWtmbnVsanp6aW16bWRqY2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTU0NDcsImV4cCI6MjA5MzA3MTQ0N30.Bl1Bigqc6iD8Pi1OTaMPNhRnrP6l4-vzcDoAo_acOUE';
const ADMIN_EMAIL   = 'camilotapia75@gmail.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Verify caller is admin via Supabase JWT (uses anon key so no secret env var needed)
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth' });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: authHeader },
    signal: AbortSignal.timeout(8000),
  }).catch((e) => { console.error('[admin-insert] auth fetch error:', e.message); return null; });
  if (!userRes?.ok) {
    console.error('[admin-insert] auth check failed, status:', userRes?.status);
    return res.status(401).json({ error: 'Invalid token' });
  }
  const user = await userRes.json();
  if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });

  const { ticker, price, conviction, detectedAt, source } = req.body || {};

  const tickerUpper = (typeof ticker === 'string' ? ticker : '').trim().toUpperCase();
  if (!tickerUpper || !/^[A-Z0-9.\-]{1,12}$/.test(tickerUpper))
    return res.status(400).json({ error: 'Invalid ticker' });
  if (typeof price !== 'number' || price <= 0 || price >= 1e7)
    return res.status(400).json({ error: 'Invalid price' });
  if (typeof conviction !== 'number' || conviction < 0 || conviction > 100)
    return res.status(400).json({ error: 'Invalid conviction' });

  const allowedSources = ['scanner', 'watchlist', 'manual'];
  const record = {
    ticker: tickerUpper,
    signal_price: price,
    conviction: Math.round(conviction),
    source: allowedSources.includes(source) ? source : 'manual',
  };
  if (detectedAt) {
    const d = new Date(detectedAt);
    if (!isNaN(d.getTime())) record.detected_at = d.toISOString();
  }

  // Use service role key if available (bypasses RLS); fall back to user JWT (needs RLS policy)
  const insertKey  = SUPABASE_SVC || SUPABASE_ANON;
  const insertAuth = SUPABASE_SVC ? `Bearer ${SUPABASE_SVC}` : authHeader;

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/golden_bull_hof`, {
    method: 'POST',
    headers: {
      apikey:          insertKey,
      Authorization:   insertAuth,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify([record]),
    signal: AbortSignal.timeout(8000),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error('[HOF admin-insert] insert failed:', insertRes.status, errText);
    return res.status(500).json({ error: `Insert failed: ${insertRes.status}` });
  }

  return res.status(200).json({ inserted: 1, record });
}
