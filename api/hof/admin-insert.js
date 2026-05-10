const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL  = 'camilotapia75@gmail.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Verify caller is admin via Supabase JWT
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth' });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SVC, Authorization: authHeader },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!userRes?.ok) return res.status(401).json({ error: 'Invalid token' });
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

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/golden_bull_hof`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SVC,
      Authorization: `Bearer ${SUPABASE_SVC}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([record]),
    signal: AbortSignal.timeout(8000),
  });

  if (!insertRes.ok) {
    console.error('[HOF admin-insert] error:', await insertRes.text());
    return res.status(500).json({ error: 'Insert failed' });
  }

  return res.status(200).json({ inserted: 1, record });
}
