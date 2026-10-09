// Requires: Supabase CDN + config.js loaded before this file

let _supabase = null;
let currentUser = null;
let currentSub  = null;

function getSupabase() {
  if (!_supabase) {
    const { createClient } = window.supabase;
    _supabase = createClient(
      window.SIGNALSCAN_CONFIG.supabaseUrl,
      window.SIGNALSCAN_CONFIG.supabaseAnonKey
    );
  }
  return _supabase;
}

function isSubscribed() {
  return currentSub?.status === 'active' || currentSub?.status === 'trialing';
}

async function loadSub() {
  if (!currentUser) { currentSub = null; return; }
  const { data } = await getSupabase()
    .from('subscriptions')
    .select('status,period_end')
    .eq('user_id', currentUser.id)
    .maybeSingle();
  currentSub = data;
}

// Called by the header LOGIN button as a static fallback in case renderAuthState hasn't run yet
function headerLoginClick() {
  if (currentUser) showAccountMenu();
  else showAuthModal('login');
}

async function initAuth() {
  const sb = getSupabase();

  // Render HOF immediately — public data, no auth needed, don't wait for getSession
  if (typeof renderHoF        === 'function') renderHoF();
  if (typeof renderBullPenHoF === 'function') renderBullPenHoF();
  if (typeof renderAllHoF     === 'function') renderAllHoF();

  // Wrap getSession in try-catch so a network failure doesn't silently prevent
  // renderAuthState() from running — which would leave the LOGIN button with no onclick.
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      await loadSub();
    }
  } catch (e) {
    console.error('[AUTH] getSession failed:', e.message);
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    try {
      if (session?.user) {
        currentUser = session.user;
        await loadSub();
      } else {
        currentUser = null;
        currentSub  = null;
      }
    } catch (e) {
      console.error('[AUTH] onAuthStateChange error:', e.message);
    }
    renderAuthState();
  });

  // After Stripe checkout, sync subscription directly rather than waiting for webhook
  const params = new URLSearchParams(window.location.search);
  if (params.get('subscribed') === 'true') {
    if (currentUser) {
      try {
        const r = await fetch('/api/stripe/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, email: currentUser.email }),
        });
        const d = await r.json();
        if (d.subscribed) await loadSub();
      } catch (_) {}
    }
    // Fallback poll in case sync was slow
    for (let i = 0; i < 4 && !isSubscribed(); i++) {
      await new Promise(r => setTimeout(r, 1500));
      await loadSub();
    }
    window.history.replaceState({}, '', window.location.pathname);
  }

  renderAuthState();
}

function renderAuthState() {
  const loginBtn = document.getElementById('headerLoginBtn');
  const proTag   = document.getElementById('headerProTag');

  if (currentUser) {
    if (loginBtn) {
      loginBtn.textContent = currentUser.email.split('@')[0].substring(0, 14);
      loginBtn.onclick = showAccountMenu;
    }
    if (proTag) proTag.style.display = isSubscribed() ? 'inline' : 'none';
  } else {
    if (loginBtn) {
      loginBtn.textContent = 'LOGIN';
      loginBtn.onclick = () => showAuthModal('login');
    }
    if (proTag) proTag.style.display = 'none';
  }

  renderProGate();
  applyProGates();
  updateAds();
  if (isSubscribed()) loadWatchlist();
  if (typeof renderHoF === 'function') renderHoF();
  if (typeof renderBullPenHoF === 'function') renderBullPenHoF();
  if (typeof renderAllHoF === 'function') renderAllHoF();
}

let _adInjected = false;

function updateAds() {
  // Ads disabled
  const el = document.getElementById('_monetag');
  if (el) el.remove();
  _adInjected = false;
}

function renderProGate() {
  const gate       = document.getElementById('proGate');
  const proContent = document.getElementById('proContent');
  if (!gate || !proContent) return;

  if (isSubscribed()) {
    gate.style.display       = 'none';
    proContent.style.display = 'block';
  } else {
    gate.style.display       = 'block';
    proContent.style.display = 'none';
    const msg = document.getElementById('gateMsgSub');
    if (msg) {
      msg.textContent = currentUser
        ? 'Upgrade to Pro to unlock custom watchlist scanning.'
        : 'Create an account or log in, then upgrade to Pro.';
    }
  }
}

// ── Auth modal ────────────────────────────────────────────────────────────────

function showAuthModal(tab = 'login') {
  document.getElementById('authModal').style.display = 'flex';
  switchAuthTab(tab);
  clearAuthErrors();
}

function hideAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

function switchAuthTab(tab) {
  document.getElementById('authTabLogin').dataset.active  = tab === 'login'  ? 'true' : 'false';
  document.getElementById('authTabSignup').dataset.active = tab === 'signup' ? 'true' : 'false';
  document.getElementById('loginForm').style.display  = tab === 'login'  ? 'flex' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'flex' : 'none';
}

function clearAuthErrors() {
  ['loginError', 'signupError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const btn      = document.getElementById('loginSubmit');

  btn.disabled = true; btn.textContent = 'Signing in...';
  try {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
    hideAuthModal();
  } catch (err) {
    errEl.textContent = err.message;
    btn.disabled = false; btn.textContent = 'SIGN IN';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const errEl    = document.getElementById('signupError');
  const btn      = document.getElementById('signupSubmit');

  btn.disabled = true; btn.textContent = 'Creating account...';
  try {
    const { data, error } = await getSupabase().auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) {
      // Email confirmation is off — user is immediately logged in
      hideAuthModal();
    } else {
      // Email confirmation is on — need to verify before logging in
      document.getElementById('signupForm').innerHTML =
        `<div style="padding:20px;text-align:center;color:var(--accent);font-size:12px;line-height:1.8;letter-spacing:1px;">
           Account created! Check your email for a confirmation link, then log in.
         </div>`;
    }
  } catch (err) {
    errEl.textContent = err.message;
    btn.disabled = false; btn.textContent = 'CREATE ACCOUNT';
  }
}

// ── Account menu ─────────────────────────────────────────────────────────────

function showAccountMenu() {
  document.getElementById('accountMenu').style.display = 'block';
}

function hideAccountMenu() {
  const m = document.getElementById('accountMenu');
  if (m) m.style.display = 'none';
}

async function handleSignOut() {
  hideAccountMenu();
  await getSupabase().auth.signOut();
}

// Close account menu when clicking anywhere outside it
document.addEventListener('click', e => {
  const menu    = document.getElementById('accountMenu');
  const trigger = document.getElementById('headerLoginBtn');
  if (menu && menu.style.display === 'block' && !menu.contains(e.target) && e.target !== trigger) {
    hideAccountMenu();
  }
});

// ── Stripe ────────────────────────────────────────────────────────────────────

async function handleUpgrade() {
  if (!currentUser) { showAuthModal('login'); return; }
  const btn = document.getElementById('upgradeBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
  try {
    const res  = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, email: currentUser.email }),
    });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; return; }
    throw new Error(data.error || 'Unknown error');
  } catch (err) {
    alert('Checkout unavailable: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'UPGRADE TO PRO — $5.99/MO'; }
  }
}

async function handleManageBilling() {
  hideAccountMenu();
  try {
    const res  = await fetch('/api/stripe/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id }),
    });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; return; }
    throw new Error(data.error || 'Unknown error');
  } catch (err) {
    alert('Billing portal unavailable: ' + err.message);
  }
}

// ── Feature gating ───────────────────────────────────────────────────────────
// What stays free is deliberate: anything that helps someone decide whether
// this tool is honest should cost nothing. Analysing a ticker, seeing today's
// scan, and reading the tracked outcomes — including the ones that went badly —
// are all free. You cannot ask people to pay to find out whether you are
// telling the truth.
//
// What is paid is the research machinery: the backtester, the strategy builder,
// and the portfolio simulator. Those are the things that take real work to run
// and that nobody else offers honestly.
//
// Gating is client-side. Someone determined can bypass it from a console, and
// that is a deliberate trade — a server-side check would mean routing every
// backtest through our own functions, which costs more than the subscription.

const PRO_FEATURES = {
  backtest:  { title: 'Backtesting',        blurb: 'Replay any strategy over 10 years of history, with transaction costs, train/test separation and significance testing that can tell you no.' },
  algolab:   { title: 'Algo Lab',           blurb: 'Build your own scoring algorithm, test it on a live ticker, and scan the whole universe with it.' },
  portfolio: { title: 'Portfolio simulator', blurb: 'See exactly what following every signal would have earned, day by day, against simply holding the index.' },
};

function hasPro() { return isSubscribed(); }

// Guard for actions. Returns true when allowed; otherwise explains and stops.
function requirePro(feature) {
  if (hasPro()) return true;
  showUpgradePrompt(feature);
  return false;
}

function showUpgradePrompt(feature) {
  const f = PRO_FEATURES[feature] || { title: 'This feature', blurb: '' };
  if (!currentUser) { showAuthModal('signup'); return; }
  handleUpgrade();
}

// Overlay any element marked data-pro="<feature>" when the user cannot use it.
function applyProGates() {
  const subscribed = hasPro();
  document.querySelectorAll('[data-pro]').forEach(host => {
    const feature = host.getAttribute('data-pro');
    const f = PRO_FEATURES[feature] || { title: 'Pro feature', blurb: '' };
    let veil = host.querySelector(':scope > .pro-veil');

    if (subscribed) { if (veil) veil.remove(); host.classList.remove('pro-gated'); return; }

    host.classList.add('pro-gated');
    if (veil) return;
    veil = document.createElement('div');
    veil.className = 'pro-veil';
    veil.innerHTML = `
      <div class="pro-veil-card">
        <div class="pro-veil-tag">PRO</div>
        <div class="pro-veil-title">🔒 ${f.title}</div>
        <div class="pro-veil-blurb">${f.blurb}</div>
        <button class="pro-veil-btn" onclick="handleUpgradeClick('${feature}')">
          ${currentUser ? 'UNLOCK — $5.99/MO' : 'CREATE ACCOUNT TO UNLOCK'}
        </button>
        <div class="pro-veil-foot">Cancel anytime · Analysis, scans and tracked outcomes stay free</div>
      </div>`;
    host.appendChild(veil);
  });
}

function handleUpgradeClick(feature) {
  if (!currentUser) { showAuthModal('signup'); return; }
  handleUpgrade();   // existing Stripe checkout flow
}
