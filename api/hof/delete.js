const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://bhykfnuljzzimzmdjcia.supabase.co';
const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoeWtmbnVsanp6aW16bWRqY2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTU0NDcsImV4cCI6MjA5MzA3MTQ0N30.Bl1Bigqc6iD8Pi1OTaMPNhRnrP6l4-vzcDoAo_acOUE';
const ADMIN_EMAIL   = 'camilotapia75@gmail.com';

const ALLOWED_TABLES = new Set(['golden_bull_hof', 'bull_pen_hof', 'bull_pen_strict_hof']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth' });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: authHeader },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!userRes?.ok) return res.status(401).json({ error: 'Invalid token' });
  const user = await userRes.json();
  if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });

  const { table, ticker } = req.body || {};

  if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });

  const tickerUpper = (typeof ticker === 'string' ? ticker : '').trim().toUpperCase();
  if (!tickerUpper || !/^[A-Z0-9.\-]{1,12}$/.test(tickerUpper))
    return res.status(400).json({ error: 'Invalid ticker' });

  const deleteKey  = SUPABASE_SVC || SUPABASE_ANON;
  const deleteAuth = SUPABASE_SVC ? `Bearer ${SUPABASE_SVC}` : authHeader;

  const deleteRes = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?ticker=eq.${encodeURIComponent(tickerUpper)}`,
    {
      method: 'DELETE',
      headers: { apikey: deleteKey, Authorization: deleteAuth },
      signal: AbortSignal.timeout(8000),
    }
  );

  if (!deleteRes.ok) {
    const errText = await deleteRes.text();
    console.error(`[HOF delete] failed on ${table}/${tickerUpper}:`, deleteRes.status, errText);
    return res.status(500).json({ error: `Delete failed: ${deleteRes.status}` });
  }

  return res.status(200).json({ deleted: tickerUpper, table });
}
