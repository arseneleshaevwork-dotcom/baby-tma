const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const window = { addEventListener() {} };
const context = {
  window,
  document: { body: { dataset: {} }, getElementById() { return null; } },
  navigator: {},
  Intl,
  console
};
Object.assign(window, context);
vm.createContext(context);
vm.runInContext(fs.readFileSync('./partners.js', 'utf8'), context);

assert.strictEqual(window.BabyPartners.normalizeCode(' SLEEP_MARIA '), 'sleep_maria');
assert.strictEqual(window.BabyPartners.normalizeCode('я-мария'), '');
assert.strictEqual(window.BabyPartners.normalizeCode('ab'), '');
assert.strictEqual(window.BabyPartners.statusCopy('pending')[0], 'Заявка на проверке');
assert.strictEqual(window.BabyPartners.statusCopy('active')[0], 'Партнёрство активно');

const html = fs.readFileSync('./index.html', 'utf8');
assert.ok(html.includes('id="page-partner"'));
assert.ok(html.includes('BabyPartners.open()'));
assert.ok(html.includes('30% начисляется с первых двух подтверждённых оплат в рублях'));
assert.ok(html.includes('<script src="partners.js'));

console.log('ok - partner public page entry and validation');
