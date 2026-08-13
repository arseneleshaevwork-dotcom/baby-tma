import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateBillingRequest } from '../_shared/billing-auth.ts';
import { corsHeaders, isAllowedOrigin, json } from '../_shared/http.ts';

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
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const body = await req.json().catch(() => ({}));
  const auth = await authenticateBillingRequest({ req, body, supabase, botToken });
  if (!auth.ok || !['web_session', 'billing_guest'].includes(auth.method)) {
    return json({ ok: false, error: auth.error || 'billing_identity_required' }, 401, headers);
  }
  const action = String(body?.action || 'status');
  const { data: agreement } = await supabase.from('billing_agreements')
    .select('id,plan,status,next_charge_at,current_period_end,cancel_at_period_end,payment_method_type,last_error')
    .eq('provider', 'yookassa').eq('telegram_id', auth.telegramId).maybeSingle();
  if (!agreement) return json({ ok: true, agreement: null }, 200, headers);

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
