import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-admin-token',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const expected = Deno.env.get('ADMIN_TOKEN') || '';
  if (!expected || !safeEqual(req.headers.get('x-admin-token') || '', expected)) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!supabaseUrl || !serviceRoleKey || !botToken) return json({ error: 'server_not_configured' }, 500);
  const body = await req.json().catch(() => ({}));
  const telegramId = Number(body?.telegram_id);
  const action = String(body?.action || 'lookup');
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return json({ error: 'invalid_telegram_id' }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: user } = await supabase.from('users').select('id,telegram_id,username,first_name,last_seen_at').eq('telegram_id', telegramId).maybeSingle();
  if (!user && action !== 'send_message') return json({ error: 'user_not_found' }, 404);

  if (action === 'grant_premium') {
    const days = Math.max(1, Math.min(730, Number(body?.days) || 30));
    const { data: current } = await supabase.from('subscriptions').select('current_period_end').eq('telegram_id', telegramId).maybeSingle();
    const currentEnd = new Date(current?.current_period_end || 0).getTime();
    const startMs = Math.max(Date.now(), Number.isFinite(currentEnd) ? currentEnd : 0);
    const end = new Date(startMs + days * 86400000).toISOString();
    await supabase.from('subscriptions').upsert({
      user_id: user.id, telegram_id: telegramId, plan: days >= 365 ? 'year' : 'month', status: 'active', source: 'admin',
      current_period_start: new Date().toISOString(), current_period_end: end, updated_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' });
  } else if (action === 'revoke_premium') {
    await supabase.from('subscriptions').update({ status: 'revoked', current_period_end: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('telegram_id', telegramId);
  } else if (action === 'enable_reminders') {
    await supabase.from('notification_settings').upsert({
      user_id: user.id, telegram_id: telegramId, chat_id: telegramId, enabled: true,
      birthday_reminders: true, age_milestones: true, schedule_reminders: true, updated_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' });
  } else if (action === 'send_message') {
    const message = String(body?.message || '').trim().slice(0, 2000);
    if (!message) return json({ error: 'message_required' }, 400);
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: telegramId, text: message })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) return json({ error: result.description || 'telegram_send_failed' }, 502);
    return json({ ok: true, sent: true });
  } else if (action !== 'lookup') {
    return json({ error: 'unknown_action' }, 400);
  }

  const [{ data: baby }, { data: subscription }, { data: notifications }] = await Promise.all([
    supabase.from('babies').select('name,birthdate,age_months,updated_at').eq('user_id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('plan,status,source,current_period_end').eq('telegram_id', telegramId).maybeSingle(),
    supabase.from('notification_settings').select('enabled,birthday_reminders,age_milestones,schedule_reminders').eq('telegram_id', telegramId).maybeSingle()
  ]);
  return json({ ok: true, user, baby, subscription, notifications });
});

function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let value = 0; for (let i = 0; i < a.length; i++) value |= a.charCodeAt(i) ^ b.charCodeAt(i); return value === 0; }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
