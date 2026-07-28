import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  AI_CONSENT_VERSION,
  FREE_DAILY_LIMIT,
  MAX_QUESTION_LENGTH,
  PREMIUM_DAILY_LIMIT,
  sanitizeAgeMonths,
  sanitizeDiary,
  sanitizeQuestion
} from './policy.mjs';

const AGENT_NAME = 'baby-agent';
const ALLOWED_ORIGINS = new Set([
  'https://arseneleshaevwork-dotcom.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
]);

Deno.serve(async req => {
  const origin = req.headers.get('origin') || '';
  const corsHeaders = buildCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, corsHeaders);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, error: 'origin_not_allowed' }, 403, corsHeaders);

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const agentUrl = Deno.env.get('BABY_AGENT_URL');
  const agentSecret = Deno.env.get('BABY_AGENT_SHARED_SECRET');
  if (!botToken || !supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: 'server_not_configured' }, 500, corsHeaders);
  }

  const body = await req.json().catch(() => ({}));
  const auth = await verifyTelegramInitData(String(body?.initData || ''), botToken);
  if (!auth.ok || !auth.user?.id) return json({ ok: false, error: 'telegram_auth_failed' }, 401, corsHeaders);

  const telegramId = Number(auth.user.id);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: user } = await supabase.from('users').upsert({
    telegram_id: telegramId,
    username: auth.user.username || null,
    first_name: auth.user.first_name || null,
    language_code: auth.user.language_code || null,
    last_seen_at: new Date().toISOString()
  }, { onConflict: 'telegram_id' }).select('id').single();

  if (body?.action === 'revoke_consent') {
    await supabase.from('ai_consents').upsert({
      telegram_id: telegramId,
      user_id: user?.id || null,
      consent_version: AI_CONSENT_VERSION,
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' });
    return json({ ok: true, consent: false }, 200, corsHeaders);
  }

  if (body?.action === 'feedback') {
    const requestId = String(body?.requestId || '');
    const rating = String(body?.rating || '');
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || !['helpful', 'not_helpful'].includes(rating)) {
      return json({ ok: false, error: 'invalid_feedback' }, 400, corsHeaders);
    }
    const { data, error } = await supabase.from('ai_requests').update({
      feedback: rating,
      feedback_at: new Date().toISOString()
    }).eq('id', requestId).eq('telegram_id', telegramId).eq('status', 'completed').select('id').maybeSingle();
    if (error) return json({ ok: false, error: 'feedback_failed' }, 500, corsHeaders);
    if (!data) return json({ ok: false, error: 'request_not_found' }, 404, corsHeaders);
    return json({ ok: true }, 200, corsHeaders);
  }

  if (body?.consent !== true) return json({ ok: false, error: 'consent_required' }, 403, corsHeaders);

  const question = sanitizeQuestion(body?.question);
  if (question.length < 2 || question.length > MAX_QUESTION_LENGTH) {
    return json({ ok: false, error: 'invalid_question' }, 400, corsHeaders);
  }

  await supabase.from('ai_consents').upsert({
    telegram_id: telegramId,
    user_id: user?.id || null,
    consent_version: AI_CONSENT_VERSION,
    granted_at: new Date().toISOString(),
    revoked_at: null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'telegram_id' });

  const { data: subscription } = await supabase.from('subscriptions')
    .select('status,current_period_end').eq('telegram_id', telegramId).maybeSingle();
  const premium = subscription?.status === 'active'
    && subscription.current_period_end
    && new Date(subscription.current_period_end).getTime() > Date.now();
  const dailyLimit = premium ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase.from('ai_requests').select('id', { count: 'exact', head: true })
    .eq('telegram_id', telegramId).in('status', ['started', 'completed']).gte('created_at', since.toISOString());
  if ((count || 0) >= dailyLimit) {
    return json({ ok: false, error: 'daily_limit', limit: dailyLimit }, 429, corsHeaders);
  }
  if (!agentUrl || !agentSecret) return json({ ok: false, error: 'ai_not_configured' }, 503, corsHeaders);

  const ageMonths = sanitizeAgeMonths(body?.ageMonths);
  const diary = sanitizeDiary(body?.diary);
  const { data: requestLog } = await supabase.from('ai_requests').insert({
    telegram_id: telegramId,
    user_id: user?.id || null,
    status: 'started',
    model: AGENT_NAME,
    mode: 'pending',
    prompt_chars: question.length
  }).select('id').single();
  const { count: activeCount } = await supabase.from('ai_requests').select('id', { count: 'exact', head: true })
    .eq('telegram_id', telegramId).in('status', ['started', 'completed']).gte('created_at', since.toISOString());
  if ((activeCount || 0) > dailyLimit) {
    await updateRequest(supabase, requestLog?.id, { status: 'rate_limited' });
    return json({ ok: false, error: 'daily_limit', limit: dailyLimit }, 429, corsHeaders);
  }

  const startedAt = performance.now();
  try {
    const agentBody = JSON.stringify({
      session_id: await pseudonymousSessionId(telegramId, agentSecret),
      question,
      age_months: ageMonths,
      diary
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = toHex(await hmac(new TextEncoder().encode(agentSecret), `${timestamp}.${agentBody}`));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 27000);
    const response = await fetch(agentUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Baby-Timestamp': timestamp,
        'X-Baby-Signature': signature
      },
      body: agentBody
    });
    clearTimeout(timeout);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.answer) throw new Error(`agent_${response.status}`);

    await updateRequest(supabase, requestLog?.id, {
      status: 'completed',
      model: String(result?.model || (result?.mode === 'knowledge' ? 'baby-knowledge' : AGENT_NAME)).slice(0, 120),
      mode: String(result?.mode || 'unknown').slice(0, 40),
      latency_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      input_tokens: Number(result?.usage?.input_tokens) || null,
      output_tokens: Number(result?.usage?.output_tokens) || null
    });
    return json({
      ok: true,
      request_id: requestLog?.id,
      answer: String(result.answer).slice(0, 8000),
      sources: Array.isArray(result.sources) ? result.sources.slice(0, 3) : [],
      mode: result.mode || 'unknown',
      remaining: Math.max(0, dailyLimit - (activeCount || 1))
    }, 200, corsHeaders);
  } catch (error) {
    await updateRequest(supabase, requestLog?.id, {
      status: 'failed',
      mode: 'unavailable',
      latency_ms: Math.max(0, Math.round(performance.now() - startedAt))
    });
    console.error('Baby Agent request failed', error instanceof Error ? error.message : 'unknown');
    return json({ ok: false, error: 'ai_unavailable' }, 502, corsHeaders);
  }
});

async function pseudonymousSessionId(telegramId: number, secret: string) {
  return toHex(await hmac(new TextEncoder().encode(secret), `telegram:${telegramId}`));
}

async function updateRequest(supabase: any, id: string | undefined, values: Record<string, unknown>) {
  if (id) await supabase.from('ai_requests').update(values).eq('id', id);
}

function buildCorsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://arseneleshaevwork-dotcom.github.io',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function json(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false };
  params.delete('hash');
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) return { ok: false };
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  const signature = toHex(await hmac(secret, check));
  if (!timingSafeEqual(signature, hash)) return { ok: false };
  try { return { ok: true, user: JSON.parse(params.get('user') || '{}') }; }
  catch (_) { return { ok: false }; }
}

async function hmac(key: Uint8Array, data: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
}

function toHex(value: Uint8Array) {
  return [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}
