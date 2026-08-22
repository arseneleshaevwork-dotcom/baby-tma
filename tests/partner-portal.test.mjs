import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPartnerSummary,
  PARTNER_TERMS_VERSION,
  validatePartnerApplication
} from '../supabase/functions/_shared/partner-portal.mjs';

assert.deepEqual(validatePartnerApplication({
  name: '  Сон   малыша  ',
  code: 'SLEEP_MARIA',
  contact: '  @maria  ',
  terms_accepted: true
}), { ok: true, name: 'Сон малыша', code: 'sleep_maria', contact: '@maria' });
assert.equal(validatePartnerApplication({ name: 'Мария', code: 'x', terms_accepted: true }).error, 'partner_code_invalid');
assert.equal(validatePartnerApplication({ name: 'Мария', code: 'maria', terms_accepted: false }).error, 'partner_terms_required');
assert.match(PARTNER_TERMS_VERSION, /^partner-v2-/);

const summary = buildPartnerSummary({
  partner: {
    id: 'partner-1', code: 'maria', name: 'Мария', contact: '@maria', status: 'active',
    commission_bps: 3000, attribution_days: 30, hold_days: 14,
    commission_payment_limit: 2, commission_days: 62, created_at: '2026-08-01T00:00:00.000Z'
  },
  referrals: [{ id: 'ref-1' }, { id: 'ref-2' }],
  commissions: [
    { status: 'pending', amount_minor: 34900, commission_minor: 10470, available_at: '2026-08-10T00:00:00.000Z' },
    { status: 'paid', amount_minor: 89900, commission_minor: 26970, available_at: '2026-08-10T00:00:00.000Z' },
    { status: 'reversed', amount_minor: 34900, commission_minor: 10470, available_at: '2026-08-10T00:00:00.000Z' }
  ],
  payouts: [{ status: 'paid' }],
  now: '2026-08-22T00:00:00.000Z'
});

assert.equal(summary.partner.commission_percent, 30);
assert.equal(summary.partner.attribution_days, undefined);
assert.equal(summary.partner.commission_days, undefined);
assert.equal(summary.partner.commission_payment_limit, undefined);
assert.equal(summary.stats.referrals, 2);
assert.equal(summary.stats.conversions, 3);
assert.equal(summary.stats.gross_rubles, 1248);
assert.equal(summary.stats.available_rubles, 104.7);
assert.equal(summary.stats.paid_rubles, 269.7);
assert.equal(summary.stats.reversed_rubles, 104.7);
assert.equal(summary.stats.payouts, 1);
assert.equal(summary.links.web, 'https://arseneleshaevwork-dotcom.github.io/baby-tma/?ref=maria');

const pending = buildPartnerSummary({ partner: { id: 'p', code: 'wait', name: 'Wait', status: 'pending' } });
assert.equal(pending.links, null);

const source = fs.readFileSync(new URL('../supabase/functions/partner-portal/index.ts', import.meta.url), 'utf8');
assert.match(source, /authenticateAppRequest/);
assert.match(source, /origin_not_allowed/);
assert.match(source, /commission_bps:\s*3000/);
assert.doesNotMatch(source, /body\.commission_bps/);

console.log('ok - partner self-service policy and aggregate portal');
