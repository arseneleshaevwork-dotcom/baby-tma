import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createCheckoutHandoff, verifyCheckoutHandoff } from '../supabase/functions/web-auth/handoff.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const input = {
  secret: 'test-secret-at-least-32-characters-long',
  userId: '123e4567-e89b-42d3-a456-426614174000',
  telegramId: 8999375510,
  plan: 'quarter',
  nonce: 'a'.repeat(32),
  nowSeconds: 1_800_000_000
};

const handoff = await createCheckoutHandoff(input);
const claims = await verifyCheckoutHandoff(handoff.token, input.secret, input.nowSeconds + 60);
assert.equal(claims?.sub, input.userId);
assert.equal(claims?.tid, input.telegramId);
assert.equal(claims?.plan, 'quarter');

assert.equal(await verifyCheckoutHandoff(handoff.token, input.secret, input.nowSeconds + 601), null);
assert.equal(await verifyCheckoutHandoff(handoff.token + 'x', input.secret, input.nowSeconds + 60), null);
assert.equal(await verifyCheckoutHandoff(handoff.token, 'different-secret-at-least-32-chars', input.nowSeconds + 60), null);

console.log('ok - signed checkout handoff is short-lived and tamper resistant');
