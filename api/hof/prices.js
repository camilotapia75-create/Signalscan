const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let _crumb  = '';
let _cookie = '';
let _crumbAt = 0;
const CRUMB_TTL = 4 * 60 * 1000;

async function refreshCrumb() {
  try {
    const homeRes = await fetch('https://finance.yahoo.com/', {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    const rawCookies = homeRes.headers.getSetCookie
      ? homeRes.headers.getSetCookie()
      : (homeRes.headers.get('set-cookie') || '').split(/,(?=[^ ])/);
    _cookie = rawCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');

    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: _cookie },
      signal: AbortSignal.timeout(5000),
    });
    const text = await crumbRes.text();
    if (text && text.length < 20 && !text.includes('<')) {
      _crumb   = text.trim();
      _crumbAt = Date.now();
    }
  } catch (_) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { tickers } = req.query;
  if (!tickers) return res.status(400).json({ error: 'Missing tickers' });

  const tickerList = tickers.split(',')
    .slice(0, 30)
    .map(t => t.trim().toUpperCase())
    .filter(t => /^[A-Z0-9.\-]{1,12}$/.test(t));

  if (!tickerList.length) return res.status(400).json({ error: 'No valid tickers' });

  if (!_crumb || Date.now() - _crumbAt > CRUMB_TTL) await refreshCrumb();

  const prices = {};
  await Promise.all(tickerList.map(async ticker => {
    try {
      const base = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
      const url  = _crumb ? `${base}&crumb=${encodeURIComponent(_crumb)}` : base;
      const r    = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          Referer: 'https://finance.yahoo.com/',
          ...(_cookie ? { Cookie: _cookie } : {}),
        },
        signal: AbortSignal.timeout(9000),
      });
      if (!r.ok) return;
      const json   = await r.json();
      const result = json.chart?.result?.[0];
      if (!result) return;
      const price  = result.meta?.regularMarketPrice
                  || result.indicators?.quote?.[0]?.close?.filter(Boolean).slice(-1)[0];
      if (price) prices[ticker] = price;
    } catch (_) {}
  }));

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return res.status(200).json({ prices });
}
