const GUEST_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function normalizeGuestBillingKey(value) {
  const key = String(value || '').trim();
  return GUEST_KEY_PATTERN.test(key) ? key : '';
}

export async function hashGuestBillingKey(value) {
  const key = normalizeGuestBillingKey(value);
  if (!key) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
