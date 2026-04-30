// Requires: auth.js loaded before this file (uses getSupabase, currentUser, isSubscribed)

let _watchlistTickers = [];

async function loadWatchlist() {
  if (!currentUser || !isSubscribed()) return;
  const { data } = await getSupabase()
    .from('watchlists')
    .select('tickers')
    .eq('user_id', currentUser.id)
    .maybeSingle();
  _watchlistTickers = data?.tickers || [];
  renderWatchlistTags();
}

function renderWatchlistTags() {
  const container = document.getElementById('watchlistTags');
  if (!container) return;
  container.innerHTML = _watchlistTickers.length === 0
    ? '<span style="color:var(--muted);font-size:11px;letter-spacing:1px;">No tickers yet — add some above.</span>'
    : _watchlistTickers.map(t =>
        `<span class="wl-tag">${t}<button class="wl-tag-remove" onclick="removeTicker('${t}')" title="Remove">✕</button></span>`
      ).join('');
  const btn = document.getElementById('customScanBtn');
  if (btn) btn.disabled = _watchlistTickers.length === 0;
}

async function saveTickers(tickers) {
  _watchlistTickers = tickers;
  await getSupabase()
    .from('watchlists')
    .upsert({ user_id: currentUser.id, tickers, updated_at: new Date().toISOString() });
  renderWatchlistTags();
}

async function addTicker() {
  const input  = document.getElementById('watchlistInput');
  const ticker = input.value.trim().toUpperCase().replace(/\s+/g, '');
  if (!ticker) return;
  input.value = '';
  if (_watchlistTickers.includes(ticker)) return;
  await saveTickers([..._watchlistTickers, ticker]);
}

async function removeTicker(ticker) {
  await saveTickers(_watchlistTickers.filter(t => t !== ticker));
}

// Allow Enter key to add ticker
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('watchlistInput');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') addTicker(); });
});
