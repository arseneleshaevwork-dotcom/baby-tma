import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateAppRequest } from '../_shared/auth.ts';
import { corsHeaders, isAllowedOrigin, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, headers);
  if (origin && !isAllowedOrigin(origin)) return json({ ok: false, error: 'origin_not_allowed' }, 403, headers);

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!botToken || !supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: 'server_not_configured' }, 500, headers);
  }

  const body = await req.json().catch(() => ({}));
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const auth = await authenticateAppRequest({ req, body, supabase, botToken });
  if (!auth.ok) return json({ ok: false, error: auth.error || 'auth_failed' }, 401, headers);
  const telegramId = Number(auth.telegramId);
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan,status,current_period_end,source,cancel_at_period_end,next_billing_at,payment_method_type,last_error')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (body?.start_trial) {
    if (subscription) return json({ ok: false, error: 'trial_already_used' }, 409, headers);
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 86400000);
    const { error } = await supabase.from('subscriptions').insert({
      user_id: auth.user.id,
      telegram_id: telegramId,
      plan: 'trial',
      status: 'active',
      source: 'trial',
      current_period_start: start.toISOString(),
      current_period_end: end.toISOString()
    });
    if (error) return json({ ok: false, error: 'trial_create_failed' }, 500, headers);
    return json({ ok: true, active: true, plan: 'trial', status: 'trial', current_period_end: end.toISOString(), source: 'trial' }, 200, headers);
  }

  const active = subscription?.status === 'active'
    && subscription?.current_period_end
    && new Date(subscription.current_period_end).getTime() > Date.now();

  return json({
    ok: true,
    active: Boolean(active),
    plan: active ? subscription.plan : null,
    status: active && subscription.source === 'trial' ? 'trial' : (active ? subscription.status : 'free'),
    current_period_end: active ? subscription.current_period_end : null,
    source: active ? subscription.source : null,
    trial_used: Boolean(subscription),
    cancel_at_period_end: active ? Boolean(subscription.cancel_at_period_end) : false,
    next_billing_at: active ? subscription.next_billing_at : null,
    payment_method_type: active ? subscription.payment_method_type : null,
    last_error: active ? subscription.last_error : null
  }, 200, headers);
});
