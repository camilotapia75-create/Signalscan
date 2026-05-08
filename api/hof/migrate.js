const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { signals } = req.body || {};
  if (!Array.isArray(signals) || !signals.length)
    return res.status(400).json({ error: 'No signals' });

  const now = new Date();
  const valid = signals
    .filter(s =>
      s.ticker && typeof s.ticker === 'string' && /^[A-Z0-9.\-]{1,12}$/.test(s.ticker) &&
      typeof s.price === 'number' && s.price > 0 && s.price < 1e7 &&
      typeof s.conviction === 'number' && s.conviction >= 0 && s.conviction <= 100 &&
      s.detected_at && new Date(s.detected_at) <= now
    )
    .slice(0, 500);

  if (!valid.length) return res.status(400).json({ error: 'No valid signals' });

  const toInsert = valid.map(s => ({
    ticker:       s.ticker,
    signal_price: s.price,
    conviction:   s.conviction,
    detected_at:  new Date(s.detected_at).toISOString(),
  }));

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/golden_bull_hof`, {
    method: 'POST',
    headers: {
      apikey:         SUPABASE_SVC,
      Authorization:  `Bearer ${SUPABASE_SVC}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toInsert),
    signal: AbortSignal.timeout(15000),
  });

  if (!insertRes.ok) {
    console.error('[HOF migrate] insert error:', await insertRes.text());
    return res.status(500).json({ error: 'Insert failed' });
  }

  return res.status(200).json({ migrated: toInsert.length });
}
