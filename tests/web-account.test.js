const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch(error => {
      console.error(`not ok - ${name}`);
      console.error(error.stack);
      process.exitCode = 1;
    });
}

function createContext({ miniApp = false, url = 'https://app.example.test/baby-tma/', handoffResponse = null } = {}) {
  const store = new Map();
  const classes = new Set();
  const elements = {
    webAuthGate: { hidden: true },
    webAuthReason: { textContent: '' },
    webAuthMessage: { textContent: '' },
    webTelegramLoginBtn: { focus() {} },
    profileAccountStatus: { textContent: '' },
    profileAccountAction: { textContent: '' },
    profileAccountRow: { style: {} }
  };
  const window = {
    BABY_WEB_AUTH_ENDPOINT: 'https://example.test/auth',
    BABY_TELEGRAM_SDK_READY: Promise.resolve(miniApp),
    Telegram: miniApp ? { WebApp: { initData: 'query_id=1&hash=x' } } : undefined,
    addEventListener() {},
    dispatchEvent() {},
    location: { href: url },
    history: { replaceState(_state, _title, nextUrl) { window.replacedUrl = nextUrl; } },
    goPage(page) { window.openedPage = page; },
    renderPremiumPage() { window.premiumRendered = true; },
    showToast(message) { window.lastToast = message; }
  };
  const context = {
    console,
    window,
    setTimeout: fn => fn(),
    clearTimeout() {},
    Date,
    URL,
    CustomEvent: function CustomEvent(type, options) {
      this.type = type;
      this.detail = options?.detail;
    },
    localStorage: {
      getItem: key => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
    },
    document: {
      activeElement: null,
      getElementById: id => elements[id] || null,
      createElement: () => ({}),
      head: { appendChild() {} },
      body: {
        classList: {
          add: name => classes.add(name),
          remove: name => classes.delete(name),
          toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
        }
      }
    },
    fetch: async (_url, options = {}) => {
      const body = JSON.parse(options.body || '{}');
      if (body.action === 'handoff_consume' && handoffResponse) {
        return { ok: true, json: async () => handoffResponse };
      }
      return { ok: false, json: async () => ({}) };
    }
  };
  Object.assign(window, context);
  context.globalThis = context;
  return { context, classes, elements };
}

function loadAccount(context) {
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('./web-account.js', 'utf8'), context);
}

test('opens the web app as a local guest without an auth gate', async () => {
  const { context, classes, elements } = createContext();
  loadAccount(context);

  const authenticated = await context.window.BabyAccount.init();

  assert.strictEqual(authenticated, false);
  assert.strictEqual(elements.webAuthGate.hidden, true);
  assert.strictEqual(classes.has('web-auth-modal-open'), false);
  assert.strictEqual(elements.profileAccountRow.style.display, 'grid');
  assert.strictEqual(elements.profileAccountStatus.textContent, 'Данные только на этом устройстве');
  assert.strictEqual(elements.profileAccountAction.textContent, 'Войти');
});

test('asks for Telegram login only when a protected action is requested', () => {
  const { context, classes, elements } = createContext();
  loadAccount(context);

  const allowed = context.window.BabyAccount.requestLogin('Нужна синхронизация');

  assert.strictEqual(allowed, false);
  assert.strictEqual(elements.webAuthGate.hidden, false);
  assert.strictEqual(elements.webAuthReason.textContent, 'Нужна синхронизация');
  assert.strictEqual(classes.has('web-auth-modal-open'), true);

  context.window.BabyAccount.closeLoginPrompt();
  assert.strictEqual(elements.webAuthGate.hidden, true);
  assert.strictEqual(classes.has('web-auth-modal-open'), false);
});

test('keeps Telegram Mini App authentication automatic', async () => {
  const { context, elements } = createContext({ miniApp: true });
  loadAccount(context);

  const authenticated = await context.window.BabyAccount.init();

  assert.strictEqual(authenticated, true);
  assert.strictEqual(context.window.BabyAccount.getMode(), 'mini_app');
  assert.strictEqual(context.window.BabyAccount.canUseServer(), true);
  assert.strictEqual(elements.webAuthGate.hidden, true);
  assert.strictEqual(elements.profileAccountRow.style.display, 'none');
});

test('consumes a Mini App checkout handoff without showing Telegram login', async () => {
  const { context, classes, elements } = createContext({
    url: 'https://app.example.test/baby-tma/?checkout=quarter&handoff=signed-token',
    handoffResponse: {
      ok: true,
      session_token: 'a'.repeat(48),
      expires_at: '2099-01-01T00:00:00.000Z',
      checkout_plan: 'quarter',
      user: { telegram_id: 42, username: 'parent' }
    }
  });
  loadAccount(context);

  const authenticated = await context.window.BabyAccount.init();

  assert.strictEqual(authenticated, true);
  assert.strictEqual(context.window.BabyAccount.isAuthenticated(), true);
  assert.strictEqual(context.window.BabyAccount.getCheckoutPlan(), 'quarter');
  assert.strictEqual(elements.webAuthGate.hidden, true);
  assert.strictEqual(classes.has('web-auth-modal-open'), false);
  assert.strictEqual(context.window.openedPage, 'premium');
  assert.strictEqual(context.window.replacedUrl, '/baby-tma/');
});
