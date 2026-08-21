import assert from 'node:assert/strict';
import {
  normalizePartnerCode,
  partnerCodeFromAttribution,
  partnerCommissionMinor,
  partnerReferralExpiry
} from '../supabase/functions/_shared/partners.mjs';

assert.equal(normalizePartnerCode('ref_Maria_Sleep'), 'maria_sleep');
assert.equal(normalizePartnerCode('partner-blog-1'), 'blog-1');
assert.equal(normalizePartnerCode('../bad'), '');
assert.equal(partnerCodeFromAttribution({ start_param: 'ref_MOM24' }), 'mom24');
assert.equal(partnerCodeFromAttribution({ start_param: 'tg_ad_sleep_test' }), '');
assert.equal(partnerCommissionMinor(34900, 3000), 10470);
assert.equal(partnerCommissionMinor(89900, 3000), 26970);
assert.equal(partnerCommissionMinor(-1, 3000), 0);
assert.equal(
  partnerReferralExpiry('2026-08-21T00:00:00.000Z', 30).toISOString(),
  '2026-09-20T00:00:00.000Z'
);

console.log('ok - partner attribution and commission policy');
