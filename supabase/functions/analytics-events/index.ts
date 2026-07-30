import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROD_ORIGIN = 'https://arseneleshaevwork-dotcom.github.io';
const ALLOWED_EVENTS = new Set([
  'app_open', 'onboarding_start', 'onboarding_complete', 'profile_saved', 'schedule_generated',
  'schedule_reminders_planned', 'notifications_enabled', 'notifications_disabled', 'sleep_started',
  'sleep_finished', 'quick_tag_added', 'diary_saved', 'weekly_review_opened', 'pdf_report_exported',
  'age_article_opened', 'ai_opened', 'ai_consent_granted', 'ai_consent_declined', 'ai_consent_revoked',
  'ai_question_sent', 'ai_answer_received', 'ai_answer_failed', 'ai_feedback', 'premium_opened',
  'trial_started', 'subscribe_clicked', 'premium_paid', 'personal_plan_ready', 'next_sleep_started',
  'backup_exported', 'backup_imported'
]);

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const corsHeaders = buildCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, corsHeaders);
  }
  if (origin && !isAllowedOrigin(origin)) return json({ error: 'origin_not_allowed' }, 403, corsHeaders);
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 65536) return json({ error: 'payload_too_large' }, 413, corsHeaders);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'server_not_configured' }, 500, corsHeaders);
  }

  const body = await req.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events.slice(0, 20) : [];
  if (!events.length) return json({ ok: true, inserted: 0 }, 200, corsHeaders);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const forwardedIp = String(req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim();
  const clientHint = String(events[0]?.client_id || 'anonymous').slice(0, 100);
  const rateKey = await hmacHex(new TextEncoder().encode(serviceRoleKey), `${forwardedIp}:${clientHint}`);
  const { data: withinQuota, error: quotaError } = await supabase.rpc('consume_analytics_quota', {
    p_key_hash: rateKey,
    p_limit: 10
  });
  if (quotaError) return json({ error: 'rate_limit_unavailable' }, 503, corsHeaders);
  if (!withinQuota) return json({ error: 'rate_limit' }, 429, corsHeaders);

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const auth = botToken ? await verifyTelegramInitData(String(body?.init_data || ''), botToken) : { ok: false };
  const verifiedTelegramUser = auth.ok ? auth.user : null;
  let inserted = 0;

  for (const event of events) {
    const eventName = String(event?.event || '').slice(0, 64);
    if (!ALLOWED_EVENTS.has(eventName)) continue;
    const clientId = String(event?.client_id || '').slice(0, 100) || null;
    if (!verifiedTelegramUser && !/^[a-zA-Z0-9_-]{8,100}$/.test(clientId || '')) continue;
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

    if (verifiedTelegramUser && (baby.name || baby.birthdate || babyAgeMonths !== null) && userId) {
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
      if (!enabled && telegramUser?.id) {
        await supabase.from('schedule_reminders').update({ status: 'cancelled' })
          .eq('telegram_id', telegramUser.id).in('status', ['pending', 'processing']);
      }
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
      baby_name: verifiedTelegramUser ? String(baby.name || '').slice(0, 80) || null : null,
      baby_birthdate: verifiedTelegramUser && /^\d{4}-\d{2}-\d{2}$/.test(String(baby.birthdate || '')) ? baby.birthdate : null,
      baby_age_months: verifiedTelegramUser ? babyAgeMonths : null,
      attribution: sanitizePayload(event.attribution),
      payload,
      page: String(event.page || '').slice(0, 500) || null,
      user_agent: String(event.user_agent || '').slice(0, 500) || null,
      language: String(event.language || '').slice(0, 30) || null,
      created_at: validRecentDate(event.created_at) || new Date().toISOString()
    });

    if (!eventError) inserted++;
  }

  return json({ ok: true, inserted }, 200, corsHeaders);
});

function isAllowedOrigin(origin: string) {
  return origin === PROD_ORIGIN
    || origin === 'https://thanhtrucbc12-oss.github.io'
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function buildCorsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : PROD_ORIGIN,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

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

async function hmacHex(key: Uint8Array, data: string) {
  return [...await hmac(key, data)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false; let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function json(data: unknown, status = 200, headers: Record<string, string> = buildCorsHeaders('')) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}
