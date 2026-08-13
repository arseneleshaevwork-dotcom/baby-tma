const assert = require('assert');
const { webcrypto } = require('crypto');
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

function createContext({ initData = '', invoiceResponse = null, babyAccount = false } = {}) {
  const store = new Map();
  const sessionStore = new Map();
  const context = {
    console,
    setTimeout: (fn) => fn(),
    Date,
    window: {
      BABY_CREATE_STARS_INVOICE_ENDPOINT: 'https://example.test/create-stars-invoice',
      BABY_CREATE_YOOKASSA_PAYMENT_ENDPOINT: 'https://example.test/create-yookassa-payment',
      BABY_SUBSCRIPTION_STATUS_ENDPOINT: 'https://example.test/subscription-status',
      BABY_WEB_AUTH_ENDPOINT: 'https://example.test/web-auth',
      BABY_WEB_APP_URL: 'https://app.example.test/baby-tma/',
      Telegram: {
        WebApp: {
          initData,
          openInvoice: (link, cb) => {
            context.openedInvoice = link;
            if (cb) cb('cancelled');
          },
          openLink: link => { context.openedExternal = link; }
        }
      },
      BabyAnalytics: null,
      crypto: webcrypto,
      open: (url) => { context.openedWindow = url; },
      sessionStorage: {
        getItem: key => sessionStore.has(key) ? sessionStore.get(key) : null,
        setItem: (key, value) => sessionStore.set(key, String(value))
      }
    },
    localStorage: {
      getItem: key => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
    },
    URL,
    Uint8Array,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    crypto: webcrypto,
    location: {
      origin: 'https://app.example.test',
      pathname: '/baby-tma/',
      assign: url => { context.assignedLocation = url; }
    },
    document: {
      getElementById: () => null,
      createElement: () => ({ style: {}, remove() {} }),
      body: { appendChild() {} }
    },
    showToast: (message) => { context.lastToast = message; },
    fetch: async () => ({
      ok: Boolean(invoiceResponse),
      json: async () => invoiceResponse || {}
    })
  };
  context.window.localStorage = context.localStorage;
  context.window.document = context.document;
  context.window.location = context.location;
  if (babyAccount) {
    context.window.BabyAccount = {
      isMiniApp: () => true,
      request: async () => context.fetch()
    };
  }
  context.globalThis = context;
  return { context, store };
}

function loadSubscription(context) {
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('./subscription.js', 'utf8'), context);
}

test('does not expose demo premium activation API', () => {
  const { context } = createContext();
  loadSubscription(context);

  assert.strictEqual(vm.runInContext('SUB.activatePremium', context), undefined);
});

test('shows the actual free and premium limits', () => {
  const { context } = createContext();
  loadSubscription(context);

  const limits = vm.runInContext('SUB.getPlanLimits()', context);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(limits)), {
    freeAiDaily: 4,
    premiumAiDaily: 40,
    freeDiaryDays: 7,
    premiumDiaryContextDays: 14,
    freeArticles: 5
  });
  const html = vm.runInContext('_renderFreePage()', context);
  assert.match(html, /4 ИИ-ответа в день/);
  assert.match(html, /40 ИИ-ответов в день/);
  assert.match(html, /Дневник за 7 дней/);
  assert.match(html, /анализ дневника за 14 дней/i);
  assert.match(html, /Stars/);
  assert.match(html, /Карта \/ СБП/);
});

test('selecting a tariff updates the visible checkout instead of starting payment', () => {
  const { context } = createContext();
  loadSubscription(context);

  const initialHtml = vm.runInContext('_renderFreePage()', context);
  assert.match(initialHtml, /plan-card recommended selected/);
  assert.match(initialHtml, /Оплатить 769 Stars/);

  vm.runInContext("selectPremiumPlan('month', false)", context);
  const selectedHtml = vm.runInContext('_renderFreePage()', context);
  assert.match(selectedHtml, /plan-card selected/);
  assert.match(selectedHtml, /Выбран тариф/);
  assert.match(selectedHtml, /1 месяц · 299 Stars/);
  assert.match(selectedHtml, /handleSubscribe\('month'\)/);
  assert.doesNotMatch(selectedHtml, /handleSubscribe\('quarter'\)/);
});

test('web checkout reflects the selected ruble plan and its consent terms', () => {
  const { context } = createContext();
  context.window.BabyAccount = {
    isMiniApp: () => false,
    getCheckoutPlan: () => null,
    isAuthenticated: () => false
  };
  loadSubscription(context);

  vm.runInContext("selectPremiumPlan('month', false)", context);
  const html = vm.runInContext('_renderFreePage()', context);
  assert.match(html, /1 месяц · 349 ₽/);
  assert.match(html, /автоматическим списанием 349 ₽ ежемесячно/);
  assert.match(html, /Перейти к оплате · 349 ₽/);
  assert.match(html, /premiumCheckoutButton[^>]*disabled/);
  assert.match(html, /Вход в Telegram не нужен/);
});

test('guest web checkout opens YooKassa without a Telegram login prompt', async () => {
  const { context } = createContext();
  context.window.BabyAccount = {
    isMiniApp: () => false,
    isAuthenticated: () => false,
    canUseServer: () => false,
    getCheckoutPlan: () => null,
    requestLogin: reason => { context.loginPrompt = reason; },
    request: async (url, options) => {
      context.webCheckoutRequest = { url, body: options.body };
      return {
        ok: true,
        json: async () => ({ confirmation_url: 'https://yookassa.test/checkout/123' })
      };
    }
  };
  context.BabyAccount = context.window.BabyAccount;
  context.document.getElementById = id => id === 'webBillingConsent' ? { checked: true } : null;
  loadSubscription(context);

  assert.match(vm.runInContext('_getGuestBillingKey(true)', context), /^[A-Za-z0-9_-]{43}$/);
  await context.handleSubscribe('month');

  assert.strictEqual(context.loginPrompt, undefined);
  assert.ok(context.webCheckoutRequest, context.lastToast || 'checkout request was not sent');
  assert.strictEqual(context.webCheckoutRequest.url, 'https://example.test/create-yookassa-payment');
  assert.match(context.webCheckoutRequest.body.guest_key, /^[A-Za-z0-9_-]{43}$/);
  assert.strictEqual(context.webCheckoutRequest.body.plan, 'month');
  assert.strictEqual(context.assignedLocation, 'https://yookassa.test/checkout/123');
});

test('onboarding does not show an automatic trial toast', () => {
  const source = fs.readFileSync('./onboarding.js', 'utf8');
  assert.doesNotMatch(source, /Активируйте 7 дней Premium/);
});

test('subscribe outside Telegram does not set premium cache', async () => {
  const { context, store } = createContext({ initData: '' });
  loadSubscription(context);

  await context.handleSubscribe('month');

  assert.notStrictEqual(store.get('babymode_premium'), '1');
  assert.match(context.lastToast, /Telegram/);
});

test('subscribe in Telegram opens Stars invoice from backend', async () => {
  const { context, store } = createContext({
    initData: 'query_id=1&auth_date=1&user=%7B%22id%22%3A1%7D&hash=x',
    invoiceResponse: { invoice_link: 'https://t.me/invoice/test' }
  });
  loadSubscription(context);

  await context.handleSubscribe('quarter');

  assert.strictEqual(context.openedInvoice, 'https://t.me/invoice/test');
  assert.notStrictEqual(store.get('babymode_premium'), '1');
});

test('card or SBP in Mini App opens the signed web checkout instead of Telegram invoice', async () => {
  const { context } = createContext({
    initData: 'query_id=1&auth_date=1&user=%7B%22id%22%3A1%7D&hash=x',
    babyAccount: true,
    invoiceResponse: { ok: true, web_url: 'https://app.example.test/baby-tma/?checkout=quarter&handoff=signed' }
  });
  loadSubscription(context);

  context.setPremiumPaymentMode('web');
  await context.handleSubscribe('quarter');

  assert.strictEqual(context.openedExternal, 'https://app.example.test/baby-tma/?checkout=quarter&handoff=signed');
  assert.strictEqual(context.openedInvoice, undefined);
});
