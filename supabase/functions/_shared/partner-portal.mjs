import { normalizePartnerCode } from './partners.mjs';

export const PARTNER_TERMS_VERSION = 'partner-v2-2026-08-22';

export function validatePartnerApplication(value = {}) {
  const name = String(value.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const code = normalizePartnerCode(value.code);
  const contact = String(value.contact || '').replace(/\s+/g, ' ').trim().slice(0, 160) || null;
  if (name.length < 2) return { ok: false, error: 'partner_name_required' };
  if (!code) return { ok: false, error: 'partner_code_invalid' };
  if (value.terms_accepted !== true) return { ok: false, error: 'partner_terms_required' };
  return { ok: true, name, code, contact };
}

export function buildPartnerSummary({ partner, referrals = [], commissions = [], payouts = [], now = new Date() } = {}) {
  if (!partner) return null;
  const nowMs = new Date(now).getTime();
  const pending = commissions.filter(item => item.status === 'pending');
  const paid = commissions.filter(item => item.status === 'paid');
  const reversed = commissions.filter(item => item.status === 'reversed');
  const available = pending.filter(item => new Date(item.available_at).getTime() <= nowMs);
  const safePartner = {
    id: partner.id,
    code: partner.code,
    name: partner.name,
    contact: partner.contact || null,
    status: partner.status,
    commission_percent: Number(partner.commission_bps || 0) / 100,
    applied_at: partner.applied_at || partner.created_at || null,
    reviewed_at: partner.reviewed_at || null,
    approved_at: partner.approved_at || null
  };
  return {
    partner: safePartner,
    links: partner.status === 'active' ? {
      web: `https://arseneleshaevwork-dotcom.github.io/baby-tma/?ref=${encodeURIComponent(partner.code)}`,
      bot: `https://t.me/babymode1_bot?start=ref_${encodeURIComponent(partner.code)}`
    } : null,
    stats: {
      referrals: referrals.length,
      conversions: commissions.length,
      gross_rubles: rubles(commissions.filter(item => item.status !== 'reversed'), 'amount_minor'),
      pending_rubles: rubles(pending, 'commission_minor'),
      available_rubles: rubles(available, 'commission_minor'),
      paid_rubles: rubles(paid, 'commission_minor'),
      reversed_rubles: rubles(reversed, 'commission_minor'),
      payouts: payouts.filter(item => item.status === 'paid').length
    }
  };
}

function rubles(items, field) {
  return Math.round(items.reduce((sum, item) => sum + Number(item[field] || 0), 0)) / 100;
}
