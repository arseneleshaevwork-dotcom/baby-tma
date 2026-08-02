(function(global) {
  'use strict';

  const SESSION_KEY = 'babymode_web_session_v1';
  const SESSION_EXPIRY_KEY = 'babymode_web_session_expiry_v1';
  let mode = 'web';
  let authenticated = false;
  let user = null;
  let initPromise = null;

  function isMiniApp() {
    try { return Boolean(global.Telegram?.WebApp?.initData); }
    catch (_) { return false; }
  }

  function getSessionToken() {
    try {
      const expiresAt = new Date(localStorage.getItem(SESSION_EXPIRY_KEY) || 0).getTime();
      if (expiresAt && expiresAt <= Date.now()) clearSession();
      return localStorage.getItem(SESSION_KEY) || '';
    } catch (_) { return ''; }
  }

  function authHeaders(extra) {
    const headers = { ...(extra || {}) };
    const token = getSessionToken();
    if (token && !isMiniApp()) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function authBody(body) {
    const payload = { ...(body || {}) };
    if (isMiniApp()) payload.initData = global.Telegram.WebApp.initData;
    return payload;
  }

  async function request(url, options) {
    const config = { ...(options || {}) };
    config.headers = authHeaders(config.headers);
    if (config.body && typeof config.body !== 'string') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(authBody(config.body));
    }
    return fetch(url, config);
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = (async function() {
      mode = isMiniApp() ? 'mini_app' : 'web';
      document.body.classList.toggle('is-web-app', mode === 'web');
      if (mode === 'mini_app') {
        authenticated = true;
        hideGate();
        dispatchReady();
        return true;
      }
      document.body.classList.add('web-auth-pending');
      const token = getSessionToken();
      if (token) {
        try {
          const response = await request(global.BABY_WEB_AUTH_ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { action: 'session' }
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok && data.ok) {
            authenticated = true;
            user = data.user || null;
            applyServerBaby(data.baby);
            hideGate();
            renderAccount();
            dispatchReady();
            return true;
          }
        } catch (_) {}
        clearSession();
      }
      showGate();
      dispatchReady();
      return false;
    })();
    return initPromise;
  }

  async function login() {
    const button = document.getElementById('webTelegramLoginBtn');
    if (button) button.disabled = true;
    setGateMessage('Открываем Telegram...');
    try {
      const nonceResponse = await fetch(global.BABY_WEB_AUTH_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'nonce' })
      });
      const nonceData = await nonceResponse.json().catch(() => ({}));
      if (!nonceResponse.ok || !nonceData.nonce) throw new Error('nonce_failed');
      const loginApi = global.Telegram?.Login;
      if (!loginApi || typeof loginApi.auth !== 'function') throw new Error('telegram_login_unavailable');
      const result = await new Promise((resolve, reject) => {
        loginApi.auth({
          client_id: Number(nonceData.client_id || global.BABY_TELEGRAM_LOGIN_CLIENT_ID),
          scope: ['profile'], lang: 'ru', nonce: nonceData.nonce
        }, response => response?.id_token ? resolve(response) : reject(new Error(response?.error || 'login_cancelled')));
      });
      const loginResponse = await fetch(global.BABY_WEB_AUTH_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', id_token: result.id_token })
      });
      const data = await loginResponse.json().catch(() => ({}));
      if (!loginResponse.ok || !data.session_token) throw new Error(data.error || 'session_failed');
      localStorage.setItem(SESSION_KEY, data.session_token);
      localStorage.setItem(SESSION_EXPIRY_KEY, data.expires_at || '');
      authenticated = true;
      user = data.user || null;
      hideGate();
      renderAccount();
      global.dispatchEvent(new CustomEvent('baby-account-authenticated', { detail: { mode, user } }));
      if (global.BabyCloudSync) await global.BabyCloudSync.syncNow();
      if (global.SUB) await global.SUB.refreshPremiumStatus();
      if (typeof global.renderPremiumPage === 'function') global.renderPremiumPage();
      if (global.BabyAnalytics) global.BabyAnalytics.track('web_login', { method: 'telegram_oidc' });
      return true;
    } catch (error) {
      setGateMessage(error?.message === 'login_cancelled' ? 'Вход отменён' : 'Не удалось войти. Попробуйте ещё раз.');
      return false;
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function logout() {
    try {
      await request(global.BABY_WEB_AUTH_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { action: 'logout' }
      });
    } catch (_) {}
    clearSession();
    authenticated = false;
    user = null;
    showGate();
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_EXPIRY_KEY);
    } catch (_) {}
  }

  function showGate() {
    document.body.classList.add('web-auth-pending');
    const gate = document.getElementById('webAuthGate');
    if (gate) gate.hidden = false;
  }

  function hideGate() {
    document.body.classList.remove('web-auth-pending');
    const gate = document.getElementById('webAuthGate');
    if (gate) gate.hidden = true;
  }

  function setGateMessage(message) {
    const element = document.getElementById('webAuthMessage');
    if (element) element.textContent = message || '';
  }

  function renderAccount() {
    const status = document.getElementById('profileAccountStatus');
    const row = document.getElementById('profileAccountRow');
    if (status) status.textContent = mode === 'mini_app'
      ? 'Вход выполнен через Mini App'
      : authenticated ? `Telegram${user?.username ? ': @' + user.username : ''}` : 'Требуется вход';
    if (row) row.style.display = mode === 'web' ? 'grid' : 'none';
  }

  function applyServerBaby(baby) {
    if (!baby) return;
    if (baby.name) localStorage.setItem('babymode_baby_name', baby.name);
    if (baby.birthdate) localStorage.setItem('babymode_baby_birthdate', baby.birthdate);
    if (baby.age_months !== null && baby.age_months !== undefined) localStorage.setItem('babymode_last_age', String(baby.age_months));
  }

  function dispatchReady() {
    renderAccount();
    global.dispatchEvent(new CustomEvent('baby-account-ready', { detail: { mode, authenticated, user } }));
  }

  global.BabyAccount = {
    init, login, logout, request, authBody, authHeaders, isMiniApp,
    isAuthenticated: () => authenticated,
    canUseServer: () => isMiniApp() || authenticated,
    getMode: () => mode,
    getUser: () => user
  };
})(window);
