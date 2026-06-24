/* ================================================================
   SALES RECORD APP v2 — MAIN LOGIC
   Features: Firebase Realtime Database sync, table entry, sessions
   ================================================================ */

'use strict';

// ----------------------------------------------------------------
// CONSTANTS & STATE
// ----------------------------------------------------------------
const LS_KEY   = 'sr_sessions_v2';
const LS_LOCAL = 'sr_localMode';

let currentUser   = null;
let db            = null;      // Firebase Realtime Database ref
let auth          = null;
let dbListener    = null;      // Realtime DB listener ref (for cleanup)
let sessions      = [];        // [{id, name, date, status, items:[], expenses:[]}]
let isDirty       = false;
let currentAuthMode = 'login'; // 'login' | 'signup'

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
const fmt = n => 'KES ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const escH = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const todayStr  = () => new Date().toISOString().slice(0, 10);
const monthStr  = () => { const d = new Date(); return d.toISOString().slice(0,7); };
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0,10); };

function dateLbl(s) {
  if (!s) return '';
  try { return new Date(s + 'T12:00:00').toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric'}); }
  catch { return s; }
}
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  if (window.FIREBASE_ENABLED) {
    try {
      firebase.initializeApp(window.firebaseConfig);
      auth = firebase.auth();
      db   = firebase.database(); // Realtime Database — free, no billing needed

      auth.onAuthStateChanged(user => {
        if (user) {
          currentUser = user;
          onLoginSuccess(user);
        } else {
          showAuthScreen();
        }
      });
    } catch (e) {
      console.error('Firebase init error:', e);
      loadLocalMode();
    }
  } else {
    // Check if user opted for local mode previously
    const wasLocal = localStorage.getItem(LS_LOCAL);
    if (wasLocal) {
      loadLocalMode();
    } else {
      showAuthScreen();
    }
  }
});

// ----------------------------------------------------------------
// PWA INSTALLATION
// ----------------------------------------------------------------
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Make sure the button reflects installable state
  _updateInstallBtn();
});

// Called on app start — set button state correctly
function _updateInstallBtn() {
  const btnTop = document.getElementById('installBtnTop');
  const btnMob = document.getElementById('installBtnMobile');
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true; // iOS

  if (isInstalled) {
    // Running inside the installed app — show "Installed" state
    if (btnTop) {
      btnTop.innerHTML = '✓ <span class="install-label">Installed</span>';
      btnTop.style.background = 'linear-gradient(135deg,#065f46,#059669)';
      btnTop.style.cursor = 'default';
      btnTop.disabled = true;
    }
    if (btnMob) {
      btnMob.textContent = '✓ App Already Installed';
      btnMob.disabled = true;
      btnMob.style.opacity = '0.6';
    }
  } else {
    // Not installed — show normal install button
    if (btnTop) {
      btnTop.innerHTML = '⬇️ <span class="install-label">Install</span>';
      btnTop.style.background = '';
      btnTop.style.cursor = '';
      btnTop.disabled = false;
    }
    if (btnMob) {
      btnMob.textContent = '⬇️ Install App';
      btnMob.disabled = false;
      btnMob.style.opacity = '';
    }
  }
}

async function installPWA() {
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  if (isInstalled) {
    // Already running as installed app
    _showInstallToast('✓ This app is already installed on your device!', 'green');
    return;
  }

  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') {
      _updateInstallBtn();
      _showInstallToast('🎉 App installed! Open it from your home screen.', 'green');
    }
  } else {
    // No native prompt — give manual instructions
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      _showInstallToast('To install: tap the Share ↑ button in Safari, then "Add to Home Screen".', 'violet');
    } else {
      _showInstallToast('To install: tap ⋮ in your browser menu and select "Install app" or "Add to Home Screen".', 'violet');
    }
  }
}

function _showInstallToast(msg, color) {
  let toast = document.getElementById('installToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'installToast';
    toast.style.cssText = `
      position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
      z-index:9999; padding:13px 22px; border-radius:14px;
      font-family:'Inter',sans-serif; font-size:0.88rem; font-weight:600;
      max-width:90vw; text-align:center; box-shadow:0 8px 30px rgba(0,0,0,0.18);
      transition: opacity 0.4s;
    `;
    document.body.appendChild(toast);
  }
  const colors = {
    green:  { bg:'#059669', text:'#fff' },
    violet: { bg:'#7c3aed', text:'#fff' }
  };
  const c = colors[color] || colors.violet;
  toast.style.background = c.bg;
  toast.style.color = c.text;
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 5000);
}

// Set button state on load
window.addEventListener('DOMContentLoaded', () => {
  _updateInstallBtn();
});

// ----------------------------------------------------------------
// AUTH SCREEN
// ----------------------------------------------------------------
function showAuthScreen() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  if (!window.FIREBASE_ENABLED) {
    // Hide sign-in form, just show local option prominently
    document.getElementById('authForm').classList.add('hidden');
    document.querySelector('.auth-tabs').classList.add('hidden');
    document.querySelector('.auth-local').style.marginTop = '0';
  }
}

function switchAuthTab(mode) {
  currentAuthMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('signupNameRow').classList.toggle('hidden', mode === 'login');
  document.getElementById('authSubmitBtn').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('authError').classList.add('hidden');
}

async function handleAuth(e) {
  e.preventDefault();
  if (!window.FIREBASE_ENABLED || !auth) return;

  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const remember = document.getElementById('rememberMe')?.checked !== false;
  const errEl    = document.getElementById('authError');
  const btn      = document.getElementById('authSubmitBtn');
  btn.textContent = 'Please wait...'; btn.disabled = true;
  errEl.classList.add('hidden');

  try {
    // Set persistence based on Remember Me
    const persistence = remember
      ? firebase.auth.Auth.Persistence.LOCAL    // stays logged in after browser close
      : firebase.auth.Auth.Persistence.SESSION; // logs out when tab/browser closes
    await auth.setPersistence(persistence);

    if (currentAuthMode === 'signup') {
      await auth.createUserWithEmailAndPassword(email, password);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
    // onAuthStateChanged will call onLoginSuccess
  } catch (err) {
    let msg = err.message;
    if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') msg = 'Incorrect email or password.';
    if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered. Try signing in.';
    if (err.code === 'auth/weak-password') msg = 'Password must be at least 6 characters.';
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
    btn.textContent = currentAuthMode === 'login' ? 'Sign In' : 'Create Account';
    btn.disabled = false;
  }
}

function useLocalMode() {
  localStorage.setItem(LS_LOCAL, '1');
  loadLocalMode();
}

function loadLocalMode() {
  currentUser = null;
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userAvatar').textContent = '👤';
  document.getElementById('userName').textContent   = 'Local';
  document.getElementById('logoutBtn').title = 'Clear local data';
  document.getElementById('syncBadge').textContent  = '● Local';
  document.getElementById('syncBadge').classList.remove('synced');
  if (!window.FIREBASE_ENABLED) {
    document.getElementById('setupNotice').classList.remove('hidden');
  }
  sessions = loadLocalSessions();
  initApp();
}

function onLoginSuccess(user) {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const initial = (user.displayName || user.email || '?').charAt(0).toUpperCase();
  document.getElementById('userAvatar').textContent = initial;
  document.getElementById('userName').textContent   = user.displayName || user.email.split('@')[0];
  document.getElementById('syncBadge').textContent  = '● Synced';
  document.getElementById('syncBadge').classList.add('synced');
  startDatabaseListener(user.uid);
}

function startDatabaseListener(uid) {
  // Remove old listener if exists
  if (dbListener) {
    dbListener.ref.off('value', dbListener.fn);
    dbListener = null;
  }
  const ref  = db.ref('users/' + uid + '/sessions');
  const fn   = ref.on('value', snap => {
    const data = snap.val() || {};
    sessions = Object.entries(data)
      .map(([id, val]) => ({ id, ...val }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    initApp();
  }, err => {
    console.error('Realtime DB error:', err);
    sessions = loadLocalSessions();
    initApp();
  });
  dbListener = { ref, fn };
}

async function handleLogout() {
  if (currentUser && auth) {
    try { await auth.signOut(); } catch {}
  }
  localStorage.removeItem(LS_LOCAL);
  sessions = [];
  if (dbListener) { dbListener.ref.off('value', dbListener.fn); dbListener = null; }
  currentUser = null;
  showAuthScreen();
}

// ----------------------------------------------------------------
// CLEAR ALL DATA
// ----------------------------------------------------------------
function confirmClearData() {
  const input = document.getElementById('clearDataConfirmInput');
  if (input) input.value = '';
  document.getElementById('clearDataModal').classList.remove('hidden');
}

function closeClearDataModal() {
  document.getElementById('clearDataModal').classList.add('hidden');
}

async function executeClearData() {
  const input = document.getElementById('clearDataConfirmInput');
  if (!input || input.value.trim().toUpperCase() !== 'DELETE') {
    input.style.borderColor = 'var(--rose2)';
    input.placeholder = 'You must type DELETE exactly';
    setTimeout(() => { input.style.borderColor = ''; }, 2000);
    return;
  }

  // Wipe Firebase data for this user
  if (currentUser && db) {
    try {
      await db.ref('users/' + currentUser.uid + '/sessions').remove();
    } catch (e) {
      console.error('Firebase clear error:', e);
    }
  }

  // Wipe all local storage
  localStorage.clear();

  // Close modal and reload fresh
  closeClearDataModal();
  window.location.reload();
}

// ----------------------------------------------------------------
// LOCAL STORAGE LAYER
// ----------------------------------------------------------------
function loadLocalSessions() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch { return []; }
}
function saveLocalSessions() {
  localStorage.setItem(LS_KEY, JSON.stringify(sessions));
}

// ----------------------------------------------------------------
// SESSION HELPERS
// ----------------------------------------------------------------
function getActiveSession() {
  return sessions.find(s => s.status === 'active') || null;
}
function getAllItems() {
  return sessions.flatMap(s => (s.items || []).map(i => ({ ...i, sessionId: s.id, sessionName: s.name })));
}
function getAllExpenses() {
  return sessions.flatMap(s => (s.expenses || []).map(e => ({ ...e, sessionId: s.id, sessionName: s.name })));
}

// ----------------------------------------------------------------
// APP INIT — called after sessions are loaded
// ----------------------------------------------------------------
function initApp() {
  ensureActiveSession();
  renderDashboard();
  showPage('dashboard');
}

function ensureActiveSession() {
  if (!getActiveSession()) {
    const now  = new Date();
    const name = `Session — ${now.toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric'})}`;
    const sess = { id: uid(), name, date: todayStr(), status: 'active', items: [], expenses: [], createdAt: Date.now() };
    sessions.unshift(sess);
    persistSession(sess);
  } else {
    // Ensure expenses array exists on older sessions
    const active = getActiveSession();
    if (!active.expenses) active.expenses = [];
  }
}

// ----------------------------------------------------------------
// PERSIST SESSION (Realtime Database or localStorage)
// ----------------------------------------------------------------
async function persistSession(sess) {
  if (currentUser && db) {
    try {
      await db.ref('users/' + currentUser.uid + '/sessions/' + sess.id).set(sess);
    } catch (e) {
      console.error('Persist error:', e); saveLocalSessions();
    }
  } else {
    saveLocalSessions();
  }
}

// ----------------------------------------------------------------
// NAVIGATION
// ----------------------------------------------------------------
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bottom-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  // Sync top nav
  document.querySelector(`.nav-btn[data-page="${page}"]`)?.classList.add('active');
  // Sync bottom tab bar
  document.querySelector(`.bottom-tab-btn[data-page="${page}"]`)?.classList.add('active');
  if (page === 'dashboard') renderDashboard();
  if (page === 'expenses')  renderExpensesTable();
  if (page === 'history')   renderHistory();
  if (page === 'debt')      renderDebtPage();
  if (page === 'reports')   renderReports();
}

function toggleMobileNav() {
  document.getElementById('mobileNav').classList.toggle('open');
}

// ----------------------------------------------------------------
// DASHBOARD — STATS
// ----------------------------------------------------------------
function renderDashboard() {
  const active = getActiveSession();
  const all    = getAllItems();

  // Session sales
  const sessItems    = active ? (active.items    || []) : [];
  const sessExpenses = active ? (active.expenses || []) : [];
  const sessTotal    = sessItems.reduce((a, b)    => a + (b.total || 0), 0);
  const sessCost     = sessExpenses.reduce((a, b) => a + (b.total || 0), 0);
  const sessProfit   = sessTotal - sessCost;
  const totalRemaining = sessItems.reduce((a, b) => a + (b.remainingQty || 0), 0);

  document.getElementById('sdSessionTotal').textContent    = fmt(sessTotal);
  document.getElementById('sdSessionExpenses').textContent = fmt(sessCost);
  document.getElementById('sdSessionProfit').textContent   = fmt(sessProfit);
  document.getElementById('sdSessionProfit').style.color   =
    sessProfit >= 0 ? '#059669' : '#e11d48';
  document.getElementById('sessionNameBadge').textContent  = active ? active.name : 'No active session';
  const remEl = document.getElementById('sdRemaining');
  if (remEl) remEl.textContent = totalRemaining > 0 ? totalRemaining + ' units' : '0 units';

  // All time
  document.getElementById('sdAllTime').textContent = fmt(all.reduce((a, b) => a + (b.total || 0), 0));

  renderEntryTable();
}

// ----------------------------------------------------------------
// INLINE ENTRY TABLE
// ----------------------------------------------------------------
function renderEntryTable() {
  const active = getActiveSession();
  const items  = active ? (active.items || []) : [];
  const tbody  = document.getElementById('entryBody');

  if (!items.length) {
    // Start with 3 blank rows
    active.items = [blankRow(), blankRow(), blankRow()];
  }

  tbody.innerHTML = '';
  (active.items || []).forEach((item, i) => appendRowEl(item, i));
  updateGrandTotal();
}

function blankRow() {
  return {
    id: uid(), date: todayStr(),
    item: '', category: 'General', qty: '', unitPrice: '', total: 0, paid: 0, debt: 0,
    payment: 'Cash', customer: '', notes: '',
    openingQty: 0, newStockQty: 0, remainingQty: 0
  };
}

function appendRowEl(item, idx) {
  const tbody = document.getElementById('entryBody');
  const tr    = document.createElement('tr');
  tr.dataset.id = item.id;

  const cats = ['General','Food & Beverages','Clothing','Electronics','Services','Farming','Other'];
  const pays = ['Cash','Mpesa','Bank Transfer','Credit','Split'];

  const catOpts = cats.map(c => `<option value="${c}" ${item.category===c?'selected':''}>${c}</option>`).join('');
  const payOpts = pays.map(p => `<option value="${p}" ${item.payment===p?'selected':''}>${p}</option>`).join('');
  const isSplit    = item.payment === 'Split';
  const openingVal = item.openingQty  || '';
  const newStockVal= item.newStockQty || '';
  const available  = (item.openingQty||0) + (item.newStockQty||0);
  const remaining  = Math.max(0, available - (parseFloat(item.qty)||0));
  const hasStock   = available > 0;
  const remClass   = remaining > 0 ? 'remaining-badge' : 'remaining-badge remaining-zero';

  tr.innerHTML = `
    <td class="col-num" data-label="#">${idx + 1}</td>
    <td class="col-item" data-label="Item">
      <input class="cell-input" type="text" placeholder="Item name..." value="${escH(item.item)}"
        onchange="updateCell(this,'item')" oninput="markDirty()"/>
    </td>
    <td class="col-cat" data-label="Category">
      <select class="cell-select" onchange="updateCell(this,'category')">
        ${catOpts}
      </select>
    </td>
    <td class="col-open" data-label="Opening Stock">
      <input class="cell-input stock-input" type="number" placeholder="0" value="${openingVal}" min="0" step="any"
        title="Opening stock (carry-over from yesterday)"
        oninput="updateStockField(this,'openingQty','${item.id}')" />
    </td>
    <td class="col-newstock" data-label="New Stock">
      <input class="cell-input stock-input" type="number" placeholder="0" value="${newStockVal}" min="0" step="any"
        title="New stock added today"
        oninput="updateStockField(this,'newStockQty','${item.id}')" />
    </td>
    <td class="col-qty" data-label="Qty Sold">
      <input class="cell-input" type="number" placeholder="0" value="${item.qty||''}" min="0" step="any"
        onchange="updateCell(this,'qty'); calcRowTotal(this)" oninput="calcRowTotal(this); markDirty()"/>
    </td>
    <td class="col-remain" data-label="Remaining">
      <span class="${remClass}" id="rem-${item.id}">${hasStock ? remaining : '—'}</span>
    </td>
    <td class="col-price" data-label="Selling Price">
      <input class="cell-input" type="number" placeholder="0.00" value="${item.unitPrice||''}" min="0" step="any"
        onchange="updateCell(this,'unitPrice'); calcRowTotal(this)" oninput="calcRowTotal(this); markDirty()"/>
    </td>
    <td class="col-total" data-label="Total">
      <span class="cell-total" id="rt-${item.id}">${item.total ? fmt(item.total) : '—'}</span>
    </td>
    <td class="col-paid" data-label="Paid">
      <input class="cell-input paid-input" type="number" placeholder="0" value="${item.paid||''}" min="0" step="any"
        id="paid-${item.id}"
        oninput="calcDebtFromPaid(this,'${item.id}'); markDirty()"/>
    </td>
    <td class="col-debt" data-label="Debt">
      <input class="cell-input debt-input" type="number" placeholder="0" value="${item.debt||''}" min="0" step="any"
        id="rd-${item.id}"
        oninput="calcPaidFromDebt(this,'${item.id}'); markDirty()"/>
    </td>
    <td class="col-pay" data-label="Payment">
      <select class="cell-select" onchange="updateCell(this,'payment')">
        ${payOpts}
      </select>
    </td>
    <td class="col-cust" data-label="Customer/Note">
      <input class="cell-input" type="text" placeholder="Optional note..." value="${escH(item.customer)}"
        onchange="updateCell(this,'customer')" oninput="markDirty()"/>
    </td>
    <td class="col-del" data-label="">
      <button class="del-btn" onclick="deleteRow('${item.id}')" title="Delete row">🗑</button>
    </td>
  `;
  tbody.appendChild(tr);

  // Tab on last cell of last row → add new row
  const lastInput = tr.querySelector('.col-cust input');
  lastInput.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey) {
      const rows = document.querySelectorAll('#entryBody tr');
      if (tr === rows[rows.length - 1]) { e.preventDefault(); addRow(); }
    }
    if (e.key === 'Enter') { e.preventDefault(); addRow(); }
  });
}

function toggleSplitFields(sel, itemId) {
  const sf = document.getElementById('sf-' + itemId);
  if (sf) sf.classList.toggle('hidden', sel.value !== 'Split');
}

// function updateSplitAmt removed

function updateStockField(el, field, itemId) {
  const active = getActiveSession();
  const item   = active?.items?.find(i => i.id === itemId);
  if (!item) return;
  item[field] = parseFloat(el.value) || 0;
  // Recompute remaining live
  const available  = (item.openingQty||0) + (item.newStockQty||0);
  const sold       = parseFloat(item.qty) || 0;
  item.remainingQty = Math.max(0, available - sold);
  const remSpan = document.getElementById('rem-' + itemId);
  if (remSpan) {
    remSpan.textContent = available > 0 ? item.remainingQty : '—';
    remSpan.className   = item.remainingQty > 0 ? 'remaining-badge' : 'remaining-badge remaining-zero';
  }
  updateRemainingTotal();
  markDirty();
}

function updateCell(el, field) {
  const tr    = el.closest('tr');
  const rowId = tr.dataset.id;
  const active = getActiveSession();
  if (!active) return;
  const item = active.items.find(i => i.id === rowId);
  if (item) { 
    item[field] = el.tagName === 'SELECT' ? el.value : (parseFloat(el.value) || el.value); 
    if (field === 'payment') {
      // Simplified: no split fields to toggle
    }
    calcRowDebt(item, rowId);
    updateGrandTotal();
    markDirty(); 
  }
}

function calcRowTotal(el) {
  const tr    = el.closest('tr');
  const rowId = tr.dataset.id;
  const active = getActiveSession();
  if (!active) return;
  const item = active.items.find(i => i.id === rowId);
  if (!item) return;

  const qty   = parseFloat(tr.querySelector('.col-qty input').value)   || 0;
  const price = parseFloat(tr.querySelector('.col-price input').value) || 0;
  const total = qty * price;
  item.qty       = qty;
  item.unitPrice = price;
  item.total     = total;

  // Update remaining live
  const available    = (item.openingQty||0) + (item.newStockQty||0);
  item.remainingQty  = Math.max(0, available - qty);
  const remSpan = document.getElementById('rem-' + rowId);
  if (remSpan) {
    remSpan.textContent = available > 0 ? item.remainingQty : '—';
    remSpan.className   = item.remainingQty > 0 ? 'remaining-badge' : 'remaining-badge remaining-zero';
  }

  const tSpan = document.getElementById('rt-' + rowId);
  if (tSpan) tSpan.textContent = total ? fmt(total) : '—';
  
  calcRowDebt(item, rowId);
  updateGrandTotal();
  updateRemainingTotal();
}

// Called when user types into the PAID input → auto-compute DEBT
function calcDebtFromPaid(paidEl, rowId) {
  const tr     = paidEl.closest('tr');
  const active = getActiveSession();
  if (!active) return;
  const item   = active.items.find(i => i.id === rowId);
  if (!item) return;

  const total  = parseFloat(item.total) || 0;
  const paid   = parseFloat(paidEl.value) || 0;
  const debt   = Math.max(0, total - paid);

  item.paid = paid;
  item.debt = debt;

  const debtEl = document.getElementById('rd-' + rowId);
  if (debtEl) debtEl.value = debt || '';
  updateGrandTotal();
}

// Called when user types into the DEBT input → auto-compute PAID
function calcPaidFromDebt(debtEl, rowId) {
  const tr     = debtEl.closest('tr');
  const active = getActiveSession();
  if (!active) return;
  const item   = active.items.find(i => i.id === rowId);
  if (!item) return;

  const total  = parseFloat(item.total) || 0;
  const debt   = parseFloat(debtEl.value) || 0;
  const paid   = Math.max(0, total - debt);

  item.debt = debt;
  item.paid = paid;

  const paidEl = document.getElementById('paid-' + rowId);
  if (paidEl) paidEl.value = paid || '';
  updateGrandTotal();
}

// Legacy helper kept for compat
function calcRowDebt(item, rowId) {
  const total = parseFloat(item.total) || 0;
  const paid  = parseFloat(item.paid)  || 0;
  const debt  = Math.max(0, total - paid);
  item.debt = debt;
  const dEl = document.getElementById('rd-' + rowId);
  if (dEl) dEl.value = debt || '';
}


function updateGrandTotal() {
  const active = getActiveSession();
  const items = active?.items || [];
  const total  = items.reduce((a, b) => a + (parseFloat(b.total) || 0), 0);
  const totalPaid = items.reduce((a, b) => a + (parseFloat(b.paid) || 0), 0);
  const totalDebt = items.reduce((a, b) => a + (parseFloat(b.debt) || 0), 0);
  
  document.getElementById('grandTotal').textContent = fmt(total);
  document.getElementById('grandPaid').textContent  = fmt(totalPaid);
  document.getElementById('grandDebt').textContent  = fmt(totalDebt);
  document.getElementById('sdSessionTotal').textContent = fmt(total);
  document.getElementById('sdSessionDebt').textContent  = fmt(totalDebt);
  
  // Recalculate net profit
  const cost   = (active?.expenses || []).reduce((a, b) => a + (b.total || 0), 0);
  const profit = total - cost;
  document.getElementById('sdSessionExpenses').textContent = fmt(cost);
  document.getElementById('sdSessionProfit').textContent   = fmt(profit);
  document.getElementById('sdSessionProfit').style.color   = profit >= 0 ? '#059669' : '#e11d48';
}

function updateRemainingTotal() {
  const active = getActiveSession();
  const totalRemaining = (active?.items || []).reduce((a, b) => a + (b.remainingQty || 0), 0);
  const el = document.getElementById('sdRemaining');
  if (el) el.textContent = totalRemaining > 0 ? totalRemaining + ' units' : '0 units';
}

function addRow() {
  const active = getActiveSession();
  if (!active) return;
  const row = blankRow();
  active.items.push(row);
  const idx = active.items.length - 1;
  appendRowEl(row, idx);
  updateRowNumbers();
  // Focus the new row's first input
  const rows = document.querySelectorAll('#entryBody tr');
  const newRow = rows[rows.length - 1];
  newRow?.querySelector('.cell-input')?.focus();
  markDirty();
}

function deleteRow(id) {
  const active = getActiveSession();
  if (!active) return;
  active.items = active.items.filter(i => i.id !== id);
  document.querySelector(`#entryBody tr[data-id="${id}"]`)?.remove();
  updateRowNumbers();
  updateGrandTotal();
  markDirty();
}

function updateRowNumbers() {
  document.querySelectorAll('#entryBody tr').forEach((tr, i) => {
    tr.querySelector('.col-num').textContent = i + 1;
  });
}

function markDirty() {
  isDirty = true;
  const el = document.getElementById('saveStatus');
  if (el) { el.textContent = '● Unsaved changes'; el.className = 'save-status'; }
}

// ----------------------------------------------------------------
// SAVE DRAFT
// ----------------------------------------------------------------
async function saveDraft() {
  const active = getActiveSession();
  if (!active) return;
  document.querySelectorAll('#entryBody tr').forEach(tr => {
    const rowId = tr.dataset.id;
    const item  = active.items.find(i => i.id === rowId);
    if (!item) return;
    const inputs  = tr.querySelectorAll('.cell-input');
    item.item      = inputs[0]?.value || '';
    // stock inputs
    const stockInputs = tr.querySelectorAll('.stock-input');
    item.openingQty  = parseFloat(stockInputs[0]?.value) || 0;
    item.newStockQty = parseFloat(stockInputs[1]?.value) || 0;
    item.qty         = parseFloat(tr.querySelector('.col-qty input')?.value) || 0;
    item.unitPrice   = parseFloat(tr.querySelector('.col-price input')?.value) || 0;
    item.total       = item.qty * item.unitPrice;
    // Read debt directly from the debt input (user may have typed it)
    const debtInputEl = document.getElementById('rd-' + rowId);
    const paidInputEl = document.getElementById('paid-' + rowId);
    const debtVal  = parseFloat(debtInputEl?.value) || 0;
    const paidVal  = parseFloat(paidInputEl?.value) || 0;
    // Reconcile: use whichever was entered; debt takes priority if both filled
    item.debt        = Math.min(debtVal, item.total);
    item.paid        = Math.max(0, item.total - item.debt);
    item.remainingQty = Math.max(0, (item.openingQty + item.newStockQty) - item.qty);
    item.customer    = tr.querySelector('.col-cust input')?.value || '';
    const selects    = tr.querySelectorAll('.cell-select');
    item.category    = selects[0]?.value || 'General';
    item.payment     = selects[1]?.value || 'Cash';
    item.date     = todayStr();

  });
  await persistSession(active);
  isDirty = false;
  const el = document.getElementById('saveStatus');
  if (el) { el.textContent = '✓ Saved'; el.className = 'save-status saved'; }
  setTimeout(() => { if (el) { el.textContent = '● All changes saved'; el.className = 'save-status saved'; } }, 2000);
  renderDashboard();
}

// ----------------------------------------------------------------
// EXPENSES TABLE
// ----------------------------------------------------------------
function blankExpenseRow() {
  return { id: uid(), date: todayStr(), name: '', category: 'Stock Purchase', qty: '', unitCost: '', total: 0, notes: '' };
}

function renderExpensesTable() {
  const active = getActiveSession();
  if (!active) return;
  if (!active.expenses || !active.expenses.length) {
    active.expenses = [blankExpenseRow(), blankExpenseRow(), blankExpenseRow()];
  }
  const tbody = document.getElementById('expBody');
  tbody.innerHTML = '';
  active.expenses.forEach((exp, i) => appendExpenseRowEl(exp, i));
  updateExpenseTotal();
  const badge = document.getElementById('expSessionBadge');
  if (badge) badge.textContent = active.name;
}

function appendExpenseRowEl(exp, idx) {
  const tbody = document.getElementById('expBody');
  const tr    = document.createElement('tr');
  tr.dataset.id = exp.id;

  const cats = ['Stock Purchase','Transport','Wages / Labour','Rent','Utilities','Equipment','Other Expense'];
  const catOpts = cats.map(c => `<option value="${c}" ${exp.category===c?'selected':''}>${c}</option>`).join('');

  tr.innerHTML = `
    <td class="col-num">${idx + 1}</td>
    <td class="col-item">
      <input class="cell-input" type="text" placeholder="e.g. Maize Stock, Rent..." value="${escH(exp.name)}"
        onchange="updateExpCell(this,'name')" oninput="markExpDirty()"/>
    </td>
    <td class="col-ecat">
      <select class="cell-select" onchange="updateExpCell(this,'category')">
        ${catOpts}
      </select>
    </td>
    <td class="col-qty">
      <input class="cell-input" type="number" placeholder="1" value="${exp.qty||''}" min="0" step="any"
        onchange="updateExpCell(this,'qty'); calcExpRowTotal(this)" oninput="calcExpRowTotal(this); markExpDirty()"/>
    </td>
    <td class="col-price">
      <input class="cell-input" type="number" placeholder="0.00" value="${exp.unitCost||''}" min="0" step="any"
        onchange="updateExpCell(this,'unitCost'); calcExpRowTotal(this)" oninput="calcExpRowTotal(this); markExpDirty()"/>
    </td>
    <td class="col-total">
      <span class="cell-total exp-total-cell" id="et-${exp.id}">${exp.total ? fmt(exp.total) : '—'}</span>
    </td>
    <td class="col-cust">
      <input class="cell-input" type="text" placeholder="Notes (optional)" value="${escH(exp.notes)}"
        onchange="updateExpCell(this,'notes')" oninput="markExpDirty()"/>
    </td>
    <td class="col-del">
      <button class="del-btn" onclick="deleteExpenseRow('${exp.id}')" title="Delete row">🗑</button>
    </td>
  `;
  tbody.appendChild(tr);

  // Enter on last input adds new row
  tr.querySelector('.col-cust input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addExpenseRow(); }
    if (e.key === 'Tab' && !e.shiftKey) {
      const rows = document.querySelectorAll('#expBody tr');
      if (tr === rows[rows.length - 1]) { e.preventDefault(); addExpenseRow(); }
    }
  });
}

function updateExpCell(el, field) {
  const rowId  = el.closest('tr').dataset.id;
  const active = getActiveSession();
  const exp    = active?.expenses?.find(e => e.id === rowId);
  if (exp) { exp[field] = el.value; markExpDirty(); }
}

function calcExpRowTotal(el) {
  const tr    = el.closest('tr');
  const rowId = tr.dataset.id;
  const active = getActiveSession();
  const exp    = active?.expenses?.find(e => e.id === rowId);
  if (!exp) return;
  const qty      = parseFloat(tr.querySelector('.col-qty input').value)   || 0;
  const unitCost = parseFloat(tr.querySelector('.col-price input').value) || 0;
  const total    = qty * unitCost || unitCost; // if no qty, use unit cost as flat amount
  exp.qty      = qty;
  exp.unitCost = unitCost;
  exp.total    = total;
  const span = document.getElementById('et-' + rowId);
  if (span) span.textContent = total ? fmt(total) : '—';
  updateExpenseTotal();
}

function updateExpenseTotal() {
  const active = getActiveSession();
  const total  = (active?.expenses || []).reduce((a, b) => a + (b.total || 0), 0);
  const el = document.getElementById('grandExpense');
  if (el) el.textContent = fmt(total);
  // Update dashboard
  const salesTotal = (active?.items || []).reduce((a, b) => a + (b.total || 0), 0);
  const profit     = salesTotal - total;
  const expEl  = document.getElementById('sdSessionExpenses');
  const profEl = document.getElementById('sdSessionProfit');
  if (expEl)  expEl.textContent  = fmt(total);
  if (profEl) {
    profEl.textContent  = fmt(profit);
    profEl.style.color  = profit >= 0 ? '#059669' : '#e11d48';
  }
}

function addExpenseRow() {
  const active = getActiveSession();
  if (!active) return;
  if (!active.expenses) active.expenses = [];
  const row = blankExpenseRow();
  active.expenses.push(row);
  appendExpenseRowEl(row, active.expenses.length - 1);
  document.querySelectorAll('#expBody tr').forEach((tr, i) => { tr.querySelector('.col-num').textContent = i + 1; });
  document.querySelectorAll('#expBody tr')[active.expenses.length - 1]?.querySelector('.cell-input')?.focus();
  markExpDirty();
}

function deleteExpenseRow(id) {
  const active = getActiveSession();
  if (!active) return;
  active.expenses = active.expenses.filter(e => e.id !== id);
  document.querySelector(`#expBody tr[data-id="${id}"]`)?.remove();
  document.querySelectorAll('#expBody tr').forEach((tr, i) => { tr.querySelector('.col-num').textContent = i + 1; });
  updateExpenseTotal();
  markExpDirty();
}

function markExpDirty() {
  const el = document.getElementById('expSaveStatus');
  if (el) { el.textContent = '● Unsaved changes'; el.className = 'save-status'; }
}

async function saveExpenses() {
  const active = getActiveSession();
  if (!active) return;
  // Sync from DOM
  document.querySelectorAll('#expBody tr').forEach(tr => {
    const rowId = tr.dataset.id;
    const exp   = active.expenses?.find(e => e.id === rowId);
    if (!exp) return;
    const inputs = tr.querySelectorAll('.cell-input');
    exp.name     = inputs[0]?.value || '';
    exp.qty      = parseFloat(inputs[1]?.value) || 0;
    exp.unitCost = parseFloat(inputs[2]?.value) || 0;
    exp.total    = exp.qty * exp.unitCost || exp.unitCost;
    exp.notes    = inputs[3]?.value || '';
    exp.category = tr.querySelector('.cell-select')?.value || 'Stock Purchase';
    exp.date     = todayStr();
  });
  await persistSession(active);
  const el = document.getElementById('expSaveStatus');
  if (el) { el.textContent = '✓ Saved'; el.className = 'save-status saved'; }
  setTimeout(() => { if (el) { el.textContent = '● All changes saved'; el.className = 'save-status saved'; } }, 2000);
  updateExpenseTotal();
}

// ----------------------------------------------------------------
// SESSION MANAGEMENT
// ----------------------------------------------------------------
function confirmEndSession() {
  const active = getActiveSession();
  const suggestion = active ? active.name : `Session — ${dateLbl(todayStr())}`;
  document.getElementById('sessionNameInput').value = suggestion;
  document.getElementById('endSessionModal').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('endSessionModal').classList.add('hidden');
}

async function endSession() {
  await saveDraft();
  await saveExpenses();
  const active = getActiveSession();
  if (!active) { closeModal(); return; }

  // Build templates: carry remaining stock as next day's opening, reset new stock & sold qty
  const itemTemplate = (active.items || []).filter(i => i.item).map(i => {
    const available = (i.openingQty||0) + (i.newStockQty||0);
    const sold      = parseFloat(i.qty) || 0;
    const carryOver = Math.max(0, available - sold);
    return {
      id: uid(), date: todayStr(),
      item: i.item, category: i.category,
      openingQty: carryOver,   // yesterday's remaining becomes today's opening
      newStockQty: 0,          // reset — user enters fresh stock for new day
      remainingQty: carryOver, // starts equal to opening until sales are entered
      qty: '', unitPrice: i.unitPrice || '', total: 0, paid: 0, debt: 0,
      payment: i.payment,
      customer: '', notes: ''
    };
  });

  const expTemplate = (active.expenses || []).filter(e => e.name).map(e => ({
    id: uid(), date: todayStr(),
    name: e.name, category: e.category,
    qty: '', unitCost: '', total: 0, notes: ''
  }));

  const name = document.getElementById('sessionNameInput').value.trim() || active.name;
  active.name     = name;
  active.status   = 'archived';
  active.closedAt = Date.now();
  await persistSession(active);

  // Start fresh session with carry-over opening stock
  const now  = new Date();
  const newS = {
    id: uid(),
    name: `Session — ${now.toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric'})}`,
    date: todayStr(), status: 'active',
    items:    itemTemplate.length ? itemTemplate : [],
    expenses: expTemplate.length  ? expTemplate  : [],
    createdAt: Date.now()
  };
  sessions.unshift(newS);
  await persistSession(newS);

  closeModal();
  renderDashboard();
}

// ----------------------------------------------------------------
// HISTORY PAGE
// ----------------------------------------------------------------
function renderHistory() {
  const search = (document.getElementById('histSearch')?.value || '').toLowerCase();
  const from   = document.getElementById('hFrom')?.value || '';
  const to     = document.getElementById('hTo')?.value   || '';
  const cat    = document.getElementById('hCat')?.value  || '';
  const pay    = document.getElementById('hPay')?.value  || '';

  const archived = sessions.filter(s => s.status === 'archived' || !s.status || s.status === 'active');
  const el = document.getElementById('historyContent');

  if (!archived.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No sessions yet</div><div class="empty-sub">End your current session to archive it here</div></div>`;
    return;
  }

  let html = '';
  archived.forEach(sess => {
    let items = (sess.items || []).filter(i => {
      if (from && i.date < from) return false;
      if (to   && i.date > to)   return false;
      if (cat  && i.category !== cat) return false;
      if (pay  && i.payment  !== pay) return false;
      if (search && ![i.item,i.customer,i.category,i.payment].join(' ').toLowerCase().includes(search)) return false;
      return true;
    });
    if (!items.length && (search||from||to||cat||pay)) return;

    const sessTotal = items.reduce((a, b) => a + (b.total || 0), 0);
    const isActive  = sess.status === 'active';
    const badge     = isActive ? `<span style="background:var(--teal-dim);color:var(--teal);border:1px solid var(--teal-glow);border-radius:20px;padding:2px 10px;font-size:.68rem;font-weight:700;margin-left:8px;">ACTIVE</span>` : '';
    const rows      = items.map(i => `
      <tr>
        <td>${dateLbl(i.date)}</td>
        <td><strong>${escH(i.item)}</strong>${i.customer?`<br><span style="font-size:.72rem;color:var(--text-muted)">${escH(i.customer)}</span>`:''}</td>
        <td>${escH(i.category)}</td>
        <td>${i.qty||0}</td>
        <td>${fmt(i.unitPrice)}</td>
        <td class="hist-amount">${fmt(i.total)}</td>
        <td class="hist-amount" style="color:var(--sky2)">${fmt(i.paid)}</td>
        <td class="hist-amount" style="color:var(--rose2)">${fmt(i.debt)}</td>
        <td><span class="pay-pill pay-${(i.payment||'Cash').split(' ')[0]}">${escH(i.payment||'Cash')}</span></td>
      </tr>`).join('');

    html += `
      <div class="session-block">
        <div class="session-block-header" onclick="toggleSession(this)">
          <div class="session-block-title">
            📁 ${escH(sess.name)}${badge}
          </div>
          <span class="session-total-badge">${fmt(sessTotal)} • ${items.length} item${items.length!==1?'s':''}</span>
        </div>
        <div class="session-block-body">
          ${items.length ? `
          <table class="hist-table">
            <thead><tr>
              <th>Date</th><th>Item</th><th>Category</th><th>Qty</th><th>Price</th><th>Total</th><th>Paid</th><th>Debt</th><th>Pay</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>` : `<div class="empty" style="padding:24px"><div class="empty-text">No items in this session</div></div>`}
        </div>
      </div>`;
  });

  el.innerHTML = html || `<div class="empty"><div class="empty-icon">🔍</div><div class="empty-text">No results found</div><div class="empty-sub">Try adjusting your filters</div></div>`;
}

function toggleSession(header) {
  const body = header.nextElementSibling;
  body.classList.toggle('collapsed');
}

function clearFilters() {
  ['histSearch','hFrom','hTo','hCat','hPay'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderHistory();
}

// ----------------------------------------------------------------
// REPORTS PAGE
// ----------------------------------------------------------------
function renderReports() {
  const all = getAllItems();

  if (!all.length) {
    ['rBestDay','rBestItem','rTopPay','rAvg'].forEach(id => document.getElementById(id).textContent = '—');
    ['chartDaily','chartCategory','chartPayment'].forEach(id => {
      document.getElementById(id).innerHTML = `<div class="empty"><div class="empty-icon">📊</div><div class="empty-text">No data yet</div></div>`;
    });
    return;
  }

  // Best day
  const byDay = {};
  all.forEach(i => { byDay[i.date] = (byDay[i.date]||0) + (i.total||0); });
  const bestDay = Object.entries(byDay).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('rBestDay').textContent    = bestDay ? dateLbl(bestDay[0]) : '—';
  document.getElementById('rBestDayAmt').textContent = bestDay ? fmt(bestDay[1]) : '';

  // Best item (by quantity)
  const byItem = {};
  all.forEach(i => { if(i.item) byItem[i.item] = (byItem[i.item]||0) + (parseFloat(i.qty)||0); });
  const bestItem = Object.entries(byItem).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('rBestItem').textContent = bestItem ? bestItem[0] : '—';
  document.getElementById('rBestItemQ').textContent = bestItem ? `${bestItem[1]} units sold` : '';

  // Top payment
  const byPay = {};
  all.forEach(i => { byPay[i.payment||'Cash'] = (byPay[i.payment||'Cash']||0)+1; });
  const topPay = Object.entries(byPay).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('rTopPay').textContent   = topPay ? topPay[0] : '—';
  document.getElementById('rTopPayCt').textContent = topPay ? `${topPay[1]} transactions` : '';

  // Avg sale
  const avg = all.reduce((a,b)=>a+(b.total||0),0) / all.length;
  document.getElementById('rAvg').textContent   = fmt(avg);
  document.getElementById('rAvgCt').textContent = `from ${all.length} sale${all.length!==1?'s':''}`;

  renderDailyChart(byDay);
  renderCategoryChart(all);
  renderPaymentChart(all);
  renderDailySalesLog();
}

function renderDailyChart(byDay) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d  = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0,10);
    days.push({ ds, lbl: d.toLocaleDateString('en-KE',{weekday:'short'}), total: byDay[ds]||0 });
  }
  const max = Math.max(...days.map(d=>d.total), 1);
  const bars = days.map(d => {
    const h   = Math.max(4, (d.total/max*120)).toFixed(0);
    const val = d.total >= 1000 ? 'KES '+(d.total/1000).toFixed(1)+'K' : (d.total ? 'KES '+d.total : '');
    return `<div class="bar-wrap">
      <div class="bar-val">${val}</div>
      <div class="bar bar-teal" style="height:${h}px"></div>
      <div class="bar-lbl">${d.lbl}</div>
    </div>`;
  }).join('');
  document.getElementById('chartDaily').innerHTML = `<div class="bar-chart">${bars}</div>`;
}

function renderCategoryChart(all) {
  const byCat = {}; all.forEach(i => { byCat[i.category||'General'] = (byCat[i.category||'General']||0) + (i.total||0); });
  const colors = ['var(--teal)','var(--amber)','var(--indigo)','var(--rose)','#10b981','#f472b6'];
  const max = Math.max(...Object.values(byCat), 1);
  const rows = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([name, val], idx) => `
    <div class="cat-bar-row">
      <div class="cat-name">${escH(name)}</div>
      <div class="cat-track"><div class="cat-fill" style="width:${(val/max*100).toFixed(1)}%;background:${colors[idx%colors.length]}"></div></div>
      <div class="cat-val">${fmt(val)}</div>
    </div>`).join('');
  document.getElementById('chartCategory').innerHTML = rows || '<div class="empty-text">No data</div>';
}

function renderPaymentChart(all) {
  const byPay = {}; all.forEach(i => { const p = i.payment||'Cash'; if(!byPay[p]) byPay[p]={total:0,count:0}; byPay[p].total+=i.total||0; byPay[p].count++; });
  const pills = Object.entries(byPay).sort((a,b)=>b[1].total-a[1].total).map(([name, v]) => `
    <div class="pay-kpi">
      <span class="pay-pill pay-${name.split(' ')[0]}">${escH(name)}</span>
      <div>
        <div class="pay-kpi-amnt">${fmt(v.total)}</div>
        <div class="pay-kpi-count">${v.count} transaction${v.count!==1?'s':''}</div>
      </div>
    </div>`).join('');
  document.getElementById('chartPayment').innerHTML = pills || '<div class="empty-text">No data</div>';
}

// ----------------------------------------------------------------
// DAILY SALES LOG
// ----------------------------------------------------------------
function renderDailySalesLog() {
  const el = document.getElementById('dailySalesLog');
  if (!el) return;

  // All sessions (newest first)
  const allSessions = [...sessions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (!allSessions.length) {
    el.innerHTML = `<div class="empty" style="padding:32px 20px">
      <div class="empty-icon">📅</div>
      <div class="empty-text">No sessions yet</div>
      <div class="empty-sub">End your first session to see the daily log here</div>
    </div>`;
    return;
  }

  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  let html = '';
  allSessions.forEach((sess, idx) => {
    const items    = (sess.items || []).filter(i => i.item && i.item.trim());
    const expenses = (sess.expenses || []).filter(e => e.name && e.name.trim());
    const isActive = sess.status === 'active';

    // Date label
    let dayLabel = '';
    try {
      const d = new Date((sess.date || sess.createdAt) + (sess.date ? 'T12:00:00' : ''));
      dayLabel = dayNames[d.getDay()] + ', ' + d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { dayLabel = sess.date || 'Unknown Date'; }

    // Totals
    const totalSold  = items.reduce((a, b) => a + (b.total || 0), 0);
    const totalPaid  = items.reduce((a, b) => a + (parseFloat(b.paid) || 0), 0);
    const totalDebt  = items.reduce((a, b) => a + (parseFloat(b.debt) || 0), 0);
    const totalExp   = expenses.reduce((a, b) => a + (b.total || 0), 0);
    const netProfit  = totalSold - totalExp;
    const totalRem   = items.reduce((a, b) => a + (b.remainingQty || 0), 0);
    const qtySold    = items.reduce((a, b) => a + (parseFloat(b.qty) || 0), 0);

    const statusBadge = isActive
      ? `<span class="day-status-active">ACTIVE</span>`
      : `<span class="day-status-done">CLOSED</span>`;

    // Item rows
    const itemRows = items.length ? items.map((item, ri) => {
      const rem     = item.remainingQty || 0;
      const remCls  = rem > 0 ? 'day-rem-badge day-rem-amber' : 'day-rem-badge day-rem-zero';
      return `<tr>
        <td class="dl-num">${ri + 1}</td>
        <td class="dl-item"><strong>${escH(item.item)}</strong>${item.customer ? `<br><span class="dl-note">${escH(item.customer)}</span>` : ''}</td>
        <td class="dl-cat">${escH(item.category || 'General')}</td>
        <td class="dl-num"><span class="dl-qty-badge">${parseFloat(item.qty) || 0}</span></td>
        <td class="dl-num"><span class="${remCls}">${rem}</span></td>
        <td class="dl-amt">${fmt(item.unitPrice)}</td>
        <td class="dl-amt dl-total">${fmt(item.total)}</td>
        <td class="dl-amt dl-paid">${fmt(item.paid)}</td>
        <td class="dl-amt dl-debt">${item.debt > 0 ? fmt(item.debt) : '<span class="dl-clear">✔</span>'}</td>
        <td><span class="pay-pill pay-${(item.payment||'Cash').split(' ')[0]}">${escH(item.payment || 'Cash')}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="10" style="text-align:center;padding:18px;color:var(--text-muted);font-size:0.84rem">No items recorded in this session</td></tr>`;

    // Collapse first by default only for very old sessions
    const collapsed = idx > 2 ? 'collapsed' : '';
    const arrowId   = `arrow-${sess.id}`;

    html += `
    <div class="day-card">
      <div class="day-card-header" onclick="toggleDayCard(this,'${sess.id}')">
        <div class="day-card-left">
          <div class="day-card-name">${statusBadge} ${escH(sess.name)}</div>
          <div class="day-card-date">${dayLabel}</div>
        </div>
        <div class="day-card-right">
          <div class="day-card-stats">
            <span class="day-stat-chip day-stat-teal">💰 ${fmt(totalSold)}</span>
            <span class="day-stat-chip day-stat-green">✔ ${fmt(totalPaid)}</span>
            ${totalDebt > 0 ? `<span class="day-stat-chip day-stat-rose">⚠ ${fmt(totalDebt)}</span>` : ''}
            <span class="day-stat-chip day-stat-amber">📦 ${totalRem} left</span>
            <span class="day-stat-chip day-stat-profit">Net ${netProfit >= 0 ? '' : '-'}${fmt(Math.abs(netProfit))}</span>
          </div>
          <span class="day-card-arrow" id="${arrowId}">${collapsed ? '▶' : '▼'}</span>
        </div>
      </div>
      <div class="day-card-body ${collapsed}" id="dcb-${sess.id}">
        <div class="day-table-wrap">
          <table class="day-table">
            <thead>
              <tr>
                <th class="dl-num">#</th>
                <th class="dl-item">Item</th>
                <th class="dl-cat">Category</th>
                <th class="dl-num">Sold</th>
                <th class="dl-num">Rem.</th>
                <th class="dl-amt">Price</th>
                <th class="dl-amt">Revenue</th>
                <th class="dl-amt">Paid</th>
                <th class="dl-amt">Debt</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
              <tr class="day-tfoot">
                <td colspan="3" class="dl-tfoot-label">Session Total</td>
                <td class="dl-num"><strong>${qtySold}</strong></td>
                <td class="dl-num"><strong>${totalRem}</strong></td>
                <td></td>
                <td class="dl-total"><strong>${fmt(totalSold)}</strong></td>
                <td class="dl-paid"><strong>${fmt(totalPaid)}</strong></td>
                <td class="dl-debt">${totalDebt > 0 ? `<strong>${fmt(totalDebt)}</strong>` : '<span class="dl-clear">✔ Clear</span>'}</td>
                <td></td>
              </tr>
              ${totalExp > 0 ? `<tr class="day-tfoot-exp">
                <td colspan="6" class="dl-tfoot-label">📄 Total Expenses</td>
                <td colspan="4" style="padding:8px 10px;font-family:'Space Grotesk',sans-serif;font-weight:800;color:var(--amber);font-size:0.9rem">${fmt(totalExp)}</td>
              </tr>
              <tr class="day-tfoot-exp">
                <td colspan="6" class="dl-tfoot-label">💹 Net Profit</td>
                <td colspan="4" style="padding:8px 10px;font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:0.9rem;color:${netProfit >= 0 ? 'var(--emerald2)' : 'var(--rose2)'}">${netProfit >= 0 ? '+' : ''}${fmt(netProfit)}</td>
              </tr>` : ''}
            </tfoot>
          </table>
        </div>
      </div>
    </div>`;
  });

  el.innerHTML = html;
}

function toggleDayCard(header, sessId) {
  const body  = document.getElementById('dcb-' + sessId);
  const arrow = document.getElementById('arrow-' + sessId);
  if (!body) return;
  body.classList.toggle('collapsed');
  if (arrow) arrow.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
}

// ----------------------------------------------------------------
// CSV EXPORT
// ----------------------------------------------------------------
function exportCSV() {
  const all = getAllItems();
  if (!all.length) { alert('No data to export.'); return; }
  const headers = ['Session','Date','Item','Category','Qty','Price','Total','Paid','Debt','Method','Note'];
  const rows    = all.map(i => [
    `"${(i.sessionName||'').replace(/"/g,'""')}"`,
    i.date,
    `"${(i.item||'').replace(/"/g,'""')}"`,
    i.category||'General',
    i.qty||0,
    i.unitPrice||0,
    i.total||0,
    i.paid||0,
    i.debt||0,
    i.payment||'Cash',
    `"${(i.customer||'').replace(/"/g,'""')}"`
  ].join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'sales_record_export.csv';
  a.click(); URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------
// DEBT PAGE
// ----------------------------------------------------------------

// Partial payment state
let _partialSessionId = null;
let _partialItemId    = null;

function renderDebtPage() {
  const search     = (document.getElementById('debtSearch')?.value    || '').toLowerCase();
  const sessFilter = document.getElementById('debtSessionFilter')?.value || '';
  const payFilter  = document.getElementById('debtPayFilter')?.value    || '';

  // Collect all items with debt across all sessions
  let debtItems = [];
  sessions.forEach(sess => {
    (sess.items || []).forEach(item => {
      const debt = parseFloat(item.debt) || 0;
      if (debt > 0) {
        debtItems.push({ ...item, sessionId: sess.id, sessionName: sess.name, sessionDate: sess.date });
      }
    });
  });

  // Populate session filter dropdown (once on first load or when sessions change)
  const sessSelect = document.getElementById('debtSessionFilter');
  if (sessSelect) {
    const currentVal = sessSelect.value;
    const uniqueSessions = [...new Map(debtItems.map(d => [d.sessionId, d.sessionName])).entries()];
    sessSelect.innerHTML = '<option value="">All Sessions</option>' +
      uniqueSessions.map(([id, name]) => `<option value="${id}" ${currentVal===id?'selected':''}>${escH(name)}</option>`).join('');
    if (currentVal) sessSelect.value = currentVal;
  }

  // Stat totals (before filter — always show overall)
  const totalOutstanding = debtItems.reduce((a, b) => a + (parseFloat(b.debt) || 0), 0);
  const totalPaidAll     = debtItems.reduce((a, b) => a + (parseFloat(b.paid) || 0), 0);
  const uniqueCustomers  = new Set(debtItems.map(d => d.customer || d.item || 'Unknown')).size;

  const dDebt = document.getElementById('dTotalDebt');
  const dCust = document.getElementById('dTotalCustomers');
  const dPaid = document.getElementById('dTotalPaid');
  if (dDebt) dDebt.textContent = fmt(totalOutstanding);
  if (dCust) dCust.textContent = uniqueCustomers;
  if (dPaid) dPaid.textContent = fmt(totalPaidAll);

  // Also update dashboard debt chip
  const sdDebt = document.getElementById('sdSessionDebt');
  if (sdDebt) {
    const activeSession = getActiveSession();
    const activeDbt = (activeSession?.items || []).reduce((a,b) => a + (parseFloat(b.debt)||0), 0);
    sdDebt.textContent = fmt(activeDbt);
  }

  // Apply filters
  let filtered = debtItems.filter(d => {
    if (sessFilter && d.sessionId !== sessFilter) return false;
    if (payFilter  && d.payment  !== payFilter)   return false;
    if (search && ![d.item||'', d.customer||'', d.sessionName||''].join(' ').toLowerCase().includes(search)) return false;
    return true;
  });

  const tbody = document.getElementById('debtBody');
  const tableWrapper = document.getElementById('debtTableWrapper');
  const emptyEl      = document.getElementById('debtEmpty');

  if (!filtered.length) {
    if (tableWrapper) tableWrapper.classList.add('hidden');
    if (emptyEl)      emptyEl.classList.remove('hidden');
    return;
  }

  if (tableWrapper) tableWrapper.classList.remove('hidden');
  if (emptyEl)      emptyEl.classList.add('hidden');

  if (!tbody) return;
  tbody.innerHTML = '';

  filtered.forEach((d, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'debt-row-high';
    const debtAmt = parseFloat(d.debt) || 0;
    const paidAmt = parseFloat(d.paid) || 0;

    tr.innerHTML = `
      <td class="col-num">${idx + 1}</td>
      <td><strong>${escH(d.customer || '—')}</strong></td>
      <td>${escH(d.item || '—')}</td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${escH(d.sessionName || '—')}</td>
      <td style="font-size:0.82rem;white-space:nowrap">${dateLbl(d.date)}</td>
      <td style="font-weight:700;font-family:'Space Grotesk',sans-serif;color:var(--teal2)">${fmt(d.total)}</td>
      <td style="font-weight:700;font-family:'Space Grotesk',sans-serif;color:var(--sky2)">${fmt(paidAmt)}</td>
      <td><span class="debt-outstanding-pill">${fmt(debtAmt)}</span></td>
      <td><span class="pay-pill pay-${(d.payment||'Cash').split(' ')[0]}">${escH(d.payment||'Cash')}</span></td>
      <td class="debt-action-cell">
        <button class="btn-mark-paid" onclick="markDebtPaid('${d.sessionId}','${d.id}')">✅ Paid Full</button>
        <button class="btn-partial"   onclick="openPartialModal('${d.sessionId}','${d.id}',${debtAmt},'${escH(d.customer||d.item||'Customer')}')">💰 Partial</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function markDebtPaid(sessionId, itemId) {
  const sess = sessions.find(s => s.id === sessionId);
  if (!sess) return;
  const item = (sess.items || []).find(i => i.id === itemId);
  if (!item) return;

  item.paid = item.total;
  item.debt = 0;
  await persistSession(sess);
  renderDebtPage();
  // Refresh dashboard debt stat too
  updateGrandTotal();
}

function openPartialModal(sessionId, itemId, currentDebt, customerName) {
  _partialSessionId = sessionId;
  _partialItemId    = itemId;
  const sub = document.getElementById('partialModalSub');
  if (sub) sub.textContent = `${customerName} owes ${fmt(currentDebt)}. Enter the amount paid now:`;
  const inp = document.getElementById('partialAmtInput');
  if (inp) { inp.value = ''; inp.focus(); }
  document.getElementById('partialModal').classList.remove('hidden');
}

function closePartialModal() {
  _partialSessionId = null;
  _partialItemId    = null;
  document.getElementById('partialModal').classList.add('hidden');
}

async function confirmPartialPayment() {
  const amt = parseFloat(document.getElementById('partialAmtInput')?.value) || 0;
  if (!amt || amt <= 0) { alert('Please enter a valid amount.'); return; }

  const sess = sessions.find(s => s.id === _partialSessionId);
  if (!sess) { closePartialModal(); return; }
  const item = (sess.items || []).find(i => i.id === _partialItemId);
  if (!item) { closePartialModal(); return; }

  item.paid = Math.min(item.total, (parseFloat(item.paid) || 0) + amt);
  item.debt = Math.max(0, item.total - item.paid);
  await persistSession(sess);
  closePartialModal();
  renderDebtPage();
  updateGrandTotal();
}

function clearDebtFilters() {
  ['debtSearch','debtSessionFilter','debtPayFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderDebtPage();
}

