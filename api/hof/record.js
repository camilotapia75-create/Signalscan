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

  const valid = signals.filter(s =>
    s.ticker && typeof s.ticker === 'string' && /^[A-Z0-9.\-]{1,12}$/.test(s.ticker) &&
    typeof s.price === 'number' && s.price > 0 && s.price < 1e7 &&
    typeof s.conviction === 'number' && s.conviction >= 0 && s.conviction <= 100
  );
  if (!valid.length) return res.status(400).json({ error: 'Invalid signals' });

  // Skip tickers already recorded in the last 7 days
  const tickerList = valid.map(s => `"${s.ticker}"`).join(',');
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();

  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/golden_bull_hof?ticker=in.(${tickerList})&detected_at=gte.${cutoff}&select=ticker`,
    {
      headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}` },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!checkRes.ok) {
    console.error('[HOF record] dedup check failed:', checkRes.status);
    return res.status(503).json({ error: 'Dedup check unavailable' });
  }
  const existing    = await checkRes.json();
  const existingSet = new Set((Array.isArray(existing) ? existing : []).map(r => r.ticker));

  const toInsert = valid
    .filter(s => !existingSet.has(s.ticker))
    .map(s => ({ ticker: s.ticker, signal_price: s.price, conviction: s.conviction }));

  if (!toInsert.length) return res.status(200).json({ inserted: 0, skipped: valid.length });

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/golden_bull_hof`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SVC,
      Authorization: `Bearer ${SUPABASE_SVC}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toInsert),
    signal: AbortSignal.timeout(8000),
  });

  if (!insertRes.ok) {
    console.error('[HOF record] insert error:', await insertRes.text());
    return res.status(500).json({ error: 'Insert failed' });
  }

  return res.status(200).json({ inserted: toInsert.length, skipped: valid.length - toInsert.length });
}
