export const BILLING_PLANS = Object.freeze({
  month: { amountMinor: 34900, months: 1, label: 'Premium на 1 месяц' },
  quarter: { amountMinor: 89900, months: 3, label: 'Premium на 3 месяца' }
});

export function getBillingPlan(value) {
  const key = String(value || '');
  return key === 'month' || key === 'quarter' ? { key, ...BILLING_PLANS[key] } : null;
}

export function addBillingMonths(value, months) {
  const source = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(source.getTime())) throw new Error('invalid_billing_date');
  const day = source.getUTCDate();
  const result = new Date(source.getTime());
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function rubles(amountMinor) {
  return (Math.max(0, Math.round(amountMinor)) / 100).toFixed(2);
}

export function refundedAccessEnd(paymentStart, paymentEnd, subscriptionEnd) {
  const start = new Date(paymentStart || 0);
  const end = new Date(paymentEnd || 0);
  const current = new Date(subscriptionEnd || 0);
  if ([start, end, current].some(value => Number.isNaN(value.getTime()))) return null;
  if (start.getTime() > end.getTime()) return null;
  if (Math.abs(current.getTime() - end.getTime()) > 1000) return null;
  return start.toISOString();
}

export async function sealBillingSecret(value, secret) {
  if (!value || secret.length < 24) throw new Error('billing_encryption_not_configured');
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)
  ));
  return `${toBase64Url(iv)}.${toBase64Url(encrypted)}`;
}

export async function openBillingSecret(value, secret) {
  const [ivValue, encryptedValue] = String(value || '').split('.');
  if (!ivValue || !encryptedValue || secret.length < 24) throw new Error('billing_secret_invalid');
  const key = await deriveKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(ivValue) },
    key,
    fromBase64Url(encryptedValue)
  );
  return new TextDecoder().decode(decrypted);
}

async function deriveKey(secret) {
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toBase64Url(value) {
  let binary = '';
  value.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
