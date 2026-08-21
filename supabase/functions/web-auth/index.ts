import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { authenticateAppRequest, upsertTelegramUser } from '../_shared/auth.ts';
import { corsHeaders, isAllowedOrigin, json, randomToken, readJsonBody, sha256Hex } from '../_shared/http.ts';
import { createCheckoutHandoff, verifyCheckoutHandoff } from './handoff.mjs';

const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
const TELEGRAM_JWKS_URL = 'https://oauth.telegram.org/.well-known/jwks.json';

Deno.serve(async req => {
  const headers = corsHeaders(req);
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, headers);
  if (origin && !isAllowedOrigin(origin)) return json({ ok: false, error: 'origin_not_allowed' }, 403, headers);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const clientId = Deno.env.get('TELEGRAM_LOGIN_CLIENT_ID') || String(botToken || '').split(':')[0];
  const handoffSecret = Deno.env.get('WEB_HANDOFF_SECRET');
  const webAppUrl = Deno.env.get('WEB_APP_URL') || 'https://arseneleshaevwork-dotcom.github.io/baby-tma/';
  if (!supabaseUrl || !serviceRoleKey || !botToken || !handoffSecret || handoffSecret.length < 32 || !/^\d+$/.test(clientId)) {
    return json({ ok: false, error: 'server_not_configured' }, 503, headers);
  }

  const parsedBody = await readJsonBody(req, 20_000);
  if (!parsedBody.ok) return json({ ok: false, error: parsedBody.error }, parsedBody.error === 'payload_too_large' ? 413 : 400, headers);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const body = parsedBody.value;
  const action = String(body?.action || 'session');

  if (action === 'handoff_create') {
    const auth = await authenticateAppRequest({ req, body, supabase, botToken });
    if (!auth.ok || auth.method !== 'mini_app') return json({ ok: false, error: auth.error || 'mini_app_required' }, 401, headers);
    const plan = String(body?.plan || '');
    if (!['month', 'quarter'].includes(plan)) return json({ ok: false, error: 'invalid_plan' }, 400, headers);
    const fingerprint = `handoff:${auth.telegramId}`;
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await supabase.from('web_login_nonces').select('id', { count: 'exact', head: true })
      .eq('request_fingerprint', fingerprint).gte('created_at', since);
    if ((count || 0) >= 6) return json({ ok: false, error: 'rate_limited' }, 429, headers);

    const nonce = randomToken(24);
    const handoff = await createCheckoutHandoff({
      secret: handoffSecret, userId: auth.user.id, telegramId: auth.telegramId, plan, nonce
    });
    const { error } = await supabase.from('web_login_nonces').insert({
      nonce_hash: await sha256Hex(handoff.token),
      request_fingerprint: fingerprint,
      expires_at: new Date(handoff.claims.exp * 1000).toISOString()
    });
    if (error) return json({ ok: false, error: 'handoff_create_failed' }, 500, headers);
    const target = new URL(webAppUrl);
    if (target.protocol !== 'https:' || !isAllowedOrigin(target.origin)) return json({ ok: false, error: 'web_app_url_invalid' }, 503, headers);
    target.searchParams.set('checkout', plan);
    target.searchParams.set('handoff', handoff.token);
    return json({ ok: true, web_url: target.toString(), plan, expires_at: new Date(handoff.claims.exp * 1000).toISOString() }, 200, headers);
  }

  if (action === 'handoff_consume') {
    const handoffToken = String(body?.handoff || '');
    const claims = await verifyCheckoutHandoff(handoffToken, handoffSecret);
    if (!claims) return json({ ok: false, error: 'handoff_invalid' }, 401, headers);
    const now = new Date().toISOString();
    const { data: consumed } = await supabase.from('web_login_nonces')
      .update({ used_at: now })
      .eq('nonce_hash', await sha256Hex(handoffToken))
      .is('used_at', null)
      .gt('expires_at', now)
      .select('id')
      .maybeSingle();
    if (!consumed) return json({ ok: false, error: 'handoff_used_or_expired' }, 401, headers);
    const { data: user } = await supabase.from('users')
      .select('id,telegram_id,username,first_name,language_code')
      .eq('id', claims.sub)
      .eq('telegram_id', claims.tid)
      .maybeSingle();
    if (!user) return json({ ok: false, error: 'handoff_user_invalid' }, 401, headers);
    const session = await issueWebSession(supabase, user);
    if (!session) return json({ ok: false, error: 'session_create_failed' }, 500, headers);
    await supabase.from('events').insert({
      event_name: 'web_login', user_id: user.id, telegram_id: claims.tid,
      payload: { method: 'mini_app_handoff', checkout_plan: claims.plan }
    });
    return json({ ok: true, ...session, user: publicUser(user), checkout_plan: claims.plan }, 200, headers);
  }

  if (action === 'nonce') {
    const fingerprint = await requestFingerprint(req);
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase.from('web_login_nonces').select('id', { count: 'exact', head: true })
      .eq('request_fingerprint', fingerprint).gte('created_at', since);
    if ((count || 0) >= 10) return json({ ok: false, error: 'rate_limited' }, 429, headers);

    const nonce = randomToken(24);
    const { error } = await supabase.from('web_login_nonces').insert({
      nonce_hash: await sha256Hex(nonce),
      request_fingerprint: fingerprint,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
    });
    if (error) return json({ ok: false, error: 'nonce_create_failed' }, 500, headers);
    return json({ ok: true, nonce, client_id: clientId }, 200, headers);
  }

  if (action === 'login') {
    const idToken = String(body?.id_token || '');
    const claims = await verifyTelegramIdToken(idToken, clientId);
    const telegramId = Number(claims?.id);
    if (!claims || !claims.sub || !Number.isSafeInteger(telegramId) || telegramId <= 0 || !claims.nonce) {
      return json({ ok: false, error: 'telegram_login_failed' }, 401, headers);
    }
    const nonceHash = await sha256Hex(String(claims.nonce));
    const now = new Date().toISOString();
    const { data: consumed } = await supabase.from('web_login_nonces')
      .update({ used_at: now })
      .eq('nonce_hash', nonceHash)
      .is('used_at', null)
      .gt('expires_at', now)
      .select('id')
      .maybeSingle();
    if (!consumed) return json({ ok: false, error: 'login_nonce_invalid' }, 401, headers);

    const user = await upsertTelegramUser(supabase, claims);
    if (!user?.id) return json({ ok: false, error: 'user_upsert_failed' }, 500, headers);
    const session = await issueWebSession(supabase, user);
    if (!session) return json({ ok: false, error: 'session_create_failed' }, 500, headers);

    await supabase.from('events').insert({
      event_name: 'web_login', user_id: user.id, telegram_id: telegramId, payload: { method: 'telegram_oidc' }
    });
    return json({
      ok: true,
      ...session,
      user: publicUser(user)
    }, 200, headers);
  }

  const auth = await authenticateAppRequest({ req, body, supabase, botToken });
  if (!auth.ok || auth.method !== 'web_session') return json({ ok: false, error: auth.error || 'web_session_required' }, 401, headers);

  if (action === 'logout') {
    const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    await supabase.from('web_sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', await sha256Hex(token));
    return json({ ok: true }, 200, headers);
  }

  const { data: baby } = await supabase.from('babies').select('name,birthdate,age_months')
    .eq('user_id', auth.user.id).maybeSingle();
  return json({ ok: true, user: publicUser(auth.user), baby: baby || null }, 200, headers);
});

function publicUser(user: any) {
  return {
    telegram_id: Number(user.telegram_id),
    username: user.username || '',
    first_name: user.first_name || ''
  };
}

async function issueWebSession(supabase: any, user: any) {
  const sessionToken = randomToken(48);
  const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
  const { error } = await supabase.from('web_sessions').insert({
    user_id: user.id,
    telegram_id: Number(user.telegram_id),
    token_hash: await sha256Hex(sessionToken),
    expires_at: expiresAt
  });
  if (error) return null;
  const now = new Date().toISOString();
  const { data: sessions } = await supabase.from('web_sessions')
    .select('id').eq('user_id', user.id).is('revoked_at', null).order('created_at', { ascending: false });
  const staleIds = (sessions || []).slice(5).map((item: any) => item.id);
  if (staleIds.length) await supabase.from('web_sessions').update({ revoked_at: now }).in('id', staleIds);
  return { session_token: sessionToken, expires_at: expiresAt };
}

async function requestFingerprint(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ua = String(req.headers.get('user-agent') || '').slice(0, 300);
  return sha256Hex(`${ip}|${ua}`);
}

async function verifyTelegramIdToken(token: string, clientId: string) {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 12_000) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    if (header.alg !== 'RS256' || !header.kid) return null;
    const response = await fetch(TELEGRAM_JWKS_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const jwks = await response.json();
    const jwk = Array.isArray(jwks?.keys) ? jwks.keys.find((key: any) => key.kid === header.kid && key.kty === 'RSA') : null;
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    );
    const signatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, base64UrlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud || '')];
    if (!signatureValid || claims.iss !== TELEGRAM_ISSUER || !audiences.includes(String(clientId))) return null;
    if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= now) return null;
    if (!Number.isFinite(Number(claims.iat)) || Math.abs(now - Number(claims.iat)) > 3600) return null;
    return claims;
  } catch (_) {
    return null;
  }
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
