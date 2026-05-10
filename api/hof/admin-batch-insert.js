const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL  = 'camilotapia75@gmail.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Verify admin JWT
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth' });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SVC, Authorization: authHeader },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!userRes?.ok) return res.status(401).json({ error: 'Invalid token' });
  const user = await userRes.json();
  if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });

  const { signals } = req.body || {};
  if (!Array.isArray(signals) || !signals.length)
    return res.status(400).json({ error: 'No signals' });

  const allowedSources = ['scanner', 'watchlist', 'manual'];
  const records = signals
    .filter(s =>
      s.ticker && typeof s.ticker === 'string' &&
      /^[A-Z0-9.\-]{1,12}$/.test((s.ticker || '').toUpperCase()) &&
      typeof s.price === 'number' && s.price > 0 && s.price < 1e7 &&
      typeof s.conviction === 'number' && s.conviction >= 0 && s.conviction <= 100
    )
    .map(s => ({
      ticker:       s.ticker.trim().toUpperCase(),
      signal_price: s.price,
      conviction:   Math.round(s.conviction),
      source:       allowedSources.includes(s.source) ? s.source : 'scanner',
    }));

  if (!records.length) return res.status(400).json({ error: 'No valid signals' });

  // Insert all records — no 7-day dedup check (admin force-insert)
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/golden_bull_hof`, {
    method: 'POST',
    headers: {
      apikey:        SUPABASE_SVC,
      Authorization: `Bearer ${SUPABASE_SVC}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(records),
    signal: AbortSignal.timeout(15000),
  });

  if (!insertRes.ok) {
    console.error('[HOF admin-batch] error:', await insertRes.text());
    return res.status(500).json({ error: 'Insert failed' });
  }

  return res.status(200).json({ inserted: records.length, tickers: records.map(r => r.ticker) });
}
