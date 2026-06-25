import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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
  const auth = await verifyTelegramInitData(String(body?.initData || ''), botToken);
  if (!auth.ok || !auth.user?.id) return json({ ok: false, error: 'telegram_auth_failed' }, 401);

  const telegramId = Number(auth.user.id);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan,status,current_period_end,source')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  const active = subscription?.status === 'active'
    && subscription?.current_period_end
    && new Date(subscription.current_period_end).getTime() > Date.now();

  return json({
    ok: true,
    active: Boolean(active),
    plan: active ? subscription.plan : null,
    status: active ? subscription.status : 'free',
    current_period_end: active ? subscription.current_period_end : null,
    source: active ? subscription.source : null
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
