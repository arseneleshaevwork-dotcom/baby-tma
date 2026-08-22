const assert = require('assert');
const {
  PARTNER_APPLICATION_URL,
  buildPartnerRecruitPromo,
  buildClientPromo
} = require('../promo-copy');

const partnerPromo = buildPartnerRecruitPromo();
assert.ok(partnerPromo.includes('30%'));
assert.ok(partnerPromo.includes('кабинет со статистикой'));
assert.ok(partnerPromo.includes(PARTNER_APPLICATION_URL));
assert.ok(!partnerPromo.includes('2 оплаты'));
assert.ok(!partnerPromo.includes('30 дней'));
assert.ok(!partnerPromo.includes('14 дней'));

const personalLink = 'https://t.me/babymode1_bot?start=ref_sleep_maria';
const clientPromo = buildClientPromo(personalLink);
assert.ok(clientPromo.includes('ближайшее окно сна'));
assert.ok(clientPromo.includes('дневник сна и кормлений'));
assert.ok(clientPromo.includes('Начать можно бесплатно'));
assert.ok(clientPromo.endsWith(personalLink));

console.log('ok - partner and client promo copy');
