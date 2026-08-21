const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

async function run() {
  const toasts = [];
  let hidden = 0;
  let page = '';
  let replacedUrl = '';
  const location = { href: 'https://app.example.test/baby-tma/?payment=return' };
  const history = {
    replaceState(_state, _title, url) { replacedUrl = url; }
  };
  const document = { getElementById() { return null; } };
  const navigator = {};
  const window = {
    location,
    history,
    document,
    navigator,
    matchMedia() { return { matches: false }; },
    addEventListener() {},
    showToast(message) { toasts.push(message); },
    hideToast() { hidden += 1; },
    goPage(nextPage) { page = nextPage; },
    SUB: { async refreshPremiumStatus() { return true; } }
  };
  const context = {
    window,
    location,
    history,
    document,
    navigator,
    URL,
    console,
    Promise,
    setTimeout,
    clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('./pwa.js', 'utf8'), context);

  window.BabyPWA.init();
  await new Promise(resolve => setImmediate(resolve));

  assert.deepStrictEqual(toasts, ['Проверяем оплату...']);
  assert.strictEqual(hidden, 1);
  assert.strictEqual(page, 'premium');
  assert.strictEqual(replacedUrl, '/baby-tma/');
  console.log('ok - successful payment return closes the toast and opens Premium');
}

run().catch(error => {
  console.error('not ok - successful payment return closes the toast and opens Premium');
  console.error(error.stack);
  process.exitCode = 1;
});
