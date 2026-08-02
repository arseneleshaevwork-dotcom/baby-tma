import { sha256Hex, timingSafeEqual } from './http.ts';

export async function authenticateAppRequest({ req, body, supabase, botToken }: {
  req: Request;
  body: any;
  supabase: any;
  botToken: string;
}) {
  const initData = String(body?.initData || body?.init_data || '');
  if (initData) {
    const verified = await verifyTelegramInitData(initData, botToken);
    if (!verified.ok || !verified.user?.id) return { ok: false, error: 'telegram_auth_failed' };
    const user = await upsertTelegramUser(supabase, verified.user);
    if (!user?.id) return { ok: false, error: 'user_upsert_failed' };
    return { ok: true, method: 'mini_app', telegramId: Number(verified.user.id), user, telegramUser: verified.user };
  }

  const authorization = req.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,200})$/);
  if (!match) return { ok: false, error: 'web_session_required' };
  const tokenHash = await sha256Hex(match[1]);
  const { data: session } = await supabase
    .from('web_sessions')
    .select('id,user_id,telegram_id,expires_at,revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: 'web_session_invalid' };
  }
  const { data: user } = await supabase
    .from('users')
    .select('id,telegram_id,username,first_name,language_code')
    .eq('id', session.user_id)
    .maybeSingle();
  if (!user || Number(user.telegram_id) !== Number(session.telegram_id)) return { ok: false, error: 'web_session_invalid' };
  await supabase.from('web_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id);
  return { ok: true, method: 'web_session', telegramId: Number(session.telegram_id), user };
}

export async function upsertTelegramUser(supabase: any, telegramUser: any) {
  const { data } = await supabase.from('users').upsert({
    telegram_id: Number(telegramUser.id),
    username: telegramUser.username || telegramUser.preferred_username || null,
    first_name: telegramUser.first_name || telegramUser.given_name || telegramUser.name || null,
    language_code: telegramUser.language_code || null,
    last_seen_at: new Date().toISOString()
  }, { onConflict: 'telegram_id' }).select('id,telegram_id,username,first_name,language_code').single();
  return data || null;
}

export async function verifyTelegramInitData(initData: string, botToken: string) {
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
