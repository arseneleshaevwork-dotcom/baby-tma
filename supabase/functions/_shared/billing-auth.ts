import { authenticateAppRequest } from './auth.ts';
import { hashGuestBillingKey, normalizeGuestBillingKey } from './guest-billing.mjs';

export async function authenticateBillingRequest({ req, body, supabase, botToken, createGuest = false }: {
  req: Request;
  body: any;
  supabase: any;
  botToken: string;
  createGuest?: boolean;
}) {
  const appAuth = await authenticateAppRequest({ req, body, supabase, botToken });
  if (appAuth.ok) return { ...appAuth, customerType: 'telegram' };

  const guestKey = normalizeGuestBillingKey(body?.guest_key);
  if (!guestKey) return appAuth;
  if (!req.headers.get('origin')) return { ok: false, error: 'guest_origin_required' };
  const tokenHash = await hashGuestBillingKey(guestKey);
  let guest: any = null;

  if (createGuest) {
    const { data, error } = await supabase.rpc('get_or_create_web_billing_guest_internal', { p_token_hash: tokenHash });
    if (error) return { ok: false, error: 'guest_identity_failed' };
    guest = Array.isArray(data) ? data[0] : data;
  } else {
    const { data } = await supabase.from('web_billing_guests')
      .select('id,user_id,billing_identity_id,linked_telegram_id')
      .eq('guest_token_hash', tokenHash)
      .maybeSingle();
    guest = data;
    if (guest?.id) {
      await supabase.from('web_billing_guests').update({ last_seen_at: new Date().toISOString() }).eq('id', guest.id);
    }
  }

  if (guest?.linked_telegram_id) return { ok: false, error: 'guest_already_linked' };
  const billingIdentityId = Number(guest?.billing_identity_id);
  if (!guest?.user_id || !Number.isSafeInteger(billingIdentityId) || billingIdentityId >= 0) {
    return { ok: false, error: 'guest_identity_not_found' };
  }
  return {
    ok: true,
    method: 'billing_guest',
    customerType: 'guest',
    telegramId: billingIdentityId,
    user: { id: guest.user_id },
    guestId: guest.id || guest.guest_id
  };
}
