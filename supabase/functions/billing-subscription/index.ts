import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { authenticateBillingRequest } from '../_shared/billing-auth.ts';
import { authenticateAppRequest } from '../_shared/auth.ts';
import { hashGuestBillingKey, normalizeGuestBillingKey } from '../_shared/guest-billing.mjs';
import { corsHeaders, isAllowedOrigin, json, readJsonBody } from '../_shared/http.ts';

Deno.serve(async req => {
  const headers = corsHeaders(req);
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, headers);
  if (origin && !isAllowedOrigin(origin)) return json({ ok: false, error: 'origin_not_allowed' }, 403, headers);
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!botToken || !supabaseUrl || !serviceRoleKey) return json({ ok: false, error: 'server_not_configured' }, 503, headers);
  const parsedBody = await readJsonBody(req, 20_000);
  if (!parsedBody.ok) return json({ ok: false, error: parsedBody.error }, parsedBody.error === 'payload_too_large' ? 413 : 400, headers);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const body = parsedBody.value;
  const action = String(body?.action || 'status');

  if (action === 'claim_guest') {
    const appAuth = await authenticateAppRequest({ req, body, supabase, botToken });
    const guestKey = normalizeGuestBillingKey(body?.guest_key);
    if (!appAuth.ok || !['web_session', 'mini_app'].includes(appAuth.method) || !guestKey) {
      return json({ ok: false, error: 'verified_telegram_and_guest_key_required' }, 401, headers);
    }
    const { data, error } = await supabase.rpc('claim_web_billing_guest_internal', {
      p_token_hash: await hashGuestBillingKey(guestKey),
      p_target_user_id: appAuth.user.id,
      p_target_telegram_id: appAuth.telegramId
    });
    if (error) {
      const conflict = /target_billing_exists|guest_already_linked/.test(error.message || '');
      return json({ ok: false, error: conflict ? 'billing_claim_conflict' : 'billing_claim_failed' }, conflict ? 409 : 400, headers);
    }
    const result = Array.isArray(data) ? data[0] : data;
    return json({ ok: true, claimed: Boolean(result?.claimed), current_period_end: result?.current_period_end || null }, 200, headers);
  }

  if (action === 'cancel_stars' || action === 'resume_stars') {
    const appAuth = await authenticateAppRequest({ req, body, supabase, botToken });
    if (!appAuth.ok) return json({ ok: false, error: appAuth.error || 'telegram_auth_required' }, 401, headers);
    const { data: subscription } = await supabase.from('subscriptions')
      .select('id,plan,status,source,current_period_end,next_billing_at,last_telegram_payment_charge_id')
      .eq('telegram_id', appAuth.telegramId).maybeSingle();
    if (!subscription || subscription.source !== 'telegram_stars' || subscription.plan !== 'month'
      || !subscription.last_telegram_payment_charge_id) {
      return json({ ok: false, error: 'recurring_stars_not_found' }, 404, headers);
    }
    const isCanceled = action === 'cancel_stars';
    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/editUserStarSubscription`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: appAuth.telegramId,
        telegram_payment_charge_id: subscription.last_telegram_payment_charge_id,
        is_canceled: isCanceled
      })
    });
    const telegramData = await telegramResponse.json().catch(() => ({}));
    if (!telegramResponse.ok || !telegramData.ok) {
      return json({ ok: false, error: 'telegram_subscription_update_failed' }, 502, headers);
    }
    const { error } = await supabase.from('subscriptions').update({
      cancel_at_period_end: isCanceled,
      next_billing_at: isCanceled ? null : subscription.current_period_end,
      updated_at: new Date().toISOString()
    }).eq('id', subscription.id);
    if (error) return json({ ok: false, error: 'subscription_update_failed' }, 500, headers);
    return json({ ok: true, cancel_at_period_end: isCanceled, current_period_end: subscription.current_period_end }, 200, headers);
  }

  const auth = await authenticateBillingRequest({ req, body, supabase, botToken });
  if (!auth.ok || !['web_session', 'billing_guest'].includes(auth.method)) {
    return json({ ok: false, error: auth.error || 'billing_identity_required' }, 401, headers);
  }
  const { data: agreement } = await supabase.from('billing_agreements')
    .select('id,plan,status,next_charge_at,current_period_end,cancel_at_period_end,payment_method_type,last_error')
    .eq('provider', 'yookassa').eq('telegram_id', auth.telegramId).maybeSingle();
  if (!agreement) return json({ ok: true, agreement: null }, 200, headers);
  if (['cancel', 'resume'].includes(action) && agreement.payment_method_type === 'one_time') {
    return json({ ok: false, error: 'recurring_not_available' }, 409, headers);
  }

  if (action === 'cancel') {
    const { error: agreementError } = await supabase.from('billing_agreements').update({
      status: 'cancelled', cancel_at_period_end: true, updated_at: new Date().toISOString()
    }).eq('id', agreement.id);
    if (agreementError) return json({ ok: false, error: 'billing_update_failed' }, 500, headers);
    const { error: subscriptionError } = await supabase.from('subscriptions').update({
      cancel_at_period_end: true, next_billing_at: null, updated_at: new Date().toISOString()
    }).eq('telegram_id', auth.telegramId).eq('source', 'yookassa');
    if (subscriptionError) return json({ ok: false, error: 'billing_update_failed' }, 500, headers);
    return json({ ok: true, agreement: { ...agreement, status: 'cancelled', cancel_at_period_end: true } }, 200, headers);
  }
  if (action === 'resume') {
    if (new Date(agreement.current_period_end).getTime() <= Date.now()) {
      return json({ ok: false, error: 'billing_period_expired' }, 409, headers);
    }
    const { error: agreementError } = await supabase.from('billing_agreements').update({
      status: 'active', cancel_at_period_end: false, next_charge_at: agreement.current_period_end,
      retry_count: 0, last_error: null, updated_at: new Date().toISOString()
    }).eq('id', agreement.id);
    if (agreementError) return json({ ok: false, error: 'billing_update_failed' }, 500, headers);
    const { error: subscriptionError } = await supabase.from('subscriptions').update({
      cancel_at_period_end: false, next_billing_at: agreement.current_period_end, last_error: null, updated_at: new Date().toISOString()
    }).eq('telegram_id', auth.telegramId).eq('source', 'yookassa');
    if (subscriptionError) return json({ ok: false, error: 'billing_update_failed' }, 500, headers);
    return json({ ok: true, agreement: { ...agreement, status: 'active', cancel_at_period_end: false } }, 200, headers);
  }
  if (action !== 'status') return json({ ok: false, error: 'invalid_action' }, 400, headers);
  return json({ ok: true, agreement }, 200, headers);
});
