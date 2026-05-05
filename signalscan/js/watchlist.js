// Requires: auth.js loaded before this file (uses getSupabase, currentUser, isSubscribed)

let _allLists  = {};    // { listName: tickers[] }
let _activeList = null; // currently selected list name
let _multiList  = false; // true only when DB has the new multi-list schema (list_name column)

function _currentTickers() {
  return (_activeList && _allLists[_activeList]) ? _allLists[_activeList] : [];
}

function _syncWindow() {
  window._watchlistTickers = _currentTickers();
}

async function loadWatchlist() {
  if (!currentUser || !isSubscribed()) return;
  const sb = getSupabase();

  // Probe for new multi-list schema (has list_name column)
  const { data, error } = await sb
    .from('watchlists')
    .select('list_name,tickers')
    .eq('user_id', currentUser.id);

  _allLists = {};

  if (!error) {
    // New schema present
    _multiList = true;
    if (data && data.length > 0) {
      for (const row of data) {
        _allLists[row.list_name || 'My Watchlist'] = row.tickers || [];
      }
    } else {
      _allLists['My Watchlist'] = [];
    }
  } else {
    // Old schema: user_id primary key only, no list_name column
    _multiList = false;
    const { data: d } = await sb
      .from('watchlists')
      .select('tickers')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    _allLists['My Watchlist'] = d?.tickers || [];
  }

  if (!_activeList || !_allLists[_activeList]) {
    _activeList = Object.keys(_allLists)[0] || 'My Watchlist';
  }
  _syncWindow();
  renderListTabs();
  renderWatchlistTags();
}

function renderListTabs() {
  const container = document.getElementById('watchlistListTabs');
  if (!container) return;
  const names = Object.keys(_allLists);
  const tabs = names.map(name => {
    const escaped = name.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return `<button class="wl-list-tab${name === _activeList ? ' active' : ''}" data-list="${escaped}" onclick="switchList(this.dataset.list)">${name}</button>`;
  }).join('');

  container.innerHTML = _multiList
    ? tabs +
      `<button class="wl-list-tab wl-list-new" onclick="createNewList()">+ NEW LIST</button>` +
      (names.length > 1 ? `<button class="wl-list-tab wl-list-del" onclick="deleteCurrentList()">✕ DELETE</button>` : '')
    : tabs;
}

function switchList(name) {
  if (_allLists[name] === undefined) return;
  _activeList = name;
  _syncWindow();
  renderListTabs();
  renderWatchlistTags();
}

async function createNewList() {
  if (!_multiList) return;
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
  if (!_multiList) return;
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
  // Use single quotes in onclick so the ticker (alphanumeric + hyphens) never breaks the HTML attribute
  container.innerHTML = tickers.length === 0
    ? '<span style="color:var(--muted);font-size:11px;letter-spacing:1px;">No tickers yet — add some above.</span>'
    : tickers.map(t =>
        `<span class="wl-tag">${t}<button class="wl-tag-remove" onclick="removeTicker('${t}')" title="Remove">✕</button></span>`
      ).join('');
  const btn = document.getElementById('customScanBtn');
  if (btn) btn.disabled = tickers.length === 0;
}

async function _saveList(listName, tickers) {
  const sb = getSupabase();
  if (_multiList) {
    const { error } = await sb
      .from('watchlists')
      .upsert(
        { user_id: currentUser.id, list_name: listName, tickers, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,list_name' }
      );
    if (error) console.error('[WATCHLIST] Save error:', error.message);
  } else {
    // Old schema: single row per user, user_id is primary key
    const { error } = await sb
      .from('watchlists')
      .upsert(
        { user_id: currentUser.id, tickers, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    if (error) console.error('[WATCHLIST] Save error:', error.message);
  }
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
