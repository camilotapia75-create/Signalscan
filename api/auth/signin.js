const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://bhykfnuljzzimzmdjcia.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoeWtmbnVsanp6aW16bWRqY2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTU0NDcsImV4cCI6MjA5MzA3MTQ0N30.Bl1Bigqc6iD8Pi1OTaMPNhRnrP6l4-vzcDoAo_acOUE';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    if (!r.ok) return res.status(401).json({ error: data.error_description || data.msg || 'Invalid credentials' });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(503).json({ error: 'Authentication service unavailable. Try again.' });
  }
}
