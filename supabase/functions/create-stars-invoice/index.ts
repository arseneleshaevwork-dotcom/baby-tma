import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { upsertTelegramUser, verifyTelegramInitData } from '../_shared/auth.ts';
import { corsHeaders, isAllowedOrigin, json, readJsonBody } from '../_shared/http.ts';

const PLANS = {
  month: {
    label: 'Premium на 30 дней',
    stars: 299,
    days: 30
  },
  quarter: {
    label: 'Premium на 3 месяца',
    stars: 769,
    days: 90
  }
} as const;

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

  const parsedBody = await readJsonBody(req, 20_000);
  if (!parsedBody.ok) return json({ ok: false, error: parsedBody.error }, parsedBody.error === 'payload_too_large' ? 413 : 400, headers);
  const body = parsedBody.value;
  const requestedPlan = String(body?.plan || '');
  if (!(requestedPlan in PLANS)) return json({ ok: false, error: 'invalid_plan' }, 400, headers);
  const planKey = requestedPlan as keyof typeof PLANS;
  const plan = PLANS[planKey];
  const initData = String(body?.initData || '');
  const auth = await verifyTelegramInitData(initData, botToken);
  if (!auth.ok || !auth.user?.id) return json({ ok: false, error: 'telegram_auth_failed' }, 401, headers);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const telegramId = Number(auth.user.id);
  const user = await upsertTelegramUser(supabase, auth.user);
  if (!user?.id) return json({ ok: false, error: 'user_upsert_failed' }, 500, headers);

  const recentInvoiceWindow = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recentInvoices } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('telegram_id', telegramId)
    .eq('status', 'created')
    .gte('created_at', recentInvoiceWindow);
  if ((recentInvoices || 0) >= 5) return json({ ok: false, error: 'invoice_rate_limit' }, 429, headers);

  const payload = `premium:${planKey}:${telegramId}:${crypto.randomUUID()}`;
  const { error: paymentError } = await supabase.from('payments').insert({
    user_id: user.id,
    telegram_id: telegramId,
    invoice_payload: payload,
    plan: planKey,
    currency: 'XTR',
    total_amount: plan.stars,
    status: 'created',
    provider: 'telegram_stars'
  });
  if (paymentError) return json({ ok: false, error: 'payment_create_failed' }, 500, headers);

  const invoiceResponse = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: plan.label,
      description: 'Premium-функции: расширенный дневник, отчеты, подсказки, напоминания и аналитика.',
      payload,
      currency: 'XTR',
      prices: [{ label: plan.label, amount: plan.stars }],
      ...(planKey === 'month' ? { subscription_period: 2592000 } : {})
    })
  });

  const invoice = await invoiceResponse.json().catch(() => null);
  if (!invoiceResponse.ok || !invoice?.ok || !invoice?.result) {
    await supabase
      .from('payments')
      .update({ status: 'invoice_failed', raw_payload: invoice || {} })
      .eq('invoice_payload', payload);
    return json({ ok: false, error: 'invoice_failed' }, 502, headers);
  }

  return json({
    ok: true,
    invoice_link: invoice.result,
    plan: planKey,
    stars: plan.stars
  }, 200, headers);
});
