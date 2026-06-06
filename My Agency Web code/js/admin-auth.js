/* ============================================================
   YashTech Labs — Admin Authentication
   Handles login, session management, lockout, password change
   ============================================================ */

'use strict';

const AUTH_SESSION_KEY    = 'yt_admin_session';
const AUTH_EXPIRY         = 30 * 60 * 1000;   // 30 minutes
const MAX_ATTEMPTS        = 5;
const LOCKOUT_DURATION    = 30 * 60 * 1000;   // 30 minutes
const ATTEMPTS_KEY        = 'yt_admin_attempts';
const LOCKOUT_KEY         = 'yt_admin_lockout';

// Default password: "YashTech@2024"
// SHA-256 hash pre-computed here as fallback
const DEFAULT_PASSWORD_HASH = 'a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4';
// Actual hash is computed at runtime for first boot

/* ── SHA-256 via Web Crypto ──────────────────────────────────── */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── Firestore: Get / Init stored password hash ─────────────── */
async function getStoredPasswordHash() {
  try {
    const docRef = db.collection('admin_config').doc('credentials');
    const snap   = await docRef.get();

    if (snap.exists && snap.data().passwordHash) {
      return snap.data().passwordHash;
    }

    // First boot — store hash of default password
    const defaultHash = await hashPassword('YashTech@2024');
    await docRef.set({ passwordHash: defaultHash, updatedAt: new Date().toISOString() });
    return defaultHash;
  } catch (err) {
    console.error('[Auth] Firestore error, falling back to localStorage:', err);
    const local = localStorage.getItem('yt_admin_pw_hash');
    if (local) return local;
    // Final fallback — compute and cache
    const h = await hashPassword('YashTech@2024');
    localStorage.setItem('yt_admin_pw_hash', h);
    return h;
  }
}

/* ── Lockout Helpers ─────────────────────────────────────────── */
function checkLockout() {
  const lockoutTime = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10);
  if (!lockoutTime) return { locked: false, remaining: 0 };
  const elapsed   = Date.now() - lockoutTime;
  const remaining = LOCKOUT_DURATION - elapsed;
  if (remaining > 0) {
    return { locked: true, remaining: Math.ceil(remaining / 1000) };
  }
  // Lockout expired — clear
  localStorage.removeItem(LOCKOUT_KEY);
  localStorage.removeItem(ATTEMPTS_KEY);
  return { locked: false, remaining: 0 };
}

function recordFailedAttempt() {
  const current = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10) + 1;
  localStorage.setItem(ATTEMPTS_KEY, String(current));

  if (current >= MAX_ATTEMPTS) {
    localStorage.setItem(LOCKOUT_KEY, String(Date.now()));
    localStorage.removeItem(ATTEMPTS_KEY);
  }
  return { attempts: current, locked: current >= MAX_ATTEMPTS };
}

function clearFailedAttempts() {
  localStorage.removeItem(ATTEMPTS_KEY);
  localStorage.removeItem(LOCKOUT_KEY);
}

function getRemainingAttempts() {
  const used = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10);
  return MAX_ATTEMPTS - used;
}

/* ── Session Helpers ─────────────────────────────────────────── */
function setSession() {
  const session = {
    loggedIn:     true,
    createdAt:    Date.now(),
    lastActivity: Date.now()
  };
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function getSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

function refreshSession() {
  const session = getSession();
  if (!session) return;
  session.lastActivity = Date.now();
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function isSessionValid() {
  const session = getSession();
  if (!session || !session.loggedIn) return false;
  const idleTime = Date.now() - session.lastActivity;
  return idleTime < AUTH_EXPIRY;
}

/* ── Auth Check (call on every dashboard page) ───────────────── */
function checkAuth() {
  if (!isSessionValid()) {
    clearSession();
    window.location.href = 'yt-admin.html';
    return false;
  }
  // Refresh on activity
  document.addEventListener('mousemove', refreshSession, { passive: true });
  document.addEventListener('keydown',   refreshSession, { passive: true });
  document.addEventListener('click',     refreshSession, { passive: true });

  // Auto-logout on idle
  setInterval(() => {
    if (!isSessionValid()) {
      clearSession();
      window.location.href = 'yt-admin.html';
    }
  }, 60 * 1000); // check every minute

  return true;
}

/* ── Logout ─────────────────────────────────────────────────── */
function logout() {
  clearSession();
  window.location.href = 'yt-admin.html';
}

/* ── Login ──────────────────────────────────────────────────── */
async function login(password) {
  const lockStatus = checkLockout();
  if (lockStatus.locked) {
    throw { code: 'LOCKED', remaining: lockStatus.remaining };
  }

  const inputHash  = await hashPassword(password);
  const storedHash = await getStoredPasswordHash();

  if (inputHash === storedHash) {
    clearFailedAttempts();
    setSession();
    return true;
  } else {
    const { attempts, locked } = recordFailedAttempt();
    if (locked) {
      throw { code: 'LOCKED', remaining: Math.ceil(LOCKOUT_DURATION / 1000) };
    }
    throw { code: 'WRONG_PASSWORD', attemptsLeft: MAX_ATTEMPTS - attempts };
  }
}

/* ── Change Password (from settings page) ───────────────────── */
async function changePassword(currentPassword, newPassword, confirmPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }
  if (newPassword !== confirmPassword) {
    throw new Error('Passwords do not match.');
  }

  const currentHash = await hashPassword(currentPassword);
  const storedHash  = await getStoredPasswordHash();

  if (currentHash !== storedHash) {
    throw new Error('Current password is incorrect.');
  }

  const newHash = await hashPassword(newPassword);

  try {
    await db.collection('admin_config').doc('credentials').set({
      passwordHash: newHash,
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem('yt_admin_pw_hash', newHash);
  } catch (err) {
    // Fallback to localStorage only
    localStorage.setItem('yt_admin_pw_hash', newHash);
  }

  return true;
}

/* ── Login Page Controller ───────────────────────────────────── */
(function initLoginPage() {
  const loginForm = document.getElementById('login-form');
  if (!loginForm) return; // Not on login page

  // Load custom brand logo if stored in local database
  try {
    const rawSettings = localStorage.getItem('yt_db_settings');
    if (rawSettings) {
      const s = JSON.parse(rawSettings);
      if (s.logo) {
        const adminLogoImg = document.getElementById('admin-logo-img');
        if (adminLogoImg) adminLogoImg.src = s.logo;
        
        const favicon = document.getElementById('favicon');
        if (favicon) favicon.href = s.logo;
      }
    }
  } catch (err) {
    console.warn('[Auth] Logo load error:', err);
  }

  // If already logged in, redirect
  if (isSessionValid()) {
    window.location.href = 'yt-dashboard.html';
    return;
  }

  const passwordInput  = document.getElementById('login-password');
  const toggleBtn      = document.getElementById('toggle-password');
  const loginBtn       = document.getElementById('login-btn');
  const errorBox       = document.getElementById('login-error');
  const lockoutBox     = document.getElementById('login-lockout');
  const lockoutTimer   = document.getElementById('lockout-timer');
  const attemptsLeft   = document.getElementById('attempts-left');

  let lockoutInterval  = null;

  /* Show/hide password */
  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const isText = passwordInput.type === 'text';
      passwordInput.type  = isText ? 'password' : 'text';
      toggleBtn.innerHTML = isText ? '👁' : '🙈';
    });
  }

  /* Check lockout on page load */
  function checkAndShowLockout() {
    const status = checkLockout();
    if (status.locked) {
      showLockout(status.remaining);
      return true;
    }
    return false;
  }

  function showLockout(seconds) {
    if (lockoutBox) lockoutBox.classList.add('show');
    if (errorBox)   errorBox.classList.remove('show');
    if (loginBtn)   loginBtn.disabled = true;
    updateTimer(seconds);

    if (lockoutInterval) clearInterval(lockoutInterval);
    let remaining = seconds;
    lockoutInterval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(lockoutInterval);
        lockoutInterval = null;
        if (lockoutBox) lockoutBox.classList.remove('show');
        if (loginBtn)   loginBtn.disabled = false;
      } else {
        updateTimer(remaining);
      }
    }, 1000);
  }

  function updateTimer(secs) {
    if (!lockoutTimer) return;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    lockoutTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  function setLoading(state) {
    if (!loginBtn) return;
    if (state) {
      loginBtn.classList.add('btn-loading');
      loginBtn.disabled = true;
    } else {
      loginBtn.classList.remove('btn-loading');
      loginBtn.disabled = false;
    }
  }

  function showError(message) {
    if (errorBox) {
      errorBox.querySelector('.error-text').textContent = message;
      errorBox.classList.add('show');
    }
    if (passwordInput) {
      passwordInput.classList.add('error');
      passwordInput.addEventListener('input', () => {
        passwordInput.classList.remove('error');
        if (errorBox) errorBox.classList.remove('show');
      }, { once: true });
    }
  }

  // Initial lockout check
  checkAndShowLockout();

  /* Form submission */
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (checkAndShowLockout()) return;

    const password = passwordInput ? passwordInput.value.trim() : '';
    if (!password) {
      showError('Please enter your password.');
      return;
    }

    setLoading(true);
    if (errorBox) errorBox.classList.remove('show');

    try {
      await login(password);
      // Success
      loginBtn.innerHTML = '<span class="btn-text">✅ Logging in…</span>';
      setTimeout(() => { window.location.href = 'yt-dashboard.html'; }, 400);
    } catch (err) {
      setLoading(false);
      if (err.code === 'LOCKED') {
        showLockout(err.remaining);
      } else if (err.code === 'WRONG_PASSWORD') {
        const left = err.attemptsLeft;
        showError(`Incorrect password. ${left} attempt${left !== 1 ? 's' : ''} remaining.`);
        if (attemptsLeft) attemptsLeft.textContent = left;
      } else {
        showError('Authentication failed. Please try again.');
        console.error('[Auth] Login error:', err);
      }
    }
  });
})();
