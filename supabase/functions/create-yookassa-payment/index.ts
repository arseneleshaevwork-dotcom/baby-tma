import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateBillingRequest } from '../_shared/billing-auth.ts';
import { getBillingPlan } from '../_shared/billing.mjs';
import { corsHeaders, isAllowedOrigin, json, sha256Hex } from '../_shared/http.ts';
import { redactPayment, yookassaPaymentBody, yookassaRequest } from '../_shared/yookassa.ts';

Deno.serve(async req => {
  const headers = corsHeaders(req);
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, headers);
  if (origin && !isAllowedOrigin(origin)) return json({ ok: false, error: 'origin_not_allowed' }, 403, headers);
  if (Number(req.headers.get('content-length') || 0) > 20_000) {
    return json({ ok: false, error: 'payload_too_large' }, 413, headers);
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webAppUrl = Deno.env.get('WEB_APP_URL') || 'https://arseneleshaevwork-dotcom.github.io/baby-tma/';
  if (!botToken || !supabaseUrl || !serviceRoleKey || !Deno.env.get('YOOKASSA_SHOP_ID') || !Deno.env.get('YOOKASSA_SECRET_KEY')) {
    return json({ ok: false, error: 'payments_not_configured' }, 503, headers);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const forwardedIp = String(req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown')
    .split(',')[0].trim();
  const fingerprint = await sha256Hex(`${serviceRoleKey}:${forwardedIp}:${String(req.headers.get('user-agent') || '').slice(0, 180)}`);
  const { data: withinQuota, error: quotaError } = await supabase.rpc('consume_analytics_quota', {
    p_key_hash: `billing:${fingerprint}`,
    p_limit: 12
  });
  if (quotaError) return json({ ok: false, error: 'rate_limit_unavailable' }, 503, headers);
  if (!withinQuota) return json({ ok: false, error: 'payment_rate_limit' }, 429, headers);
  const body = await req.json().catch(() => ({}));
  const auth = await authenticateBillingRequest({ req, body, supabase, botToken, createGuest: true });
  if (!auth.ok || !['web_session', 'billing_guest'].includes(auth.method)) {
    return json({ ok: false, error: auth.error || 'billing_identity_required' }, 401, headers);
  }
  const plan = getBillingPlan(body?.plan);
  if (!plan) return json({ ok: false, error: 'invalid_plan' }, 400, headers);
  if (body?.terms_accepted !== true || body?.recurring_accepted !== true) {
    return json({ ok: false, error: 'billing_consent_required' }, 400, headers);
  }

  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: pendingPayment } = await supabase.from('payments')
    .select('id,plan,idempotency_key').eq('telegram_id', auth.telegramId).eq('provider', 'yookassa')
    .eq('status', 'created').gte('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (pendingPayment && pendingPayment.plan !== plan.key) {
    return json({ ok: false, error: 'payment_already_in_progress', plan: pendingPayment.plan }, 409, headers);
  }
  const { count } = await supabase.from('payments').select('id', { count: 'exact', head: true })
    .eq('telegram_id', auth.telegramId).eq('provider', 'yookassa').eq('status', 'created').gte('created_at', since);
  if ((count || 0) >= 5) return json({ ok: false, error: 'payment_rate_limit' }, 429, headers);

  const paymentId = pendingPayment?.id || crypto.randomUUID();
  const idempotencyKey = pendingPayment?.idempotency_key || crypto.randomUUID();
  const now = new Date().toISOString();
  if (!pendingPayment) {
    const { error: insertError } = await supabase.from('payments').insert({
      id: paymentId,
      user_id: auth.user.id,
      telegram_id: auth.telegramId,
      invoice_payload: `yookassa:${paymentId}`,
      plan: plan.key,
      currency: 'RUB',
      total_amount: plan.amountMinor,
      status: 'created',
      provider: 'yookassa',
      idempotency_key: idempotencyKey,
      raw_payload: {
        terms_accepted_at: now,
        terms_version: '2026-08-02',
        recurring_accepted: true
      }
    });
    if (insertError) return json({ ok: false, error: 'payment_create_failed' }, 500, headers);
  }

  try {
    const returnUrl = new URL(webAppUrl);
    returnUrl.searchParams.set('payment', 'return');
    const payment = await yookassaRequest('/payments', {
      method: 'POST',
      idempotenceKey: idempotencyKey,
      body: yookassaPaymentBody({
        plan,
        paymentId,
        telegramId: auth.telegramId,
        customerType: auth.customerType,
        returnUrl: returnUrl.toString()
      })
    });
    const confirmationUrl = String(payment?.confirmation?.confirmation_url || '');
    if (!/^https:\/\//.test(confirmationUrl) || !payment?.id) throw new Error('confirmation_missing');
    await supabase.from('payments').update({
      external_payment_id: String(payment.id), raw_payload: redactPayment(payment), updated_at: new Date().toISOString()
    }).eq('id', paymentId).neq('status', 'paid');
    return json({ ok: true, confirmation_url: confirmationUrl, payment_id: paymentId, plan: plan.key }, 200, headers);
  } catch (error) {
    await supabase.from('payments').update({
      error_code: error instanceof Error ? error.message.slice(0, 120) : 'provider_error', updated_at: new Date().toISOString()
    }).eq('id', paymentId);
    return json({ ok: false, error: 'provider_unavailable' }, 502, headers);
  }
});
