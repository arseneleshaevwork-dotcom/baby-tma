const ALLOWED_PLANS = new Set(['month', 'quarter']);
const MAX_LIFETIME_SECONDS = 10 * 60;

export async function createCheckoutHandoff({ secret, userId, telegramId, plan, nonce, nowSeconds = currentSeconds() }) {
  if (!secret || !isUuid(userId) || !isTelegramId(telegramId) || !ALLOWED_PLANS.has(plan) || !isNonce(nonce)) {
    throw new Error('invalid_handoff_claims');
  }
  const claims = {
    v: 1,
    sub: userId,
    tid: Number(telegramId),
    plan,
    nonce,
    iat: nowSeconds,
    exp: nowSeconds + MAX_LIFETIME_SECONDS
  };
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await sign(secret, payload);
  return { token: `${payload}.${signature}`, claims };
}

export async function verifyCheckoutHandoff(token, secret, nowSeconds = currentSeconds()) {
  if (!secret || typeof token !== 'string' || token.length > 2400) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = await sign(secret, parts[0]);
  if (!timingSafeEqual(expected, parts[1])) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    if (claims?.v !== 1 || !isUuid(claims.sub) || !isTelegramId(claims.tid)) return null;
    if (!ALLOWED_PLANS.has(claims.plan) || !isNonce(claims.nonce)) return null;
    if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) return null;
    if (claims.iat > nowSeconds + 60 || claims.exp <= nowSeconds) return null;
    if (claims.exp - claims.iat !== MAX_LIFETIME_SECONDS) return null;
    return claims;
  } catch (_) {
    return null;
  }
}

async function sign(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function isTelegramId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0;
}

function isNonce(value) {
  return /^[A-Za-z0-9_-]{24,160}$/.test(String(value || ''));
}

function timingSafeEqual(a, b) {
  if (!a || a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

function base64UrlEncode(value) {
  let binary = '';
  value.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function currentSeconds() {
  return Math.floor(Date.now() / 1000);
}
