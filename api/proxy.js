const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Module-level cache — persists across invocations within a warm Vercel instance
let _crumb = '';
let _cookie = '';
let _crumbAt = 0;
const CRUMB_TTL = 4 * 60 * 1000; // 4 minutes

async function refreshCrumb() {
  try {
    const homeRes = await fetch('https://finance.yahoo.com/', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    // Collect session cookies
    const rawCookies = homeRes.headers.getSetCookie
      ? homeRes.headers.getSetCookie()
      : (homeRes.headers.get('set-cookie') || '').split(/,(?=[^ ])/);
    _cookie = rawCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');

    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': _cookie },
      signal: AbortSignal.timeout(5000),
    });
    const text = await crumbRes.text();
    if (text && text.length < 20 && !text.includes('<')) {
      _crumb = text.trim();
      _crumbAt = Date.now();
    }
  } catch (_) {
    // Crumb fetch failed — proceed without it (unauthenticated fallback)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const target = decodeURIComponent(url);
  if (!target.includes('finance.yahoo.com')) {
    return res.status(403).json({ error: 'Only Yahoo Finance URLs allowed' });
  }

  // Ensure we have a fresh crumb
  if (!_crumb || Date.now() - _crumbAt > CRUMB_TTL) {
    await refreshCrumb();
  }

  // Append crumb so Yahoo treats this as an authenticated browser session
  const finalUrl = _crumb ? `${target}&crumb=${encodeURIComponent(_crumb)}` : target;

  try {
    const response = await fetch(finalUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
        ...(_cookie ? { 'Cookie': _cookie } : {}),
      },
      signal: AbortSignal.timeout(9000),
    });

    if (!response.ok) {
      // Crumb may have expired — invalidate so next request refreshes it
      if (response.status === 401 || response.status === 403) {
        _crumb = '';
        _crumbAt = 0;
      }
      return res.status(response.status).json({ error: `Yahoo returned ${response.status}` });
    }

    const data = await response.json();

    // Cache at Vercel's CDN edge for 5 minutes — 100 users requesting the same
    // ticker within 5 min share a single Yahoo Finance fetch, not 100 separate ones.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
