// Community algorithm store
// GET    /api/algos                        — list public algos (sorted by upvotes)
// POST   /api/algos                        — save a new algo (auth required)
// POST   /api/algos?action=upvote&id=<uuid>  — upvote
// DELETE /api/algos?id=<uuid>              — delete your own algo, or any as admin

const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://bhykfnuljzzimzmdjcia.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoeWtmbnVsanp6aW16bWRqY2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTU0NDcsImV4cCI6MjA5MzA3MTQ0N30.Bl1Bigqc6iD8Pi1OTaMPNhRnrP6l4-vzcDoAo_acOUE';
const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sbHeaders(useService = false) {
  const key = (useService && SUPABASE_SVC) ? SUPABASE_SVC : SUPABASE_ANON;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

// Moderators. Checked server-side because the client cannot be trusted to
// report who it is — a client-side admin flag is a suggestion, not a control.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'camilotapia75@gmail.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// Verify Supabase JWT and return { id, email, isAdmin }, or null
async function verifyUser(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user?.id) return null;
    const email = (user.email || '').trim().toLowerCase();
    return { id: user.id, email, isAdmin: ADMIN_EMAILS.includes(email) };
  } catch (_) { return null; }
}

async function verifyToken(authHeader) {
  const u = await verifyUser(authHeader);
  return u?.id || null;
}

// Validate algo config shape
function validateConfig(config) {
  if (!config || typeof config !== 'object') return false;
  if (!Array.isArray(config.signals) || config.signals.length === 0) return false;
  if (typeof config.scoreThreshold !== 'number') return false;
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: list public algos ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/public_algos?is_public=eq.true&select=id,user_id,name,description,author_name,config,upvotes,scan_count,created_at&order=upvotes.desc,created_at.desc&limit=50`,
        { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
      );
      const data = r.ok ? await r.json() : [];
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      return res.status(200).json(Array.isArray(data) ? data : []);
    } catch (e) {
      return res.status(503).json({ error: 'Unavailable' });
    }
  }

  // ── DELETE: remove an algo ─────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const user = await verifyUser(req.headers['authorization']);
    if (!user) return res.status(401).json({ error: 'Login required' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    try {
      // Read the owner first. Authorisation is decided from the stored row, not
      // from anything the caller sent.
      const look = await fetch(
        `${SUPABASE_URL}/rest/v1/public_algos?id=eq.${encodeURIComponent(id)}&select=user_id,name`,
        { headers: sbHeaders(true), signal: AbortSignal.timeout(5000) }
      );
      const rows = look.ok ? await look.json() : [];
      if (!rows.length) return res.status(404).json({ error: 'Not found' });

      const owner = rows[0].user_id;
      if (owner !== user.id && !user.isAdmin) {
        return res.status(403).json({ error: 'You can only delete your own algorithms' });
      }

      const del = await fetch(
        `${SUPABASE_URL}/rest/v1/public_algos?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: sbHeaders(true), signal: AbortSignal.timeout(8000) }
      );
      if (!del.ok) {
        console.error('[algos] delete failed:', await del.text());
        return res.status(500).json({ error: 'Delete failed' });
      }
      console.log(`[algos] deleted "${rows[0].name}" by ${user.isAdmin && owner !== user.id ? 'admin' : 'owner'} ${user.email}`);
      return res.status(200).json({ ok: true, deleted: id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  // ── POST: upvote ───────────────────────────────────────────────────────────
  if (req.query.action === 'upvote') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_algo_upvotes`, {
        method: 'POST',
        headers: sbHeaders(true),
        body: JSON.stringify({ algo_id: id }),
        signal: AbortSignal.timeout(5000),
      });
      return res.status(200).json({ ok: true });
    } catch (_) {
      return res.status(500).json({ error: 'Upvote failed' });
    }
  }

  // ── POST: save algo ────────────────────────────────────────────────────────
  const userId = await verifyToken(req.headers['authorization']);
  if (!userId) return res.status(401).json({ error: 'Login required to save algorithms' });

  const { name, description, config, is_public } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  if (!validateConfig(config)) {
    return res.status(400).json({ error: 'Invalid algorithm config' });
  }

  // Get author display name from Supabase
  let authorName = null;
  try {
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: req.headers['authorization'] },
      signal: AbortSignal.timeout(4000),
    });
    if (uRes.ok) {
      const u = await uRes.json();
      authorName = u.email ? u.email.split('@')[0] : null;
    }
  } catch (_) {}

  const row = {
    user_id:     userId,
    author_name: authorName || 'anonymous',
    name:        name.trim().substring(0, 60),
    description: (description || '').trim().substring(0, 200) || null,
    config,
    is_public:   is_public !== false,
    upvotes:     0,
    scan_count:  0,
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/public_algos`, {
      method: 'POST',
      headers: { ...sbHeaders(true), Prefer: 'return=representation' },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const err = await r.text();
      console.error('[algos] save failed:', err);
      return res.status(500).json({ error: 'Save failed' });
    }
    const saved = await r.json();
    return res.status(201).json(Array.isArray(saved) ? saved[0] : saved);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
