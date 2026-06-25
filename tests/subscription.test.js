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

function createContext({ initData = '', invoiceResponse = null } = {}) {
  const store = new Map();
  const context = {
    console,
    setTimeout: (fn) => fn(),
    Date,
    window: {
      BABY_CREATE_STARS_INVOICE_ENDPOINT: 'https://example.test/create-stars-invoice',
      BABY_SUBSCRIPTION_STATUS_ENDPOINT: 'https://example.test/subscription-status',
      Telegram: {
        WebApp: {
          initData,
          openInvoice: (link, cb) => {
            context.openedInvoice = link;
            if (cb) cb('cancelled');
          }
        }
      },
      BabyAnalytics: null,
      open: (url) => { context.openedWindow = url; }
    },
    localStorage: {
      getItem: key => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
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

  await context.handleSubscribe('year');

  assert.strictEqual(context.openedInvoice, 'https://t.me/invoice/test');
  assert.notStrictEqual(store.get('babymode_premium'), '1');
});
