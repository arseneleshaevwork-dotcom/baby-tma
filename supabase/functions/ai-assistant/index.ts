import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { authenticateAppRequest } from '../_shared/auth.ts';
import { corsHeaders, isAllowedOrigin, json, readJsonBody } from '../_shared/http.ts';
import {
  AI_CONSENT_VERSION,
  FREE_DAILY_LIMIT,
  MAX_QUESTION_LENGTH,
  PREMIUM_DAILY_LIMIT,
  sanitizeAgeMonths,
  sanitizeDiaryForPlan,
  sanitizeQuestion
} from './policy.mjs';

const AGENT_NAME = 'baby-agent';
Deno.serve(async req => {
  const origin = req.headers.get('origin') || '';
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, headers);
  if (origin && !isAllowedOrigin(origin)) return json({ ok: false, error: 'origin_not_allowed' }, 403, headers);

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const agentUrl = Deno.env.get('BABY_AGENT_URL');
  const agentSecret = Deno.env.get('BABY_AGENT_SHARED_SECRET');
  if (!botToken || !supabaseUrl || !serviceRoleKey || !agentUrl || !agentSecret || agentSecret.length < 32) {
    return json({ ok: false, error: 'server_not_configured' }, 500, headers);
  }

  const parsedBody = await readJsonBody(req, 100_000);
  if (!parsedBody.ok) {
    return json({ ok: false, error: parsedBody.error }, parsedBody.error === 'payload_too_large' ? 413 : 400, headers);
  }
  const body = parsedBody.value;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const auth = await authenticateAppRequest({ req, body, supabase, botToken });
  if (!auth.ok) return json({ ok: false, error: auth.error || 'auth_failed' }, 401, headers);
  const telegramId = Number(auth.telegramId);
  const user = auth.user;

  if (body?.action === 'revoke_consent') {
    await supabase.from('ai_consents').upsert({
      telegram_id: telegramId,
      user_id: user?.id || null,
      consent_version: AI_CONSENT_VERSION,
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' });
    return json({ ok: true, consent: false }, 200, headers);
  }

  if (body?.action === 'feedback') {
    const requestId = String(body?.requestId || '');
    const rating = String(body?.rating || '');
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || !['helpful', 'not_helpful'].includes(rating)) {
      return json({ ok: false, error: 'invalid_feedback' }, 400, headers);
    }
    const { data, error } = await supabase.from('ai_requests').update({
      feedback: rating,
      feedback_at: new Date().toISOString()
    }).eq('id', requestId).eq('telegram_id', telegramId).eq('status', 'completed').select('id').maybeSingle();
    if (error) return json({ ok: false, error: 'feedback_failed' }, 500, headers);
    if (!data) return json({ ok: false, error: 'request_not_found' }, 404, headers);
    return json({ ok: true }, 200, headers);
  }

  if (body?.consent !== true) return json({ ok: false, error: 'consent_required' }, 403, headers);

  const question = sanitizeQuestion(body?.question);
  if (question.length < 2 || question.length > MAX_QUESTION_LENGTH) {
    return json({ ok: false, error: 'invalid_question' }, 400, headers);
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
  const { data: usageCount, error: quotaError } = await supabase.rpc('consume_ai_daily_quota', {
    p_telegram_id: telegramId,
    p_limit: dailyLimit
  });
  if (quotaError) return json({ ok: false, error: 'rate_limit_unavailable' }, 503, headers);
  if (!Number(usageCount)) return json({ ok: false, error: 'daily_limit', limit: dailyLimit }, 429, headers);

  const ageMonths = sanitizeAgeMonths(body?.ageMonths);
  const diary = sanitizeDiaryForPlan(body?.diary, Boolean(premium));
  const { data: requestLog, error: requestLogError } = await supabase.from('ai_requests').insert({
    telegram_id: telegramId,
    user_id: user?.id || null,
    status: 'started',
    model: AGENT_NAME,
    mode: 'pending',
    prompt_chars: question.length
  }).select('id').single();
  if (requestLogError || !requestLog?.id) return json({ ok: false, error: 'request_log_unavailable' }, 503, headers);
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
      remaining: Math.max(0, dailyLimit - Number(usageCount))
    }, 200, headers);
  } catch (error) {
    await updateRequest(supabase, requestLog?.id, {
      status: 'failed',
      mode: 'unavailable',
      latency_ms: Math.max(0, Math.round(performance.now() - startedAt))
    });
    console.error('Baby Agent request failed', error instanceof Error ? error.message : 'unknown');
    return json({ ok: false, error: 'ai_unavailable' }, 502, headers);
  }
});

async function pseudonymousSessionId(telegramId: number, secret: string) {
  return toHex(await hmac(new TextEncoder().encode(secret), `telegram:${telegramId}`));
}

async function updateRequest(supabase: any, id: string | undefined, values: Record<string, unknown>) {
  if (id) await supabase.from('ai_requests').update(values).eq('id', id);
}

async function hmac(key: Uint8Array, data: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
}

function toHex(value: Uint8Array) {
  return [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
