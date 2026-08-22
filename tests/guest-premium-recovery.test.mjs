import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260822020000_guest_billing_claim.sql', import.meta.url), 'utf8');
const endpoint = fs.readFileSync(new URL('../supabase/functions/billing-subscription/index.ts', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../subscription.js', import.meta.url), 'utf8');

assert.match(migration, /for update/i);
assert.match(migration, /linked_telegram_id <> p_target_telegram_id/);
assert.match(migration, /revoke all on function public\.claim_web_billing_guest_internal/);
assert.match(migration, /grant execute on function public\.claim_web_billing_guest_internal[^;]+to service_role/s);
assert.match(endpoint, /authenticateAppRequest/);
assert.match(endpoint, /verified_telegram_and_guest_key_required/);
assert.match(client, /claimGuestPremium/);
assert.match(client, /localStorage\.removeItem\(WEB_BILLING_GUEST_KEY_STORAGE\)/);

console.log('ok - guest Premium recovery requires both verified Telegram and the browser secret');
