const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhykfnuljzzimzmdjcia.supabase.co';
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/golden_bull_hof?select=ticker,detected_at,signal_price,conviction,source&order=detected_at.desc&limit=5000`,
      {
        headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!r.ok) {
      console.error('[HOF public] fetch failed:', r.status);
      return res.status(502).json({ error: 'Data unavailable' });
    }
    const records = await r.json();
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json(records);
  } catch (e) {
    console.error('[HOF public] error:', e.message);
    return res.status(503).json({ error: 'Service unavailable' });
  }
}
