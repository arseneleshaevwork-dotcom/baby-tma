const DEFAULT_ORIGINS = [
  'https://arseneleshaevwork-dotcom.github.io'
];

export function allowedOrigins() {
  const configured = String(Deno.env.get('APP_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ORIGINS);
}

export function isAllowedOrigin(origin: string) {
  if (!origin) return true;
  if (allowedOrigins().has(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin)
      ? origin
      : 'https://arseneleshaevwork-dotcom.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}

export function json(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function readJsonBody(req: Request, maxBytes = 20_000) {
  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false as const, error: 'payload_too_large' };
  }
  let raw = '';
  try {
    raw = await req.text();
  } catch (_) {
    return { ok: false as const, error: 'invalid_json' };
  }
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false as const, error: 'payload_too_large' };
  }
  if (!raw.trim()) return { ok: true as const, value: {} };
  try {
    return { ok: true as const, value: JSON.parse(raw) };
  } catch (_) {
    return { ok: false as const, error: 'invalid_json' };
  }
}

export function clientAddress(req: Request) {
  const cloudflare = String(req.headers.get('cf-connecting-ip') || '').trim();
  if (cloudflare) return cloudflare.slice(0, 100);
  const forwarded = String(req.headers.get('x-forwarded-for') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return (forwarded[forwarded.length - 1] || 'unknown').slice(0, 100);
}

export function timingSafeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

export async function sha256Hex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(value);
}

function base64Url(value: Uint8Array) {
  let binary = '';
  value.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
