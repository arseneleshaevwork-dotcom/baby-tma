import assert from 'node:assert/strict';
import test from 'node:test';
import { addBillingMonths, getBillingPlan, openBillingSecret, rubles, sealBillingSecret } from '../supabase/functions/_shared/billing.mjs';
import { hashGuestBillingKey, normalizeGuestBillingKey } from '../supabase/functions/_shared/guest-billing.mjs';

test('exposes the approved monthly and quarterly ruble plans', () => {
  assert.deepEqual(getBillingPlan('month'), { key: 'month', amountMinor: 34900, months: 1, label: 'Premium на 1 месяц' });
  assert.deepEqual(getBillingPlan('quarter'), { key: 'quarter', amountMinor: 89900, months: 3, label: 'Premium на 3 месяца' });
  assert.equal(getBillingPlan('half_year'), null);
  assert.equal(rubles(34900), '349.00');
});

test('calendar billing keeps valid month-end dates', () => {
  assert.equal(addBillingMonths('2026-01-31T10:00:00.000Z', 1).toISOString(), '2026-02-28T10:00:00.000Z');
  assert.equal(addBillingMonths('2026-11-30T10:00:00.000Z', 3).toISOString(), '2027-02-28T10:00:00.000Z');
});

test('billing payment method tokens are encrypted at rest', async () => {
  const secret = 'a-long-test-secret-that-is-never-production';
  const sealed = await sealBillingSecret('pm_123', secret);
  assert.notEqual(sealed, 'pm_123');
  assert.equal(await openBillingSecret(sealed, secret), 'pm_123');
});

test('guest billing keys are strict and stored only as hashes', async () => {
  const key = 'A'.repeat(43);
  assert.equal(normalizeGuestBillingKey(key), key);
  assert.equal(normalizeGuestBillingKey('short'), '');
  const hash = await hashGuestBillingKey(key);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, key);
});
