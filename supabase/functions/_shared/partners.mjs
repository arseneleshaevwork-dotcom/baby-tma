const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export function normalizePartnerCode(value) {
  let code = String(value || '').trim().toLowerCase();
  code = code.replace(/^(?:ref|partner)[_-]/, '');
  return CODE_PATTERN.test(code) ? code : '';
}

export function partnerCodeFromAttribution(attribution) {
  const direct = attribution?.partner_code || attribution?.ref || '';
  if (direct) return normalizePartnerCode(direct);
  const startParam = String(attribution?.start_param || '');
  return /^(?:ref|partner)[_-]/i.test(startParam) ? normalizePartnerCode(startParam) : '';
}

export function partnerReferralExpiry(capturedAt, attributionDays) {
  const start = new Date(capturedAt);
  const days = Math.max(1, Math.min(365, Number(attributionDays) || 30));
  return new Date(start.getTime() + days * 86400_000);
}

export function partnerCommissionWindowEnd(convertedAt, commissionDays) {
  const start = new Date(convertedAt);
  const days = Math.max(1, Math.min(365, Number(commissionDays) || 62));
  return new Date(start.getTime() + days * 86400_000);
}

export function partnerPaymentEligibility({ paymentAt, referralExpiresAt, commissionEndsAt, existingPayments = 0, paymentLimit = 2 }) {
  const paymentTime = new Date(paymentAt).getTime();
  const count = Math.max(0, Number(existingPayments) || 0);
  const limit = Math.max(1, Math.min(12, Number(paymentLimit) || 2));
  if (!Number.isFinite(paymentTime) || count >= limit) return { eligible: false, paymentNumber: null };

  const deadline = count === 0 ? referralExpiresAt : commissionEndsAt;
  const deadlineTime = new Date(deadline || 0).getTime();
  return {
    eligible: Number.isFinite(deadlineTime) && paymentTime <= deadlineTime,
    paymentNumber: count + 1
  };
}

export function partnerCommissionMinor(amountMinor, commissionBps) {
  const amount = Number(amountMinor);
  const bps = Number(commissionBps);
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(bps) || bps < 0 || bps > 5000) return 0;
  return Math.floor(amount * bps / 10000);
}

export async function claimPartnerReferral({ supabase, code, userId, billingIdentityId, source, now = new Date() }) {
  const normalized = normalizePartnerCode(code);
  const identity = Number(billingIdentityId);
  if (!normalized || !Number.isSafeInteger(identity) || identity === 0 || !userId) return null;

  const { data: existing } = await supabase.from('partner_referrals')
    .select('id,partner_id,code,captured_at,expires_at,converted_at,commission_ends_at')
    .eq('billing_identity_id', identity)
    .maybeSingle();
  const nowTime = new Date(now).getTime();
  const attributionActive = existing && new Date(existing.expires_at).getTime() >= nowTime;
  const commissionActive = existing?.commission_ends_at && new Date(existing.commission_ends_at).getTime() >= nowTime;
  if (existing?.converted_at || attributionActive || commissionActive) return existing;

  const { data: partner } = await supabase.from('partners')
    .select('id,code,attribution_days')
    .eq('code', normalized)
    .eq('status', 'active')
    .maybeSingle();
  if (!partner) return null;

  const capturedAt = new Date(now);
  const expiresAt = partnerReferralExpiry(capturedAt, partner.attribution_days);
  const referralValues = {
    partner_id: partner.id,
    user_id: userId,
    billing_identity_id: identity,
    source,
    code: partner.code,
    captured_at: capturedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    converted_at: null,
    commission_ends_at: null
  };
  const mutation = existing
    ? supabase.from('partner_referrals').update(referralValues).eq('id', existing.id)
    : supabase.from('partner_referrals').insert(referralValues);
  const { data, error } = await mutation.select('id,partner_id,code,captured_at,expires_at,converted_at,commission_ends_at').maybeSingle();

  if (!error) return data;
  const { data: raced } = await supabase.from('partner_referrals')
    .select('id,partner_id,code,captured_at,expires_at,converted_at,commission_ends_at')
    .eq('billing_identity_id', identity)
    .maybeSingle();
  return raced || null;
}

export async function accruePartnerCommission({ supabase, payment, paidAt = new Date() }) {
  if (!payment?.id || payment.currency !== 'RUB' || payment.status !== 'paid') return null;
  const identity = Number(payment.telegram_id);
  const amountMinor = Number(payment.total_amount);
  if (!Number.isSafeInteger(identity) || identity === 0 || !Number.isInteger(amountMinor) || amountMinor <= 0) return null;

  const paymentTime = new Date(paidAt);
  const { data: referral } = await supabase.from('partner_referrals')
    .select('id,partner_id,captured_at,expires_at,converted_at,commission_ends_at')
    .eq('billing_identity_id', identity)
    .lte('captured_at', paymentTime.toISOString())
    .maybeSingle();
  if (!referral) return null;

  const { data: partner } = await supabase.from('partners')
    .select('commission_bps,hold_days,commission_payment_limit,commission_days')
    .eq('id', referral.partner_id)
    .maybeSingle();
  if (!partner) return null;

  const { data: existingCommission } = await supabase.from('partner_commissions')
    .select('id,status,commission_minor,available_at,payment_number')
    .eq('payment_id', payment.id)
    .maybeSingle();
  if (existingCommission) return existingCommission;

  const { data: priorCommissions, error: priorError } = await supabase.from('partner_commissions')
    .select('payment_number')
    .eq('referral_id', referral.id);
  if (priorError) return null;

  const eligibility = partnerPaymentEligibility({
    paymentAt: paymentTime,
    referralExpiresAt: referral.expires_at,
    commissionEndsAt: referral.commission_ends_at,
    existingPayments: priorCommissions?.length || 0,
    paymentLimit: partner.commission_payment_limit
  });
  if (!eligibility.eligible) return null;

  if (eligibility.paymentNumber === 1) {
    const convertedAt = paymentTime.toISOString();
    const commissionEndsAt = partnerCommissionWindowEnd(paymentTime, partner.commission_days).toISOString();
    const { error: referralError } = await supabase.from('partner_referrals').update({
      converted_at: convertedAt,
      commission_ends_at: commissionEndsAt
    }).eq('id', referral.id);
    if (referralError) return null;
  }

  const commissionBps = Number(partner.commission_bps || 0);
  const commissionMinor = partnerCommissionMinor(amountMinor, commissionBps);
  if (commissionMinor <= 0) return null;
  const availableAt = new Date(paymentTime.getTime() + Number(partner.hold_days || 0) * 86400_000);
  const { data, error } = await supabase.from('partner_commissions').insert({
    partner_id: referral.partner_id,
    referral_id: referral.id,
    payment_id: payment.id,
    amount_minor: amountMinor,
    commission_bps: commissionBps,
    commission_minor: commissionMinor,
    payment_number: eligibility.paymentNumber,
    currency: 'RUB',
    status: 'pending',
    available_at: availableAt.toISOString()
  }).select('id,status,commission_minor,available_at,payment_number').maybeSingle();

  if (!error) return data;
  const { data: existing } = await supabase.from('partner_commissions')
    .select('id,status,commission_minor,available_at,payment_number')
    .eq('payment_id', payment.id)
    .maybeSingle();
  return existing || null;
}

export async function reversePartnerCommission({ supabase, paymentId, fullRefund = true }) {
  if (!fullRefund || !paymentId) return null;
  const reversedAt = new Date().toISOString();
  const { data } = await supabase.from('partner_commissions').update({
    status: 'reversed',
    reversed_at: reversedAt,
    updated_at: reversedAt
  }).eq('payment_id', paymentId).neq('status', 'reversed')
    .select('id,status,commission_minor,payout_id').maybeSingle();
  return data || null;
}
