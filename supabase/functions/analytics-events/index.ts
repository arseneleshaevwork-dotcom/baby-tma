import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'server_not_configured' }, 500);
  }

  const body = await req.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events.slice(0, 50) : [];
  if (!events.length) return json({ ok: true, inserted: 0 });

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const auth = botToken ? await verifyTelegramInitData(String(body?.init_data || ''), botToken) : { ok: false };
  const verifiedTelegramUser = auth.ok ? auth.user : null;
  let inserted = 0;

  for (const event of events) {
    const eventName = String(event?.event || '').slice(0, 64);
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(eventName)) continue;
    const clientId = String(event?.client_id || '').slice(0, 100) || null;
    const payload = sanitizePayload(event?.payload);
    const telegramUser = verifiedTelegramUser;
    const baby = event.baby || {};
    const babyAgeMonths = baby.ageMonths === undefined ? null : baby.ageMonths;
    let userId: string | null = null;

    if (telegramUser?.id) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .upsert({
          telegram_id: telegramUser.id,
          username: telegramUser.username || null,
          first_name: telegramUser.first_name || null,
          language_code: telegramUser.language_code || null,
          client_id: event.client_id || null,
          last_seen_at: new Date().toISOString()
        }, { onConflict: 'telegram_id' })
        .select('id')
        .single();

      if (!userError) userId = user?.id || null;
    }

    if ((baby.name || baby.birthdate || babyAgeMonths !== null) && (userId || clientId)) {
      await supabase
        .from('babies')
        .upsert({
          user_id: userId,
          client_id: clientId,
          name: String(baby.name || '').slice(0, 80) || null,
          birthdate: /^\d{4}-\d{2}-\d{2}$/.test(String(baby.birthdate || '')) ? baby.birthdate : null,
          age_months: Number.isFinite(Number(babyAgeMonths)) ? Math.max(0, Math.min(60, Number(babyAgeMonths))) : null,
          updated_at: new Date().toISOString()
        }, { onConflict: userId ? 'user_id' : 'client_id' });
    }

    if ((eventName === 'notifications_enabled' || eventName === 'notifications_disabled') && (userId || clientId || telegramUser?.id)) {
      const enabled = eventName === 'notifications_enabled';
      const setting = {
        user_id: userId,
        telegram_id: telegramUser?.id || event.payload?.telegram_user_id || null,
        client_id: clientId,
        chat_id: telegramUser?.id || null,
        enabled,
        timezone: String(payload?.timezone || 'Europe/Moscow').slice(0, 80),
        birthday_reminders: Boolean(payload?.birthday_reminders ?? enabled),
        age_milestones: Boolean(payload?.age_milestones ?? enabled),
        schedule_reminders: Boolean(payload?.schedule_reminders ?? false),
        updated_at: new Date().toISOString()
      };
      await supabase
        .from('notification_settings')
        .upsert(setting, { onConflict: userId ? 'user_id' : (setting.telegram_id ? 'telegram_id' : 'client_id') });
    }

    if (eventName === 'schedule_reminders_planned' && telegramUser?.id && Array.isArray(payload?.reminders)) {
      const now = Date.now();
      const reminders = payload.reminders.slice(0, 16).map((item: any) => {
        const scheduledAt = new Date(item?.at || '');
        if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < now - 60000 || scheduledAt.getTime() > now + 86400000) return null;
        return {
          user_id: userId,
          telegram_id: telegramUser.id,
          chat_id: telegramUser.id,
          reminder_key: String(item?.id || '').slice(0, 120),
          reminder_type: String(item?.type || 'active').slice(0, 30),
          title: String(item?.title || 'Событие режима').slice(0, 120),
          message: String(item?.message || 'Пора свериться с режимом малыша').slice(0, 500),
          scheduled_at: scheduledAt.toISOString(),
          status: 'pending'
        };
      }).filter(Boolean);
      if (reminders.length) {
        await supabase.from('schedule_reminders').update({ status: 'cancelled' })
          .eq('telegram_id', telegramUser.id).eq('status', 'pending').gte('scheduled_at', new Date(now).toISOString());
        await supabase.from('schedule_reminders').upsert(reminders, { onConflict: 'telegram_id,reminder_key,scheduled_at' });
      }
    }

    const { error: eventError } = await supabase.from('events').insert({
      event_name: eventName,
      user_id: userId,
      client_id: clientId,
      session_id: String(event.session_id || '').slice(0, 100) || null,
      telegram_id: telegramUser?.id || null,
      baby_name: String(baby.name || '').slice(0, 80) || null,
      baby_birthdate: /^\d{4}-\d{2}-\d{2}$/.test(String(baby.birthdate || '')) ? baby.birthdate : null,
      baby_age_months: babyAgeMonths,
      attribution: sanitizePayload(event.attribution),
      payload,
      page: String(event.page || '').slice(0, 500) || null,
      user_agent: String(event.user_agent || '').slice(0, 500) || null,
      language: String(event.language || '').slice(0, 30) || null,
      created_at: validRecentDate(event.created_at) || new Date().toISOString()
    });

    if (!eventError) inserted++;
  }

  return json({ ok: true, inserted });
});

function sanitizePayload(value: any) {
  try {
    const jsonValue = JSON.stringify(value && typeof value === 'object' ? value : {});
    return JSON.parse(jsonValue.slice(0, 12000));
  } catch (_) { return {}; }
}

function validRecentDate(value: any) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime()) || Math.abs(Date.now() - date.getTime()) > 7 * 86400000) return null;
  return date.toISOString();
}

async function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData); const hash = params.get('hash'); if (!hash) return { ok: false };
  params.delete('hash'); const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return { ok: false };
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const key = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  const signature = [...await hmac(key, check)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (!timingSafeEqual(signature, hash)) return { ok: false };
  return { ok: true, user: JSON.parse(params.get('user') || '{}') };
}

async function hmac(key: Uint8Array, data: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false; let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
