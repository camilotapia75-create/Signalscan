// Requires: auth.js loaded before this file (uses getSupabase, currentUser, isSubscribed)

let _allLists   = {};   // { listName: tickers[] }
let _activeList = null; // currently selected list name

function _currentTickers() {
  return (_activeList && _allLists[_activeList]) ? _allLists[_activeList] : [];
}

function _syncWindow() {
  window._watchlistTickers = _currentTickers();
}

async function loadWatchlist() {
  if (!currentUser || !isSubscribed()) return;
  const { data } = await getSupabase()
    .from('watchlists')
    .select('list_name,tickers')
    .eq('user_id', currentUser.id);

  _allLists = {};
  if (data && data.length > 0) {
    for (const row of data) {
      _allLists[row.list_name || 'My Watchlist'] = row.tickers || [];
    }
    if (!_activeList || !_allLists[_activeList]) {
      _activeList = Object.keys(_allLists)[0];
    }
  } else {
    _allLists['My Watchlist'] = [];
    _activeList = 'My Watchlist';
  }
  _syncWindow();
  renderListTabs();
  renderWatchlistTags();
}

function renderListTabs() {
  const container = document.getElementById('watchlistListTabs');
  if (!container) return;
  const names = Object.keys(_allLists);
  container.innerHTML =
    names.map(name =>
      `<button class="wl-list-tab${name === _activeList ? ' active' : ''}" onclick="switchList(${JSON.stringify(name)})">${name}</button>`
    ).join('') +
    `<button class="wl-list-tab wl-list-new" onclick="createNewList()">+ NEW LIST</button>` +
    (names.length > 1
      ? `<button class="wl-list-tab wl-list-del" onclick="deleteCurrentList()">✕ DELETE</button>`
      : '');
}

function switchList(name) {
  if (_allLists[name] === undefined) return;
  _activeList = name;
  _syncWindow();
  renderListTabs();
  renderWatchlistTags();
}

async function createNewList() {
  const name = prompt('Name for the new list:');
  if (!name || !name.trim()) return;
  const trimmed = name.trim().substring(0, 40);
  if (_allLists[trimmed] !== undefined) { alert('A list with that name already exists.'); return; }
  _allLists[trimmed] = [];
  _activeList = trimmed;
  await _saveList(trimmed, []);
  _syncWindow();
  renderListTabs();
  renderWatchlistTags();
}

async function deleteCurrentList() {
  const names = Object.keys(_allLists);
  if (names.length <= 1) { alert("You can't delete your only list."); return; }
  if (!confirm(`Delete "${_activeList}"? This cannot be undone.`)) return;
  await getSupabase()
    .from('watchlists')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('list_name', _activeList);
  delete _allLists[_activeList];
  _activeList = Object.keys(_allLists)[0];
  _syncWindow();
  renderListTabs();
  renderWatchlistTags();
}

function renderWatchlistTags() {
  const container = document.getElementById('watchlistTags');
  if (!container) return;
  const tickers = _currentTickers();
  container.innerHTML = tickers.length === 0
    ? '<span style="color:var(--muted);font-size:11px;letter-spacing:1px;">No tickers yet — add some above.</span>'
    : tickers.map(t =>
        `<span class="wl-tag">${t}<button class="wl-tag-remove" onclick="removeTicker(${JSON.stringify(t)})" title="Remove">✕</button></span>`
      ).join('');
  const btn = document.getElementById('customScanBtn');
  if (btn) btn.disabled = tickers.length === 0;
}

async function _saveList(listName, tickers) {
  const { error } = await getSupabase()
    .from('watchlists')
    .upsert(
      { user_id: currentUser.id, list_name: listName, tickers, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,list_name' }
    );
  if (error) console.error('[WATCHLIST] Save error:', error.message);
}

async function addTicker() {
  const input  = document.getElementById('watchlistInput');
  const ticker = input.value.trim().toUpperCase().replace(/\s+/g, '');
  if (!ticker) return;
  input.value = '';
  const current = _currentTickers();
  if (current.includes(ticker)) return;
  const updated = [...current, ticker];
  _allLists[_activeList] = updated;
  _syncWindow();
  renderWatchlistTags();
  await _saveList(_activeList, updated);
}

async function removeTicker(ticker) {
  const updated = _currentTickers().filter(t => t !== ticker);
  _allLists[_activeList] = updated;
  _syncWindow();
  renderWatchlistTags();
  await _saveList(_activeList, updated);
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('watchlistInput');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') addTicker(); });
});
