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
  return currentSub?.status === 'active';
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

async function initAuth() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await loadSub();
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      currentUser = session.user;
      await loadSub();
    } else {
      currentUser = null;
      currentSub  = null;
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
  if (isSubscribed()) loadWatchlist();
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
    if (btn) { btn.disabled = false; btn.textContent = 'UPGRADE TO PRO — $9/MO'; }
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
