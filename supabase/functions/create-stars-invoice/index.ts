import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const PLANS = {
  month: {
    label: 'Premium на 30 дней',
    stars: 299,
    days: 30
  },
  year: {
    label: 'Premium на 1 год',
    stars: 1490,
    days: 365
  }
} as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!botToken || !supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: 'server_not_configured' }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const planKey = String(body?.plan || 'month') as keyof typeof PLANS;
  const plan = PLANS[planKey] || PLANS.month;
  const initData = String(body?.initData || '');
  const auth = await verifyTelegramInitData(initData, botToken);
  if (!auth.ok || !auth.user?.id) return json({ ok: false, error: 'telegram_auth_failed' }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const telegramId = Number(auth.user.id);
  const { data: user, error: userError } = await supabase
    .from('users')
    .upsert({
      telegram_id: telegramId,
      username: auth.user.username || null,
      first_name: auth.user.first_name || null,
      language_code: auth.user.language_code || null,
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' })
    .select('id')
    .single();

  if (userError || !user?.id) return json({ ok: false, error: 'user_upsert_failed' }, 500);

  const payload = `premium:${planKey}:${telegramId}:${crypto.randomUUID()}`;
  await supabase.from('payments').insert({
    user_id: user.id,
    telegram_id: telegramId,
    invoice_payload: payload,
    plan: planKey,
    currency: 'XTR',
    total_amount: plan.stars,
    status: 'created'
  });

  const invoiceResponse = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: plan.label,
      description: 'Premium-функции: расширенный дневник, отчеты, подсказки, напоминания и аналитика.',
      payload,
      currency: 'XTR',
      prices: [{ label: plan.label, amount: plan.stars }]
    })
  });

  const invoice = await invoiceResponse.json().catch(() => null);
  if (!invoiceResponse.ok || !invoice?.ok || !invoice?.result) {
    await supabase
      .from('payments')
      .update({ status: 'invoice_failed', raw_payload: invoice || {} })
      .eq('invoice_payload', payload);
    return json({ ok: false, error: 'invoice_failed' }, 502);
  }

  return json({
    ok: true,
    invoice_link: invoice.result,
    plan: planKey,
    stars: plan.stars
  });
});

async function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false };
  params.delete('hash');

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return { ok: false };

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = await hmac('WebAppData', botToken);
  const signature = await hmacHex(secret, dataCheckString);
  if (!timingSafeEqual(signature, hash)) return { ok: false };

  const user = JSON.parse(params.get('user') || '{}');
  return { ok: true, user };
}

async function hmac(key: string, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
}

async function hmacHex(key: Uint8Array, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
